import re
import sys

from camoufox.sync_api import Camoufox
from common import (
    BASE_URL,
    DESKTOP,
    EXIT_NOT_SIGNED_IN,
    OUTPUT_DIR,
    PROFILE_DIR,
    XLSX_MAGIC,
    Checks,
    api_get,
    app_reachable,
    download_export,
    horizontal_overflow,
    main_canvas_width,
    new_notes,
    wait_for_canvas_width,
    watch,
    wrapped_count_cells,
)

CALL_BUDGET = 40
MODEL_EXTENSIONS = (".rvt", ".nwd", ".nwc", ".ifc", ".dwg")
VIEWER_TIMEOUT_MS = 60000
VIEWER_SETTLE_MS = 15000


def list_of(context, path):
    status, body = api_get(context, path)
    return body if status == 200 and isinstance(body, list) else None


def find_viewable(context):
    calls = 0
    hubs = list_of(context, "/api/hubs") or []
    for hub in hubs:
        projects = list_of(context, f"/api/hubs/{hub['id']}/projects")
        calls += 1
        for project in (projects or [])[:6]:
            top = list_of(context, f"/api/hubs/{hub['id']}/projects/{project['id']}/folders")
            calls += 1
            queue = [
                (project["id"], f["id"], [hub["name"], project["name"], f["name"]])
                for f in top or []
            ]
            while queue and calls < CALL_BUDGET:
                pid, fid, crumbs = queue.pop(0)
                contents = list_of(context, f"/api/projects/{pid}/folders/{fid}/contents")
                calls += 1
                if contents is None:
                    continue
                queue.extend(
                    (pid, n["id"], crumbs + [n["name"]])
                    for n in contents
                    if n["kind"] == "folder"
                )
                items = [
                    n
                    for n in contents
                    if n["kind"] == "item" and n["name"].lower().endswith(MODEL_EXTENSIONS)
                ]
                for item in items[:4]:
                    versions = list_of(context, f"/api/projects/{pid}/items/{item['id']}/versions")
                    calls += 1
                    for version in versions or []:
                        if version.get("viewable") and version.get("urn"):
                            return {"urn": version["urn"], "file": item["name"], "crumbs": crumbs}
    return None


def open_in_tree(page, found):
    for depth, name in enumerate(found["crumbs"] + [found["file"]], start=1):
        row = page.locator(f"[role=treeitem][aria-level='{depth}']", has_text=name).first
        row.wait_for(timeout=15000)
        if row.get_attribute("aria-expanded") != "true":
            row.click()
            page.keyboard.press("ArrowRight")
        page.wait_for_timeout(1500)
    version_row = page.locator("[role=treeitem][data-viewable=true]").first
    version_row.wait_for(timeout=15000)
    version_row.click()
    page.wait_for_url(re.compile(r"/model/"), timeout=15000)


def run_model_checks(page, checks, found):
    try:
        open_in_tree(page, found)
        checks.add("tree click opens the model route", "/model/" in page.url)
    except Exception as exc:
        checks.add("tree click opens the model route", False, f"{type(exc).__name__}: {str(exc)[:160]}")
        page.goto(f"{BASE_URL}/model/{found['urn']}", wait_until="domcontentloaded")
    page.wait_for_timeout(2000)
    checks.add("document title names the file", found["file"] in page.title(), page.title())
    checks.add("breadcrumb is shown", page.locator("nav[aria-label^='Breadcrumb']").count() == 1)
    try:
        page.wait_for_selector(".adsk-viewing-viewer", timeout=VIEWER_TIMEOUT_MS)
        page.wait_for_timeout(VIEWER_SETTLE_MS)
        checks.add("autodesk viewer is mounted", True)
    except Exception:
        checks.add("autodesk viewer is mounted", False, f"no viewer element within {VIEWER_TIMEOUT_MS // 1000}s")
    checks.add("viewer toolbar is present", page.locator(".adsk-toolbar").count() >= 1)
    checks.add("tool group is in the native toolbar", page.locator(".adsk-toolbar #paint, .adsk-toolbar #export-xlsx").count() >= 2)
    page.screenshot(path=str(OUTPUT_DIR / "02-model.png"))
    rows = page.locator("table tbody tr").count()
    checks.add("summary has rows", rows > 0, rows)
    wrapped = wrapped_count_cells(page)
    checks.add("summary counts never wrap", wrapped == 0, f"{wrapped} wrapped cells")
    checks.add("page has no horizontal overflow", horizontal_overflow(page) <= 0)
    try:
        target = OUTPUT_DIR / "export.xlsx"
        size, magic = download_export(page, target)
        checks.add("excel export downloads an xlsx", size > 1000 and magic == XLSX_MAGIC, f"{size} bytes")
    except Exception as exc:
        checks.add("excel export downloads an xlsx", False, f"{type(exc).__name__}: {str(exc)[:160]}")
    page.screenshot(path=str(OUTPUT_DIR / "03-after-export.png"))
    check_canvas_follows_summary(page, checks)


def check_canvas_follows_summary(page, checks):
    toggle = page.locator(".model-summary button.bsh-summary__toggle").first
    try:
        before = main_canvas_width(page)
        toggle.click(timeout=8000)
        grown = wait_for_canvas_width(page, lambda w: w > before + 20)
        checks.add("canvas grows when the summary collapses", grown > before + 20, f"{before:.0f} -> {grown:.0f}")
        page.screenshot(path=str(OUTPUT_DIR / "04-summary-collapsed.png"))
        toggle.click(timeout=8000)
        shrunk = wait_for_canvas_width(page, lambda w: w < grown - 20)
        checks.add("canvas shrinks when the summary reopens", shrunk < grown - 20, f"{grown:.0f} -> {shrunk:.0f}")
    except Exception as exc:
        checks.add("canvas follows the summary panel", False, f"{type(exc).__name__}: {str(exc)[:160]}")


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    checks = Checks()
    notes = new_notes()
    with Camoufox(
        headless=False,
        persistent_context=True,
        user_data_dir=str(PROFILE_DIR),
        window=DESKTOP,
    ) as context:
        if not app_reachable(context):
            checks.add("app is reachable", False, f"{BASE_URL}/api/health did not return 200")
            return checks.finish(notes)
        status, _ = api_get(context, "/api/session")
        if status != 200:
            print(f"Not signed in (status {status}). Run signin.py first, or sign in again if the session expired.", file=sys.stderr)
            return EXIT_NOT_SIGNED_IN
        checks.add("session is signed in", True)
        status, health = api_get(context, "/api/health")
        checks.add("health reports real APS", status == 200 and isinstance(health, dict) and health.get("mock") is False, health)
        status, token = api_get(context, "/api/viewer/token")
        checks.add("viewer token issued", status == 200 and isinstance(token, dict) and bool(token.get("access_token")), f"status {status}")
        found = find_viewable(context)
        checks.add("a viewable model exists", found is not None, "none found within the API call budget")

        page = context.pages[0] if context.pages else context.new_page()
        watch(page, notes)
        page.goto(BASE_URL, wait_until="networkidle")
        page.wait_for_timeout(1500)
        checks.add("tree lists hubs", page.locator("[role=treeitem]").count() >= 1)
        page.screenshot(path=str(OUTPUT_DIR / "01-home.png"))
        if found:
            run_model_checks(page, checks, found)
        checks.add("no uncaught page errors", not notes["page_errors"], notes["page_errors"][:2])
        checks.add("no failed app requests", not notes["failed_requests"], notes["failed_requests"][:3])
    return checks.finish(notes)


if __name__ == "__main__":
    sys.exit(main())
