import re
import sys

from camoufox.sync_api import Camoufox
from common import (
    BASE_URL,
    DESKTOP,
    HEADLESS,
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
VIEWER_WIDTH = "() => document.querySelector(\"[data-active='true'] .model-viewer\").getBoundingClientRect().width"
SCENE_FIT_WIDTH = "() => Number(document.querySelector(\"[data-active='true'] .bsh-mock__scene\")?.dataset.fitWidth || 0)"
ROOT_THEME = "() => document.documentElement.dataset.theme"
GROUPS = """() => Object.fromEntries([...document.querySelectorAll('.dv-groupview')].map((group) => {
    const box = group.getBoundingClientRect();
    const name = group.querySelector("[data-active='true'] .model-viewer")
        ? 'Viewer'
        : group.querySelector('.model-viewer') ? 'Other viewer' : group.getAttribute('aria-label');
    return [name, {
        left: box.left, top: box.top, right: box.right, bottom: box.bottom,
        floating: Boolean(group.closest('.dv-resize-container')),
    }];
}))"""
TAG_VIEWER = "() => { const el = document.querySelector(\"[data-active='true'] .bsh-mock\"); if (el) el.dataset.e2eTag = 'kept'; return Boolean(el); }"
VIEWER_KEPT = "() => document.querySelector(\"[data-active='true'] .bsh-mock\")?.dataset.e2eTag === 'kept'"
VIEWER_FITS = """() => {
    const box = document.querySelector("[data-active='true'] .model-viewer")?.getBoundingClientRect();
    const fit = Number(document.querySelector("[data-active='true'] .bsh-mock__scene")?.dataset.fitWidth || 0);
    return box ? Math.abs(box.width - fit) : 999;
}"""
VIEWER_TAB = """() => {
    const panel = document.querySelector("[data-active='true'] .model-viewer")?.closest('.dv-groupview');
    const tab = panel?.querySelector('.dv-tab.dv-active-tab');
    return tab ? {text: tab.textContent.trim(), title: tab.querySelector('[title]')?.getAttribute('title') || ''} : null;
}"""
VIEWER_FILL = """() => {
    const viewer = document.querySelector("[data-active='true'] .model-viewer");
    const canvas = viewer?.getBoundingClientRect();
    const slot = viewer?.closest('.pane-slot')?.getBoundingClientRect();
    const main = viewer?.closest('.pane-main');
    if (!canvas || !slot || !main) return null;
    return {
        canvasWidth: canvas.width, canvasHeight: canvas.height,
        slotWidth: slot.width, slotHeight: slot.height,
        text: main.innerText,
        header: Boolean(document.querySelector('.model-head, .urn-control, .model-title, .crumbs')),
        breadcrumb: document.querySelectorAll("nav[aria-label^='Breadcrumb']").length,
    };
}"""
STACKED_LABEL = "() => document.querySelector(\".stack__model-tab[data-active='true']\")?.textContent || ''"
STORED_LAYOUT = "() => JSON.parse(localStorage.getItem('bsh.layout.v2') || 'null')"
MODELS = "mw:() => window.__bshLayout.models()"
VIEWERS = """() => [...document.querySelectorAll('.pane-model')].map((body) => {
    const viewer = body.querySelector('.model-viewer')?.getBoundingClientRect();
    const scene = body.querySelector('.bsh-mock__scene');
    return {
        urn: body.dataset.model,
        active: body.dataset.active === 'true',
        state: body.querySelector('.bsh-viewer-pane')?.dataset.state || '',
        left: viewer?.left || 0,
        right: viewer?.right || 0,
        width: viewer?.width || 0,
        fit: Number(scene?.dataset.fitWidth || 0),
        shapes: scene ? scene.querySelectorAll('polygon').length : 0,
    };
})"""
SUMMARY_STATE = """() => ({
    model: (document.querySelector('.bsh-summary__model')?.textContent || '').replace(/^:\\s*/, ''),
    rows: [...document.querySelectorAll('.pane-summary tbody tr')].map((row) => row.innerText).join('|'),
})"""


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


def viewer_title(page):
    return (page.evaluate(VIEWER_TAB) or {}).get("text", "")


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
    pane_menu(page, viewer_title(page), "Float")
    found = groups(page)
    checks.add("pane menu floats the viewer", found.get("Viewer", {}).get("floating") is True, found)
    checks.add("floating viewer is not remounted", page.evaluate(VIEWER_KEPT))
    checks.add("floating viewer fits its container", page.evaluate(VIEWER_FITS) <= 2, page.evaluate(VIEWER_FITS))
    pane_menu(page, viewer_title(page), "Dock")
    checks.add("pane menu docks the viewer again", groups(page).get("Viewer", {}).get("floating") is False)
    checks.add("docked viewer is not remounted", page.evaluate(VIEWER_KEPT))

    stored = page.evaluate(STORED_LAYOUT)
    checks.add("layout is saved as version 2", bool(stored) and stored.get("version") == 2, str(stored)[:120])
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
    viewer_box = page.locator(".dv-groupview:has([data-active='true'] .model-viewer) .dv-content-container").bounding_box()
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

    before = groups(page)["Model summary"]
    pane_menu(page, "Model summary", "Resize with arrow keys")
    for _ in range(4):
        page.keyboard.press("ArrowRight")
    page.keyboard.press("Escape")
    settle(page)
    after = groups(page)["Model summary"]
    grown = (after["right"] - after["left"]) - (before["right"] - before["left"])
    checks.add("keyboard: arrow keys resize a pane from its menu", grown >= 40, f"{grown:.0f}px")
    announced = page.locator(".layout-announcer").inner_text()
    checks.add("keyboard: resize mode is announced", "resize finished" in announced, announced)
    page.get_by_role("button", name="Panes").click()
    page.get_by_role("menuitem", name="Reset layout").click()
    settle(page)

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


def models(page):
    return page.evaluate(MODELS)


def viewers(page):
    return page.evaluate(VIEWERS)


def summary_state(page):
    return page.evaluate(SUMMARY_STATE)


def wait_until(page, predicate, timeout_ms=8000):
    for _ in range(timeout_ms // 200):
        value = predicate()
        if value:
            return value
        page.wait_for_timeout(200)
    return predicate()


def model_tab(page, label):
    return page.locator(".dv-tab").filter(has_text=label)


def rendered(view):
    return (
        view["state"] == "ready"
        and view["shapes"] > 0
        and view["width"] > 0
        and abs(view["width"] - view["fit"]) <= 2
    )


def unselected_version(rows):
    for index in range(rows.count()):
        if rows.nth(index).get_attribute("aria-selected") != "true":
            return rows.nth(index)
    return None


def summary_for(page, label):
    def ready():
        state = summary_state(page)
        return state if state["model"] == label and state["rows"] else None

    return wait_until(page, ready) or {}


def ensure_viewables(page, wanted=2):
    rows = page.locator("[role=treeitem][data-viewable=true]")
    for _ in range(12):
        if rows.count() >= wanted:
            break
        level = int(rows.first.get_attribute("aria-level") or "2") - 1
        collapsed = page.locator(f"[role=treeitem][aria-level='{level}'][aria-expanded='false']")
        if collapsed.count() == 0:
            break
        collapsed.first.click()
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(800)
    return rows


def check_multi_model(page, checks, notes):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page)
    rows = ensure_viewables(page)
    checks.add("tree has two viewable versions", rows.count() >= 2, rows.count())
    first_urn = models(page)["active"]
    first_label = viewer_title(page)
    first_summary = summary_for(page, first_label)
    target = unselected_version(rows)
    target.click()
    second_urn = wait_until(page, lambda: models(page)["active"] if models(page)["active"] != first_urn else None)
    page.wait_for_url(re.compile(re.escape(second_urn or "missing")), timeout=8000)
    wait_until(page, lambda: any(v["urn"] == second_urn and rendered(v) for v in viewers(page)))
    second_label = viewer_title(page)
    state = models(page)
    checks.add(
        "opening another version adds a second tab",
        len(state["models"]) == 2
        and second_label != first_label
        and model_tab(page, first_label).count() == 1
        and model_tab(page, second_label).count() == 1,
        f"{first_label} / {second_label}",
    )
    checks.add("url mirrors the new active model", second_urn in page.url, page.url)
    second_summary = summary_for(page, second_label)
    checks.add(
        "summary follows the active model",
        second_summary.get("model") == second_label and second_summary.get("rows") != first_summary.get("rows"),
        f"{first_summary.get('model')} -> {second_summary.get('model')}",
    )

    target.click()
    settle(page)
    checks.add("clicking an open version adds no duplicate", len(models(page)["models"]) == 2, len(models(page)["models"]))

    model_tab(page, first_label).click()
    wait_until(page, lambda: models(page)["active"] == first_urn)
    checks.add("activating a tab updates the url", first_urn in page.url, page.url)
    back = summary_for(page, first_label)
    checks.add("summary switches back to the same rows", back.get("rows") == first_summary.get("rows"), back.get("model"))

    content = page.locator(".dv-groupview:has([data-active='true'] .model-viewer) .dv-content-container").bounding_box()
    pointer_drag(page, model_tab(page, second_label), content["x"] + content["width"] - 20, content["y"] + content["height"] / 2)
    settle(page, 1000)
    views = viewers(page)
    split = [v for v in views if v["width"] > 0]
    side_by_side = len(split) == 2 and (split[0]["right"] <= split[1]["left"] + 2 or split[1]["right"] <= split[0]["left"] + 2)
    if side_by_side:
        checks.add("dragging a tab splits two models side by side", all(rendered(v) for v in split), views)
    else:
        notes.setdefault("drag", []).append(f"tab drag did not split: {views}")
        page.evaluate(f"mw:() => window.__bshLayout.movePane('viewer:{second_urn}', 'right')")
        settle(page, 1000)
        split = [v for v in viewers(page) if v["width"] > 0]
        checks.add("mock layout API splits two models side by side (drag fallback)", len(split) == 2 and all(rendered(v) for v in split), split)
    page.screenshot(path=str(OUTPUT_DIR / "mock-multi-split.png"))

    tab = model_tab(page, first_label)
    tab.hover()
    tab.locator(".dv-default-tab-action").click()
    settle(page, 800)
    views = viewers(page)
    remaining = [v for v in views if v["urn"] == second_urn]
    checks.add(
        "closing one tab keeps the other rendering",
        len(models(page)["models"]) == 1 and bool(remaining) and rendered(remaining[0]),
        views,
    )
    checks.add("closing the active tab moves the url to the remaining model", second_urn in page.url, page.url)

    again = unselected_version(rows)
    if again is not None:
        again.click()
    wait_until(page, lambda: len(models(page)["models"]) == 2)
    active = models(page)["active"]
    page.reload(wait_until="networkidle")
    settle(page, 2500)
    state = models(page)
    shown = {v["urn"] for v in viewers(page) if v["width"] > 0}
    checks.add("reload restores the open tabs", len(state["models"]) == 2 and state["active"] == active, state)
    checks.add("reload loads only the visible models", set(state["live"]) == shown and len(shown) == 1, f"live {state['live']} shown {sorted(shown)}")
    checks.add("url mirrors the active model after reload", active in page.url, page.url)

    page.set_viewport_size({"width": 800, "height": DESKTOP[1]})
    settle(page, 1000)
    strip = page.get_by_role("tablist", name="Open models")
    checks.add("stacked layout shows a model switcher", strip.count() == 1 and strip.get_by_role("tab").count() == 2)
    other = strip.locator("[role=tab][aria-selected='false']")
    if other.count():
        other.first.click()
        settle(page, 1000)
    now = models(page)["active"]
    checks.add("stacked switcher activates the other model", now != active and now in page.url, page.url)
    visible = [v for v in viewers(page) if v["width"] > 0]
    checks.add("stacked layout shows one loaded viewer", len(visible) == 1 and visible[0]["urn"] == now and rendered(visible[0]), visible)
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page, 1000)
    for model in models(page)["models"]:
        if model["urn"] != now:
            page.evaluate(f"mw:() => window.__bshLayout.closeModel('{model['urn']}')")
    page.get_by_role("button", name="Panes").click()
    page.get_by_role("menuitem", name="Reset layout").click()
    settle(page)


