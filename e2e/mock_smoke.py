import re
import sys

from camoufox.sync_api import Camoufox
from common import (
    BASE_URL,
    DESKTOP,
    HOST_OS,
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
GROUPS = """() => Object.fromEntries([...document.querySelectorAll('.dv-groupview')].map((group) => {
    const box = group.getBoundingClientRect();
    return [group.querySelector('.model-viewer') ? 'Viewer' : group.getAttribute('aria-label'), {
        left: box.left, top: box.top, right: box.right, bottom: box.bottom,
        floating: Boolean(group.closest('.dv-resize-container')),
    }];
}))"""
TAG_VIEWER = "() => { const el = document.querySelector('.bsh-mock'); if (el) el.dataset.e2eTag = 'kept'; return Boolean(el); }"
VIEWER_KEPT = "() => document.querySelector('.bsh-mock')?.dataset.e2eTag === 'kept'"
VIEWER_FITS = """() => {
    const box = document.querySelector('.model-viewer')?.getBoundingClientRect();
    const fit = Number(document.querySelector('.bsh-mock__scene')?.dataset.fitWidth || 0);
    return box ? Math.abs(box.width - fit) : 999;
}"""
VIEWER_TAB = """() => {
    const panel = document.querySelector('.model-viewer')?.closest('.dv-groupview');
    const tab = panel?.querySelector('.dv-tab.dv-active-tab');
    return tab ? {text: tab.textContent.trim(), title: tab.querySelector('[title]')?.getAttribute('title') || ''} : null;
}"""
VIEWER_FILL = """() => {
    const canvas = document.querySelector('.model-viewer')?.getBoundingClientRect();
    const slot = document.querySelector('.model-viewer')?.closest('.pane-slot')?.getBoundingClientRect();
    const main = document.querySelector('.model-viewer')?.closest('.pane-main');
    if (!canvas || !slot || !main) return null;
    return {
        canvasWidth: canvas.width, canvasHeight: canvas.height,
        slotWidth: slot.width, slotHeight: slot.height,
        text: main.innerText,
        header: Boolean(document.querySelector('.model-head, .urn-control, .model-title, .crumbs')),
        breadcrumb: document.querySelectorAll("nav[aria-label^='Breadcrumb']").length,
    };
}"""
STACKED_LABEL = "() => document.querySelector('.stack__label')?.textContent || ''"
STORED_LAYOUT = "() => JSON.parse(localStorage.getItem('bsh.layout.v1') || 'null')"


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


def groups(page):
    return page.evaluate(GROUPS)


def pane_menu(page, title, item):
    page.get_by_role("button", name=f"{title} pane options").click()
    page.get_by_role("menuitem", name=item).click()
    settle(page)


def default_arrangement(found):
    tree, viewer = found.get("Documents"), found.get("Viewer")
    summary, dashboard = found.get("Model summary"), found.get("Dashboard")
    if not all((tree, viewer, summary, dashboard)):
        return False
    return (
        tree["right"] <= viewer["left"]
        and summary["left"] >= viewer["right"]
        and dashboard["top"] >= viewer["bottom"]
        and abs(dashboard["left"] - viewer["left"]) <= 2
    )


def pointer_drag(page, source, target_x, target_y):
    box = source.bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.mouse.down()
    for step in range(1, 13):
        x = box["x"] + (target_x - box["x"]) * step / 12
        y = box["y"] + (target_y - box["y"]) * step / 12
        page.mouse.move(x, y)
        page.wait_for_timeout(30)
    page.mouse.up()
    settle(page)


def check_layout(page, checks, notes):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page)
    checks.add("dock layout is shown on wide screens", page.locator(".dv-dockview").count() == 1)
    checks.add("default layout: tree left, summary right, dashboard below the viewer", default_arrangement(groups(page)), groups(page))
    checks.add("viewer element can be tagged", page.evaluate(TAG_VIEWER))

    pane_menu(page, "Dashboard", "Move right")
    found = groups(page)
    checks.add(
        "pane menu moves the dashboard to the right edge",
        found["Dashboard"]["left"] >= found["Model summary"]["right"],
        found,
    )
    pane_menu(page, "Viewer", "Float")
    found = groups(page)
    checks.add("pane menu floats the viewer", found.get("Viewer", {}).get("floating") is True, found)
    checks.add("floating viewer is not remounted", page.evaluate(VIEWER_KEPT))
    checks.add("floating viewer fits its container", page.evaluate(VIEWER_FITS) <= 2, page.evaluate(VIEWER_FITS))
    pane_menu(page, "Viewer", "Dock")
    checks.add("pane menu docks the viewer again", groups(page).get("Viewer", {}).get("floating") is False)
    checks.add("docked viewer is not remounted", page.evaluate(VIEWER_KEPT))

    stored = page.evaluate(STORED_LAYOUT)
    checks.add("layout is saved as version 1", bool(stored) and stored.get("version") == 1, str(stored)[:120])
    page.reload(wait_until="networkidle")
    settle(page, 2000)
    found = groups(page)
    checks.add(
        "layout persists across reload",
        "Dashboard" in found and found["Dashboard"]["left"] >= found["Model summary"]["right"],
        found,
    )
    page.evaluate(TAG_VIEWER)

    dashboard_tab = page.get_by_role("tab", name="Dashboard")
    viewer_box = page.locator(".dv-groupview:has(.model-viewer) .dv-content-container").bounding_box()
    before = groups(page)["Dashboard"]
    pointer_drag(page, dashboard_tab, viewer_box["x"] + 24, viewer_box["y"] + viewer_box["height"] / 2)
    after = groups(page).get("Dashboard")
    dragged = bool(after) and after["right"] <= groups(page)["Viewer"]["left"] + 2
    if dragged:
        checks.add("pointer drag docks the dashboard left of the viewer", True)
    else:
        notes.setdefault("drag", []).append(f"pointer drag did not move the pane: {before} -> {after}")
        page.evaluate("mw:() => window.__bshLayout.movePane('dashboard', 'left')")
        settle(page)
        found = groups(page)
        checks.add(
            "mock layout API moves the dashboard (drag fallback)",
            found["Dashboard"]["right"] <= found["Viewer"]["left"] + 2,
            found,
        )
    checks.add("viewer survives the drag", page.evaluate(VIEWER_KEPT))

    page.get_by_role("button", name="Dashboard pane options").focus()
    page.keyboard.press("Enter")
    page.keyboard.press("ArrowDown")
    page.keyboard.press("ArrowDown")
    page.keyboard.press("Enter")
    settle(page)
    found = groups(page)
    checks.add(
        "keyboard: pane menu moves the dashboard below",
        found["Dashboard"]["top"] >= max(g["bottom"] for name, g in found.items() if name != "Dashboard") - 2,
        found,
    )
    focused = page.evaluate("() => [document.activeElement.getAttribute('role'), document.activeElement.getAttribute('aria-label')]")
    checks.add("keyboard: focus lands on the moved pane tab", focused == ["tab", "Dashboard"], focused)
    page.keyboard.press("F6")
    after_f6 = page.evaluate("() => [document.activeElement.getAttribute('role'), document.activeElement.getAttribute('aria-label')]")
    checks.add("keyboard: F6 moves focus to another pane", after_f6[0] == "tab" and after_f6[1] != "Dashboard", after_f6)
    regions = page.evaluate("() => [...document.querySelectorAll('[aria-live]')].map((el) => el.className)")
    checks.add("dockview and layout live regions are present", any("dv-live-region" in r for r in regions) and any("layout-announcer" in r for r in regions), regions)

    page.get_by_role("button", name="Panes").click()
    page.get_by_role("menuitem", name="Reset layout").click()
    settle(page)
    checks.add("reset layout restores the default arrangement", default_arrangement(groups(page)), groups(page))
    checks.add("reset keeps the viewer", page.evaluate(VIEWER_KEPT))

    pane_menu(page, "Model summary", "Move left")
    page.set_viewport_size({"width": 800, "height": DESKTOP[1]})
    settle(page, 1000)
    checks.add("narrow screens use the stacked layout", page.locator(".dv-dockview").count() == 0 and page.locator(".stack").count() == 1)
    checks.add("stacked layout keeps the viewer", page.evaluate(VIEWER_KEPT))
    stacked_label = page.evaluate(STACKED_LABEL)
    checks.add("stacked layout labels the viewer with the model name", bool(stacked_label) and stacked_label != "Viewer" and "·" in stacked_label, stacked_label)
    tree_toggle = page.get_by_role("button", name=TREE_TOGGLE).first
    tree_toggle.click()
    settle(page, 400)
    checks.add("stacked tree opens as an overlay", page.locator(".stack__tree:not([hidden]) #document-panel").count() == 1)
    page.keyboard.press("Escape")
    settle(page, 400)
    checks.add("Escape closes the tree overlay", page.locator(".stack__tree[hidden]").count() == 1)
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page, 1500)
    found = groups(page)
    checks.add(
        "the saved dock layout returns on wide screens",
        "Model summary" in found and found["Model summary"]["right"] <= found["Viewer"]["left"] + 2,
        found,
    )
    checks.add("viewer survived the breakpoint round trip", page.evaluate(VIEWER_KEPT))
    page.get_by_role("button", name="Panes").click()
    page.get_by_role("menuitem", name="Reset layout").click()
    settle(page)


