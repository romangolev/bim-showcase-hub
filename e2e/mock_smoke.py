import re
import sys

from camoufox.sync_api import Camoufox
from common import (
    BASE_URL,
    DESKTOP,
    MOBILE,
    OUTPUT_DIR,
    XLSX_MAGIC,
    Checks,
    api_get,
    app_reachable,
    download_export,
    expand_to_viewable,
    horizontal_overflow,
    new_notes,
    watch,
    wrapped_count_cells,
)

MOCK_USER_NAME = "Alex Rivera"
APP_NAME = "BIM Showcase Hub"
MOCK_VIEWER_LABEL = "Mock building model"


def run(context, checks, notes):
    page = context.new_page()
    watch(page, notes)
    status, session = api_get(context, "/api/session")
    checks.add(
        "session is the mock user",
        status == 200 and session.get("name") == MOCK_USER_NAME,
        session,
    )
    status, health = api_get(context, "/api/health")
    checks.add("health reports mock mode", status == 200 and health.get("mock") is True, health)

    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    page.goto(BASE_URL, wait_until="networkidle")
    checks.add(
        "app shows the signed-in user",
        page.get_by_role("button", name=re.compile(MOCK_USER_NAME)).count() == 1,
    )
    checks.add("tree lists hubs", page.locator("[role=treeitem][aria-level='1']").count() >= 1)

    try:
        version_row = expand_to_viewable(page)
        version_row.click()
        page.wait_for_url(re.compile(r"/model/"), timeout=15000)
        checks.add("tree opens a viewable version", True)
    except Exception as exc:
        checks.add("tree opens a viewable version", False, f"{type(exc).__name__}: {str(exc)[:160]}")
        return

    page.wait_for_timeout(2500)
    title = page.title()
    checks.add("document title names the model", title.endswith(APP_NAME) and title != APP_NAME, title)
    crumbs = page.locator("nav[aria-label^='Breadcrumb']")
    label = crumbs.get_attribute("aria-label") if crumbs.count() == 1 else ""
    checks.add("breadcrumb shows the hub path", " / " in (label or ""), label)
    checks.add("mock viewer is present", page.get_by_label(MOCK_VIEWER_LABEL).count() >= 1)

    rows = page.locator("table tbody tr")
    try:
        rows.first.wait_for(timeout=15000)
    except Exception:
        pass
    checks.add("summary has rows", rows.count() > 0, rows.count())
    wrapped = wrapped_count_cells(page)
    checks.add("summary counts never wrap", wrapped == 0, f"{wrapped} wrapped cells")

    try:
        size, magic = download_export(page, OUTPUT_DIR / "export.xlsx")
        checks.add("export downloads a non-empty xlsx", size > 1000 and magic == XLSX_MAGIC, f"{size} bytes")
    except Exception as exc:
        checks.add("export downloads a non-empty xlsx", False, f"{type(exc).__name__}: {str(exc)[:160]}")

    for name, (width, height) in (("desktop", DESKTOP), ("mobile", MOBILE)):
        page.set_viewport_size({"width": width, "height": height})
        page.wait_for_timeout(600)
        overflow = horizontal_overflow(page)
        checks.add(f"no horizontal overflow at {width}x{height}", overflow <= 0, f"{overflow}px")
        page.screenshot(path=str(OUTPUT_DIR / f"mock-{name}.png"))

    checks.add("no uncaught page errors", not notes["page_errors"], notes["page_errors"][:2])


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    checks = Checks()
    notes = new_notes()
    with Camoufox(headless=True) as browser:
        context = browser.new_context(viewport={"width": DESKTOP[0], "height": DESKTOP[1]})
        if not app_reachable(context):
            checks.add("app is reachable", False, f"{BASE_URL}/api/health did not return 200; start npm run dev:mock")
            return checks.finish(notes, "mock-report.json")
        run(context, checks, notes)
        context.close()
    return checks.finish(notes, "mock-report.json")


if __name__ == "__main__":
    sys.exit(main())