COMBINED_GROUPS = """() => [...document.querySelectorAll("[data-active='true'] [data-model-id]")].map((group) => ({
    id: group.dataset.modelId,
    hidden: group.getAttribute('display') === 'none',
    shapes: group.querySelectorAll('polygon').length,
    themed: group.querySelectorAll('.bsh-mock__el--themed').length,
}))"""
MOCK_VIEWERS = "() => document.querySelectorAll('.pane-model .bsh-mock').length"
FIRST_COUNT = """() => {
    const row = document.querySelector('.pane-summary tbody tr');
    return row ? Number(row.querySelectorAll('td')[2]?.textContent.replace(/,/g, '') || 0) : 0;
}"""


def close_all_models(page):
    for model in models(page)["models"]:
        page.evaluate(f"mw:() => window.__bshLayout.closeModel('{model['urn']}')")
    settle(page, 800)


def combined_groups(page):
    return page.evaluate(COMBINED_GROUPS)


def models_trigger(page):
    return page.locator("[data-active='true'] .bsh-viewer-models__trigger")


def xlsx_has_model_column(path):
    import zipfile

    with zipfile.ZipFile(path) as archive:
        names = [name for name in archive.namelist() if name.startswith("xl/")]
        text = "".join(archive.read(name).decode("utf-8", "ignore") for name in names if name.endswith(".xml"))
    return ">Model<" in text