def run_interaction_checks(page, checks, notes):
    try:
        check_layout(page, checks, notes)
    except Exception as exc:
        page.screenshot(path=str(OUTPUT_DIR / "mock-layout-failure.png"))
        checks.add("check_layout", False, f"{type(exc).__name__}: {str(exc)[:160]}")
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
    try:
        page.get_by_role("button", name=re.compile(MOCK_USER_NAME)).first.wait_for(timeout=15000)
    except Exception:
        pass
    checks.add(
        "app shows the signed-in user",
        page.get_by_role("button", name=re.compile(MOCK_USER_NAME)).count() == 1,
    )
    hubs = page.locator("[role=treeitem][aria-level='1']")
    try:
        hubs.first.wait_for(timeout=15000)
    except Exception:
        pass
    checks.add("tree lists hubs", hubs.count() >= 1)

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
    file_name = title.split(" ")[0]
    version = re.search(r" (v\d+) ", title)
    expected = f"{file_name} · {version.group(1)}" if version else file_name
    tab = page.evaluate(VIEWER_TAB) or {}
    checks.add("viewer tab shows the file name and version", tab.get("text") == expected, f"{tab.get('text')!r} vs {expected!r}")
    path, _, urn = tab.get("title", "").partition("\n")
    checks.add("viewer tab tooltip holds the breadcrumb path and the urn", path.count(" / ") >= 2 and path.endswith(expected) and len(urn) > 10, tab.get("title"))
    fill = page.evaluate(VIEWER_FILL) or {}
    text = fill.get("text", "")
    checks.add(
        "viewer pane has no header, breadcrumb, urn or show-in-documents",
        bool(fill) and not fill["header"] and fill["breadcrumb"] == 0 and "Show in documents" not in text and urn not in text and expected not in text,
        text[:120],
    )
    checks.add(
        "viewer canvas fills its dock panel",
        bool(fill) and fill["canvasHeight"] >= fill["slotHeight"] - 1 and fill["canvasWidth"] >= fill["slotWidth"] - 1,
        f"canvas {fill.get('canvasWidth')}x{fill.get('canvasHeight')} panel {fill.get('slotWidth')}x{fill.get('slotHeight')}",
    )
    notes["viewer_canvas"] = f"{fill.get('canvasWidth')}x{fill.get('canvasHeight')}"
    page.screenshot(path=str(OUTPUT_DIR / "mock-model.png"))
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

    run_interaction_checks(page, checks, notes)

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
    with Camoufox(headless=True, os=HOST_OS, main_world_eval=True) as browser:
        context = browser.new_context(viewport={"width": DESKTOP[0], "height": DESKTOP[1]})
        if not app_reachable(context):
            checks.add("app is reachable", False, f"{BASE_URL}/api/health did not return 200; start npm run dev:mock")
            return checks.finish(notes, "mock-report.json")
        run(context, checks, notes)
        context.close()
    return checks.finish(notes, "mock-report.json")


if __name__ == "__main__":
    sys.exit(main())
