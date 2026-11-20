import json
import os
import re
import sys
import time

from camoufox.sync_api import Camoufox
from common import (
    BASE_URL,
    DESKTOP,
    HEADLESS,
    HOST_OS,
    OUTPUT_DIR,
    app_reachable,
    expand_to_viewable,
)

STEP_TIMEOUT_MS = 180000
LOAD_TIMEOUT_MS = 300000
LEGEND = re.compile("^Legend for ")

MONITOR = """mw:(() => {
  window.__bshGaps = [];
  let last = performance.now();
  const tick = (now) => { window.__bshGaps.push(now - last); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return true;
})()"""

CLONE = """mw:(() => {
  const rows = window.__bshMeasureRows?.() ?? [];
  const start = performance.now();
  structuredClone(rows);
  return { rows: rows.length, ms: Number((performance.now() - start).toFixed(2)) };
})()"""


def worst_gap(page):
    return page.evaluate(
        "mw:(() => { const g = window.__bshGaps.splice(0); return g.length ? Math.max(...g) : 0; })()"
    )


def measure(page, run):
    worst_gap(page)
    start = time.monotonic()
    detail = run()
    result = {
        "seconds": round(time.monotonic() - start, 2),
        "worst_frame_ms": round(worst_gap(page)),
    }
    if detail:
        result["detail"] = detail
    return result


def record(result, key, page, run):
    try:
        result[key] = measure(page, run)
    except Exception as exc:
        result[key] = {"error": f"{type(exc).__name__}: {str(exc)[:200]}", "seconds": None}


def open_command(page, text):
    page.keyboard.press("Control+k")
    dialog = page.get_by_role("dialog", name="Command palette")
    dialog.wait_for(state="visible", timeout=5000)
    dialog.get_by_role("combobox").fill(text)
    page.keyboard.press("Enter")
    dialog.wait_for(state="hidden", timeout=5000)


def open_first_model(page):
    version_row = expand_to_viewable(page)
    version_row.click()
    page.wait_for_url(re.compile(r"/model/"), timeout=STEP_TIMEOUT_MS)
    page.locator("table tbody tr").first.wait_for(timeout=LOAD_TIMEOUT_MS)


def refresh_dashboard(page):
    page.get_by_role("button", name="Refresh").first.click()
    page.locator(".bsh-chart canvas").first.wait_for(state="visible", timeout=STEP_TIMEOUT_MS)


def color_the_model(page):
    open_command(page, "Open Colors")
    pane = page.locator(".pane-colors")
    pane.wait_for(state="visible", timeout=STEP_TIMEOUT_MS)
    pane.get_by_role("button", name="Color the model").click()
    pane.get_by_role("list", name=LEGEND).wait_for(state="visible", timeout=STEP_TIMEOUT_MS)


def export_from_pane(page):
    open_command(page, "Open Export pane")
    preview = page.locator("table[aria-label='Export preview']")
    preview.wait_for(state="visible", timeout=STEP_TIMEOUT_MS)
    pane = page.locator(".pane-export")
    scope = pane if pane.count() else preview.locator(
        "xpath=ancestor::*[contains(@class, 'dv-groupview')][1]"
    )
    target = OUTPUT_DIR / "measure-export.xlsx"
    with page.expect_download(timeout=STEP_TIMEOUT_MS) as download_info:
        scope.get_by_role("button", name="Export", exact=True).click()
    download_info.value.save_as(str(target))
    return {"name": download_info.value.suggested_filename, "bytes": target.stat().st_size}


def run(context, result):
    page = context.new_page()
    page.on("dialog", lambda dialog: dialog.accept())
    page.goto(
        os.environ.get("E2E_MEASURE_URL", f"{BASE_URL}/"),
        wait_until="networkidle",
    )
    if not os.environ.get("E2E_MEASURE_URL"):
        open_first_model(page)
    else:
        page.locator("table tbody tr").first.wait_for(timeout=LOAD_TIMEOUT_MS)
    page.evaluate(MONITOR)
    result["clone"] = page.evaluate(CLONE)
    record(result, "dashboard_refresh", page, lambda: refresh_dashboard(page))
    record(result, "colors", page, lambda: color_the_model(page))
    record(result, "excel_export", page, lambda: export_from_pane(page))


def main():
    profile = os.environ.get("E2E_PROFILE_DIR")
    options = {
        "headless": HEADLESS,
        "os": HOST_OS,
        "main_world_eval": True,
    }
    result = {"base_url": BASE_URL, "measure_url": os.environ.get("E2E_MEASURE_URL")}
    if profile:
        with Camoufox(
            persistent_context=True,
            user_data_dir=profile,
            window=DESKTOP,
            **options,
        ) as context:
            if not app_reachable(context):
                print(f"Cannot reach {BASE_URL}. Start the app or set E2E_BASE_URL.", file=sys.stderr)
                return 1
            run(context, result)
    else:
        with Camoufox(**options) as browser:
            context = browser.new_context(
                viewport={"width": DESKTOP[0], "height": DESKTOP[1]}
            )
            if not app_reachable(context):
                print(f"Cannot reach {BASE_URL}. Start the app or set E2E_BASE_URL.", file=sys.stderr)
                context.close()
                return 1
            run(context, result)
            context.close()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "measure-rows.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