def check_combined(page, checks, notes):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    close_all_models(page)
    rows = ensure_viewables(page)
    checks.add("combined: tree has two viewable versions", rows.count() >= 2, rows.count())
    rows.nth(0).click(modifiers=["ControlOrMeta"])
    rows.nth(1).click(modifiers=["ControlOrMeta"])
    picked = page.locator("[role=treeitem][aria-checked='true']").count()
    checks.add("combined: Ctrl or Cmd click picks versions with aria-checked", picked == 2, picked)
    checks.add("combined: picking does not open a model", not models(page)["models"], models(page))
    rows.nth(1).focus()
    page.keyboard.press("Space")
    unpicked = page.locator("[role=treeitem][aria-checked='true']").count()
    page.keyboard.press("Space")
    checks.add("combined: Space toggles the pick", unpicked == 1 and page.locator("[role=treeitem][aria-checked='true']").count() == 2)
    page.get_by_role("button", name="Open together").click()
    wait_until(page, lambda: len(combined_groups(page)) == 2)
    settle(page, 1200)
    state = models(page)
    checks.add("combined: Open together makes one tab", len(state["models"]) == 1, state)
    checks.add("combined: one viewer holds both models", page.evaluate(MOCK_VIEWERS) == 1 and len(combined_groups(page)) == 2, combined_groups(page))
    checks.add("combined: tab title counts the models", model_tab(page, "2 models").count() == 1, viewer_title(page))
    tooltip = (page.evaluate(VIEWER_TAB) or {}).get("title", "")
    checks.add("combined: tab tooltip lists the files", tooltip.count("\n") == 1, tooltip)
    checks.add("combined: url carries with=", "with=" in page.url, page.url)

    summary_scope = page.get_by_role("combobox", name="Summarize models")
    wait_until(page, lambda: summary_scope.count() == 1 and page.evaluate(FIRST_COUNT) > 0)
    all_count = page.evaluate(FIRST_COUNT)
    options = summary_scope.locator("option").all_inner_texts() if summary_scope.count() else []
    checks.add("combined: summary offers All models and each model", len(options) == 3 and options[0] == "All models", options)
    if summary_scope.count():
        summary_scope.select_option(index=1)
        one = wait_until(page, lambda: page.evaluate(FIRST_COUNT) if page.evaluate(FIRST_COUNT) != all_count else 0)
        checks.add("combined: one-model scope narrows the counts", bool(one) and one < all_count, f"{all_count} -> {one}")
        summary_scope.select_option(index=0)

    first, second = [group["id"] for group in combined_groups(page)][:2]
    page.locator(f"[data-active='true'] [data-model-id='{first}'] polygon").nth(10).dispatch_event("click")
    page.locator(f"[data-active='true'] [data-model-id='{second}'] polygon").nth(10).dispatch_event("click", {"ctrlKey": True})
    page.locator("[data-active='true'] .bsh-mock__button[title='Paint selection']").click()
    page.locator("[data-active='true'] .bsh-mock__button[title='Paint selected items in red']").click()
    settle(page, 400)
    painted = [group["themed"] for group in combined_groups(page)]
    checks.add("combined: paint covers the selection in both models", painted[:2] == [1, 1], painted)

    try:
        size, magic = download_export(page, OUTPUT_DIR / "combined-export.xlsx")
        has_column = xlsx_has_model_column(OUTPUT_DIR / "combined-export.xlsx")
        checks.add("combined: export has a Model column", magic == XLSX_MAGIC and has_column, f"{size} bytes")
    except Exception as exc:
        checks.add("combined: export has a Model column", False, f"{type(exc).__name__}: {str(exc)[:160]}")

    models_trigger(page).click()
    page.get_by_role("menuitemcheckbox").nth(1).click()
    settle(page, 400)
    hidden = [group["hidden"] for group in combined_groups(page)]
    checks.add("combined: models menu hides a model", hidden == [False, True], hidden)
    models_trigger(page).click()
    page.get_by_role("menuitemcheckbox").nth(1).click()
    settle(page, 400)

    page.reload(wait_until="networkidle")
    settle(page, 2500)
    restored = wait_until(page, lambda: len(combined_groups(page)) == 2)
    checks.add("combined: reload restores the combined tab", bool(restored) and model_tab(page, "2 models").count() == 1, combined_groups(page))

    urn = models(page)["active"]
    broken = f"{urn}-nogeom"
    page.goto(f"{BASE_URL}/model/{urn}?with={second},{broken}", wait_until="networkidle")
    settle(page, 2000)
    failed = page.get_by_role("list", name="Models that failed")
    wait_until(page, lambda: failed.count() == 1)
    text = failed.inner_text() if failed.count() else ""
    checks.add("combined: a file without geometry explains itself", "No viewable geometry" in text, text[:160])
    checks.add("combined: the failed model leaves the others rendered", len([g for g in combined_groups(page) if g["shapes"] > 0]) == 2, combined_groups(page))
    page.screenshot(path=str(OUTPUT_DIR / "mock-combined.png"))

    failed.get_by_role("button", name="Remove").click()
    settle(page, 600)
    checks.add("combined: removing the failed model drops it from the url", broken not in page.url and "with=" in page.url, page.url)

    models_trigger(page).click()
    page.get_by_role("menuitem", name=re.compile(r"^Remove ")).last.click()
    settle(page, 800)
    checks.add("combined: removing a member leaves a single-model tab", len(combined_groups(page)) == 1 and "with=" not in page.url and models_trigger(page).count() == 0, page.url)

    ensure_viewables(page)
    addable = page.locator("[role=treeitem][data-viewable=true] .tree-row__action")
    target = page.locator("[role=treeitem][data-viewable=true]").filter(has=page.locator(".tree-row__action")).first
    if target.count():
        target.hover()
        target.locator(".tree-row__action").click()
        wait_until(page, lambda: len(combined_groups(page)) == 2)
    checks.add("combined: Add to open viewer adds a version to the active tab", addable.count() >= 1 and len(combined_groups(page)) == 2 and len(models(page)["models"]) == 1, combined_groups(page))

    six = ",".join(f"{urn}-extra{index}" for index in range(5))
    page.goto(f"{BASE_URL}/model/{urn}?with={six}", wait_until="networkidle")
    settle(page, 2000)
    models_trigger(page).click()
    add = page.get_by_role("menuitem", name=re.compile(r"^Add model"))
    checks.add("combined: the menu explains the cap of six", add.count() == 1 and "limit of 6" in add.inner_text() and add.is_disabled(), add.inner_text() if add.count() else "")
    page.keyboard.press("Escape")
    close_all_models(page)


