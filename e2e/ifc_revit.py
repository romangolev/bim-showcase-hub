import sys
import time

from camoufox.sync_api import Camoufox

from common import (
    DESKTOP,
    HEADLESS,
    HOST_OS,
    OUTPUT_DIR,
    Checks,
    ifc_check,
    new_notes,
)
from glb_revit import (
    IGNORED_CONSOLE,
    READY,
    URN,
    VIEWER_TIMEOUT_MS,
    HarnessServer,
    aps_token,
    bundle,
    load_env,
    manifest,
)

REPORT = "ifc-revit-report.json"
STOREY_SHARE_FLOOR = 0.08
VIEWER_ELEMENTS = """mw: () => {
    const fragments = window.viewer.model.getFragmentList();
    const ids = new Set();
    for (let i = 0; i < fragments.getCount(); i += 1) {
        const found = fragments.getDbIds(i);
        const list = Array.isArray(found) ? found : [found];
        for (const id of list) if (typeof id === 'number') ids.add(id);
    }
    return ids.size;
}"""


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    checks = Checks()
    notes = new_notes()
    try:
        auth = aps_token(load_env())
    except Exception as error:
        checks.add("APS two-legged token", False, f"{type(error).__name__}: {error}")
        return checks.finish(notes, REPORT)
    token = auth.get("access_token")
    checks.add("APS two-legged token", bool(token), f"expires in {auth.get('expires_in')}s")
    if not token:
        return checks.finish(notes, REPORT)

    status, body = manifest(token)
    derivative = body.get("status") if isinstance(body, dict) else None
    checks.add(
        "the Revit model has a completed translation",
        status == 200 and derivative == "success",
        f"HTTP {status}, status {derivative}. Set E2E_REVIT_URN to a translated Revit model your APS app can read.",
    )
    notes["urn"] = URN
    if status != 200 or derivative != "success":
        return checks.finish(notes, REPORT)

    bundle_path = bundle()
    checks.add("the exporter bundle builds", bundle_path.stat().st_size > 1000, f"{bundle_path.stat().st_size} bytes")
    server = HarnessServer(token, bundle_path)
    try:
        with Camoufox(headless=HEADLESS, os=HOST_OS, main_world_eval=True) as browser:
            page = browser.new_page(viewport={"width": DESKTOP[0], "height": DESKTOP[1]})
            page.on(
                "console",
                lambda message: message.type == "error"
                and not any(item in message.text for item in IGNORED_CONSOLE)
                and notes["console_errors"].append(message.text[:200]),
            )
            page.on("pageerror", lambda error: notes["page_errors"].append(str(error)[:200]))
            page.goto(f"{server.url}?urn={URN}", wait_until="load", timeout=60_000)
            started = time.time()
            metrics = None
            while time.time() - started < VIEWER_TIMEOUT_MS / 1000:
                metrics = page.evaluate(READY)
                if metrics:
                    break
                page.wait_for_timeout(1000)
            checks.add(
                "the Revit model opens in the viewer",
                bool(metrics) and (metrics.get("fragments") or 0) > 100,
                f"{round(time.time() - started, 1)}s, {metrics}",
            )
            if not metrics:
                return checks.finish(notes, REPORT)
            expected = page.evaluate(VIEWER_ELEMENTS)
            notes["viewer_elements"] = expected
            ifc_path = OUTPUT_DIR / "revit.ifc"
            try:
                with page.expect_download(timeout=180_000) as download_info:
                    page.locator("#export-ifc").click(timeout=8_000)
                download_info.value.save_as(str(ifc_path))
                size, head = ifc_path.stat().st_size, ifc_path.read_bytes()[:13]
                checks.add(
                    "the exporter downloads an IFC",
                    size > 1_000_000 and head == b"ISO-10303-21;",
                    f"{size} bytes",
                )
                info = ifc_check(checks, ifc_path, "Revit IFC", expected_elements=expected or 0, min_storey_share=STOREY_SHARE_FLOOR)
                if info:
                    notes["ifc"] = info
                    checks.add(
                        "the IFC carries the whole model",
                        info["elements"] >= 100 and info["storeys"] >= 3,
                        f"{info['elements']} elements in {info['storeys']} storeys",
                    )
            except Exception as error:
                checks.add(
                    "the exporter downloads an IFC",
                    False,
                    f"{type(error).__name__}: {str(error)[:200]}",
                )
            notes["export_status"] = page.evaluate("mw: () => window.__bshIfcStatus")
            checks.add("no uncaught page errors", not notes["page_errors"], notes["page_errors"][:2])
            checks.add(
                "no console errors from the app",
                not notes["console_errors"],
                notes["console_errors"][:2],
            )
    finally:
        server.close()
    return checks.finish(notes, REPORT)


if __name__ == "__main__":
    sys.exit(main())
