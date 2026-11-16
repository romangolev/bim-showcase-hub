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


THEME_TOGGLE = re.compile(r"Switch to (light|dark) theme", re.I)
SUMMARY_TOGGLE = re.compile(r"(Collapse|Expand) .*summary", re.I)
TREE_TOGGLE = re.compile(r"(Collapse|Expand) document tree", re.I)
VIEWER_WIDTH = "() => document.querySelector('.model-viewer').getBoundingClientRect().width"
SCENE_FIT_WIDTH = "() => Number(document.querySelector('.bsh-mock__scene')?.dataset.fitWidth || 0)"
ROOT_THEME = "() => document.documentElement.dataset.theme"


def settle(page, ms=700):
    page.wait_for_timeout(ms)


def viewer_width(page):
    return page.evaluate(VIEWER_WIDTH)


def check_theme(page, checks):
    start = page.evaluate(ROOT_THEME)
    other = "light" if start == "dark" else "dark"
    toggle = page.get_by_role("button", name=THEME_TOGGLE).first
    toggle.click()
    settle(page, 300)
    checks.add("theme toggle flips the theme", page.evaluate(ROOT_THEME) == other, page.evaluate(ROOT_THEME))
    page.reload(wait_until="networkidle")
    settle(page)
    checks.add("theme choice persists across reload", page.evaluate(ROOT_THEME) == other, page.evaluate(ROOT_THEME))
    page.get_by_role("button", name=THEME_TOGGLE).first.click()
    settle(page, 300)
    checks.add("theme toggle flips back", page.evaluate(ROOT_THEME) == start, page.evaluate(ROOT_THEME))
    page.reload(wait_until="networkidle")
    settle(page)
    checks.add("original theme persists across reload", page.evaluate(ROOT_THEME) == start, page.evaluate(ROOT_THEME))


def check_summary_rail(page, checks):
    toggle = page.get_by_role("button", name=SUMMARY_TOGGLE).first
    before = viewer_width(page)
    toggle.click()
    settle(page)
    collapsed = viewer_width(page)
    checks.add("collapsing the summary widens the viewer", collapsed > before + 20, f"{before} -> {collapsed}")
    page.get_by_role("button", name=SUMMARY_TOGGLE).first.click()
    settle(page)
    restored = viewer_width(page)
    checks.add("expanding the summary restores the viewer width", abs(restored - before) <= 2, f"{before} -> {restored}")


def check_tree_resize(page, checks):
    toggle = page.get_by_role("button", name=TREE_TOGGLE).first
    before = viewer_width(page)
    toggle.click()
    settle(page, 1000)
    after = viewer_width(page)
    fit = page.evaluate(SCENE_FIT_WIDTH)
    checks.add("collapsing the tree widens the viewer", after > before + 20, f"{before} -> {after}")
    checks.add("viewer fits its new container", abs(fit - after) <= 2, f"scene {fit}, container {after}")
    page.get_by_role("button", name=TREE_TOGGLE).first.click()
    settle(page, 1000)


def run_interaction_checks(page, checks):
    for check in (check_theme, check_summary_rail, check_tree_resize):
        try:
            check(page, checks)
        except Exception as exc:
            checks.add(check.__name__, False, f"{type(exc).__name__}: {str(exc)[:160]}")


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

    run_interaction_checks(page, checks)

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