def documents_alone(page):
    found = groups(page)
    return list(found) == ["Documents"]


STATE_BADGES = {
    "ready": "Viewable",
    "no-geometry": "No 3D or 2D view",
    "processing": "Processing",
    "not-translated": "Not translated",
    "failed": "Translation failed",
}
STATE_TRAIL = ["Northwind Architects", "Riverside Tower", "Project Files", "View States"]


def expand_state_rows(page, file_name):
    for depth, name in enumerate(STATE_TRAIL + [file_name], start=1):
        row = page.locator(f"[role=treeitem][aria-level='{depth}']", has_text=name).first
        row.wait_for(timeout=15000)
        if row.get_attribute("aria-expanded") != "true":
            row.click()
            page.keyboard.press("ArrowRight")
        page.wait_for_timeout(600)
    return row.locator("xpath=following-sibling::*[@role='treeitem'][1]")


BADGE_RECTS = """() => [...document.querySelectorAll('.tree-row__state')].map((badge) => {
    const row = badge.closest('.tree-row').getBoundingClientRect();
    const box = badge.getBoundingClientRect();
    const text = badge.querySelector('.tree-row__state-text');
    return {
        state: badge.dataset.state,
        gap: Math.round((row.right - box.right) * 10) / 10,
        inside: box.left >= row.left && box.right <= row.right + 0.5,
        clipped: text.scrollWidth > text.clientWidth + 1,
    };
})"""


def check_badge_layout(page, checks, label):
    rects = page.evaluate(BADGE_RECTS)
    checks.add(f"badges ({label}): are rendered", len(rects) >= 3, len(rects))
    checks.add(f"badges ({label}): none clipped or outside the row", all(r["inside"] and not r["clipped"] for r in rects), rects)
    gaps = {r["gap"] for r in rects}
    checks.add(f"badges ({label}): share the right edge", max(gaps) - min(gaps) <= 1, sorted(gaps))


def check_view_states(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    start_url = page.url
    for state, badge in STATE_BADGES.items():
        file_name = f"STATE-{state}.rvt"
        row = expand_state_rows(page, file_name)
        row.wait_for(timeout=15000)
        checks.add(f"{state}: version row carries data-view-state", row.get_attribute("data-view-state") == state, row.get_attribute("data-view-state"))
        checks.add(f"{state}: badge reads {badge}", badge in row.inner_text(), row.inner_text())
        openable = state == "ready"
        checks.add(f"{state}: data-viewable matches", row.get_attribute("data-viewable") == ("true" if openable else "false"))
        if state == "ready":
            continue
        row.click(force=True)
        page.wait_for_timeout(600)
        notice = page.locator(".doc-tree__notice[role=status][aria-live=polite]")
        checks.add(f"{state}: selecting shows an explanation", "cannot be opened" in notice.inner_text(), notice.inner_text())
        checks.add(f"{state}: no tab or route opens", page.url == start_url and not models(page)["models"], page.url)
        row.focus()
        page.keyboard.press("Enter")
        page.wait_for_timeout(400)
        checks.add(f"{state}: Enter opens no tab", page.url == start_url and not models(page)["models"], page.url)
        if state == "processing":
            checks.add("processing: badge has a spinner", row.locator(".tree-row__state svg.spin").count() == 1)
    page.screenshot(path=str(OUTPUT_DIR / "mock-view-states.png"))
    check_badge_layout(page, checks, "desktop")
    page.get_by_role("button", name=THEME_TOGGLE).first.click()
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUTPUT_DIR / "mock-view-states-theme-toggled.png"))
    check_badge_layout(page, checks, "toggled theme")
    page.get_by_role("button", name=THEME_TOGGLE).first.click()
    page.set_viewport_size({"width": MOBILE[0], "height": MOBILE[1]})
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUTPUT_DIR / "mock-view-states-narrow.png"))
    check_badge_layout(page, checks, "narrow")
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    page.goto(BASE_URL, wait_until="networkidle")


def check_documents_home(page, checks):
    settle(page)
    checks.add("default layout is Documents alone", documents_alone(page), groups(page))
    hint = page.locator(".pane-docs__hint")
    checks.add(
        "Documents shows the open-a-model hint",
        hint.count() == 1 and "Select a model version to open it in the viewer" in hint.inner_text(),
    )
    checks.add("Documents is the main landmark", page.locator("[role=main]#main #document-panel").count() == 1)
    tab = page.locator(".dv-tab").filter(has_text="Documents").first
    checks.add("Documents tab has no close button", tab.locator(".dv-default-tab-action").count() == 0)
    page.get_by_role("button", name="Documents pane options").click()
    items = page.get_by_role("menuitem").all_inner_texts()
    page.keyboard.press("Escape")
    checks.add("Documents pane menu has no Close", "Close" not in [item.strip() for item in items], items)


def check_documents_return(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page)
    rows = page.locator("[role=treeitem][data-viewable=true]")
    if not models(page)["models"]:
        rows.first.click()
        wait_until(page, lambda: models(page)["active"])
        settle(page, 1000)
    checks.add("opening a model opens the viewer right of Documents", "Viewer" in groups(page) and groups(page)["Documents"]["right"] <= groups(page)["Viewer"]["left"], groups(page))
    summary_tab = page.locator(".dv-tab").filter(has_text="Model summary").first
    summary_tab.hover()
    summary_tab.locator(".dv-default-tab-action").click()
    settle(page)
    checks.add("the summary closes from its tab", "Model summary" not in groups(page), groups(page))
    page.get_by_role("button", name="Panes").click()
    entry = page.get_by_role("menuitemcheckbox", name="Model summary")
    checks.add("the Panes menu lists the closed summary", entry.get_attribute("aria-checked") == "false")
    entry.click()
    settle(page)
    checks.add("the Panes menu re-opens the summary", "Model summary" in groups(page), groups(page))
    for model in models(page)["models"]:
        tab = page.locator(".dv-tab").filter(has_text="·").first
        tab.hover()
        tab.locator(".dv-default-tab-action").click()
        settle(page, 600)
    settle(page, 800)
    checks.add("closing the last model tab leaves Documents alone", documents_alone(page), groups(page))
    checks.add("closing the last model tab returns the url to /", page.url.rstrip("/") == BASE_URL, page.url)


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
    try:
        check_multi_model(page, checks, notes)
    except Exception as exc:
        page.screenshot(path=str(OUTPUT_DIR / "mock-multi-failure.png"))
        checks.add("check_multi_model", False, f"{type(exc).__name__}: {str(exc)[:160]}")
    try:
        check_combined(page, checks, notes)
    except Exception as exc:
        page.screenshot(path=str(OUTPUT_DIR / "mock-combined-failure.png"))
        checks.add("check_combined", False, f"{type(exc).__name__}: {str(exc)[:160]}")
    try:
        check_documents_return(page, checks)
    except Exception as exc:
        page.screenshot(path=str(OUTPUT_DIR / "mock-documents-failure.png"))
        checks.add("check_documents_return", False, f"{type(exc).__name__}: {str(exc)[:160]}")


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
        check_documents_home(page, checks)
    except Exception as exc:
        checks.add("check_documents_home", False, f"{type(exc).__name__}: {str(exc)[:160]}")

    try:
        check_view_states(page, checks)
    except Exception as exc:
        checks.add("check_view_states", False, f"{type(exc).__name__}: {str(exc)[:160]}")

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
    with Camoufox(headless=HEADLESS, os=HOST_OS, main_world_eval=True) as browser:
        context = browser.new_context(viewport={"width": DESKTOP[0], "height": DESKTOP[1]})
        if not app_reachable(context):
            checks.add("app is reachable", False, f"{BASE_URL}/api/health did not return 200; start npm run dev:mock")
            return checks.finish(notes, "mock-report.json")
        run(context, checks, notes)
        context.close()
    return checks.finish(notes, "mock-report.json")


if __name__ == "__main__":
    sys.exit(main())
