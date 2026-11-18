import importlib.util
import os
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
    GLB_MAGIC,
    XLSX_MAGIC,
    Checks,
    api_get,
    app_reachable,
    download_export,
    download_glb,
    download_ifc,
    glb_check,
    ifc_check,
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
STRIP_TOGGLE = re.compile(r"^Pinned and Recent")
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
SAME_GROUP = """(names) => {
    const groups = names.map((name) => [...document.querySelectorAll('.dv-tab')].find((tab) => tab.textContent.trim() === name)?.closest('.dv-groupview'));
    return Boolean(groups[0]) && groups[0] === groups[1];
}"""
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


ACTIVE_OUTLINE = """() => [...document.querySelectorAll('.dv-groupview')].map((group) => {
    const style = getComputedStyle(group, '::after');
    return {
        active: group.classList.contains('dv-active-group'),
        outline: style.content !== 'none' && style.boxShadow !== 'none' && style.position === 'absolute',
        tab: group.querySelector('.dv-tab')?.textContent.trim(),
    };
})"""


def check_active_pane(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page, 300)
    original = page.evaluate(ROOT_THEME)
    for theme in ("dark", "light"):
        if page.evaluate(ROOT_THEME) != theme:
            page.get_by_role("button", name=THEME_TOGGLE).first.click()
            settle(page, 300)
        page.get_by_role("tab", name="Model summary").click()
        settle(page, 300)
        state = page.evaluate(ACTIVE_OUTLINE)
        active = [g for g in state if g["active"]]
        checks.add(f"{theme}: exactly one group is active", len(active) == 1, state)
        checks.add(f"{theme}: the active group carries the accent outline", bool(active) and active[0]["outline"] and active[0]["tab"] == "Model summary", active)
        checks.add(f"{theme}: other groups have no outline", all(not g["outline"] for g in state if not g["active"]), state)
        page.screenshot(path=str(OUTPUT_DIR / f"mock-active-pane-{theme}.png"))
    page.get_by_role("tab", name="Dashboard").click()
    settle(page, 300)
    active = [g for g in page.evaluate(ACTIVE_OUTLINE) if g["active"]]
    checks.add("the accent follows the clicked pane", len(active) == 1 and active[0]["tab"] == "Dashboard", active)
    if page.evaluate(ROOT_THEME) != original:
        page.get_by_role("button", name=THEME_TOGGLE).first.click()
        settle(page, 300)


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


def check_summary_tools(page, checks):
    pane = page.locator(".pane-summary").first
    pane.locator("tbody tr").first.wait_for(timeout=8000)
    rows = pane.locator("tbody tr").count()
    pane.get_by_label("Filter summary rows").fill("zzz-no-match")
    settle(page, 200)
    checks.add("summary filter hides non-matching rows", pane.locator("tbody tr").count() == 0, pane.locator("tbody tr").count())
    pane.get_by_label("Filter summary rows").fill("")
    settle(page, 200)
    checks.add("clearing the filter restores the rows", pane.locator("tbody tr").count() == rows, pane.locator("tbody tr").count())
    scope = pane.get_by_label("Summarize elements")
    scope.select_option("selected")
    settle(page, 400)
    checks.add("selected scope with no selection says so", pane.get_by_text("No selected elements").count() == 1)
    scope.select_option("all")
    settle(page, 400)
    checks.add("all scope restores the rows", pane.locator("tbody tr").count() == rows, pane.locator("tbody tr").count())
    pane.get_by_role("button", name="Summary settings").click()
    dialog = page.get_by_role("dialog", name="Summary settings")
    dialog.get_by_role("checkbox", name="Level").wait_for(timeout=8000)
    checks.add("the property picker lists discovered properties", dialog.get_by_role("checkbox").count() > 5, dialog.get_by_role("checkbox").count())
    dialog.get_by_role("checkbox", name="Level").check()
    settle(page, 600)
    checks.add("a picked property joins the summary", pane.locator("tbody tr", has_text="Level").count() > 0)
    dialog.get_by_role("checkbox", name="Level").uncheck()
    settle(page, 300)
    top = dialog.bounding_box()
    view = page.viewport_size
    checks.add("summary settings is centred vertically", abs((top["y"] + top["height"] / 2) - view["height"] / 2) <= 40 or top["height"] >= view["height"] - 40, top)
    dialog.get_by_label("Density").select_option("compact")
    settle(page, 200)
    checks.add("density is compact", pane.locator("section[data-density='compact']").count() == 1)
    page.set_viewport_size({"width": MOBILE[0], "height": MOBILE[1]})
    settle(page, 300)
    box = dialog.bounding_box()
    checks.add("summary settings fit at 390 wide", box["x"] >= 0 and box["x"] + box["width"] <= MOBILE[0] and horizontal_overflow(page) <= 0, box)
    checks.add("summary settings stay inside the 390 viewport", box["y"] >= 0 and box["y"] + box["height"] <= MOBILE[1], box)
    page.screenshot(path=str(OUTPUT_DIR / "mock-summary-settings-390.png"))
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    page.keyboard.press("Escape")
    settle(page, 300)
    checks.add("closing summary settings returns focus to the gear", page.evaluate("document.activeElement?.textContent") == "Summary settings")
    open_settings(page)
    main = page.get_by_role("dialog", name="Settings", exact=True)
    checks.add("main settings holds no pane controls", main.get_by_label("Density").count() == 0)
    main.get_by_role("button", name="Summary settings").click()
    settle(page, 300)
    main = page.get_by_role("dialog", name="Summary settings")
    checks.add("the summary window opened from settings shows the same density", main.get_by_label("Density").input_value() == "compact")
    main.get_by_label("Density").select_option("comfortable")
    page.keyboard.press("Escape")
    settle(page, 300)
    checks.add("density change in main settings reaches the table", pane.locator("section[data-density='comfortable']").count() == 1)
    first = pane.locator("tbody .bsh-row-pick").first
    first.click()
    settle(page, 300)
    selected = page.locator(".bsh-mock__el--selected").count()
    checks.add("clicking a summary value selects elements in the viewer", selected >= 1, selected)
    pane.get_by_role("button", name="Summary settings").click()
    page.get_by_role("dialog", name="Summary settings").get_by_label("Row click").select_option("isolate")
    page.keyboard.press("Escape")
    settle(page, 200)
    pane.locator("tbody .bsh-row-pick").first.click()
    settle(page, 300)
    dim = page.locator(".bsh-mock__el--dim").count()
    checks.add("isolating dims the other elements", dim >= 1, dim)
    pane.get_by_role("button", name="Show all elements").click()
    settle(page, 200)
    checks.add("show all restores the elements", page.locator(".bsh-mock__el--dim").count() == 0)
    pane.get_by_role("button", name="Summary settings").click()
    page.get_by_role("dialog", name="Summary settings").get_by_label("Row click").select_option("select")
    page.get_by_role("dialog", name="Summary settings").get_by_role("button", name="Reset view").click()
    page.keyboard.press("Escape")
    settle(page, 200)
    with page.expect_download(timeout=8000) as info:
        pane.get_by_role("button", name="Download CSV").click()
    name = info.value.suggested_filename
    checks.add("summary CSV downloads", name.endswith("-summary.csv"), name)


COLLAPSED_RING = """() => [...document.querySelectorAll('.dv-groupview[data-collapsed]')].map((group) => ({
    active: group.classList.contains('dv-active-group'),
    content: getComputedStyle(group, '::after').content,
}))"""
LEGEND_BOXES = """() => {
    const box = (el) => el && el.getBoundingClientRect().toJSON();
    const frame = document.querySelector('.pane-dashboard .bsh-chart--doughnut');
    const body = document.querySelector('.pane-dashboard .bsh-drawer__body');
    const legend = frame?.querySelector('.bsh-legend');
    body.scrollTop = body.scrollHeight;
    return {
        plot: box(frame.querySelector('.bsh-chart__plot')),
        legend: box(legend),
        body: box(body),
        legendClipped: legend.scrollHeight > legend.clientHeight + 1 && legend.scrollWidth <= legend.clientWidth + 1,
    };
}"""


def check_selection_sets(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    pane = page.get_by_role("region", name=re.compile("Model summary"))
    pane.locator("tbody .bsh-row-pick").first.click()
    settle(page, 300)
    picked = page.locator(".bsh-mock__el--selected").count()
    checks.add("sets: a summary value selects elements to capture", picked >= 1, picked)
    open_tool_settings(page, "Excel export")
    dialog = page.get_by_role("dialog", name="Excel export settings")
    dialog.get_by_label("Rows", exact=True).select_option("all")
    count = dialog.get_by_role("status").filter(has_text="Rows to export")
    wait_until(page, lambda: "counting" not in count.inner_text())
    total = int(count.inner_text().split(":")[1].strip().replace(",", ""))
    checks.add("sets: the live count shows every element for all", total >= picked, count.inner_text())
    dialog.get_by_label("Selection set name").fill("Smoke set")
    dialog.get_by_role("button", name="Save selection as set").click()
    settle(page, 300)
    checks.add("sets: the captured set is listed with its size", dialog.get_by_text(f"{picked} elements").count() >= 1, picked)
    dialog.get_by_label("Rows", exact=True).select_option(label="Set: Smoke set")
    wait_until(page, lambda: count.inner_text() == f"Rows to export: {picked}")
    checks.add("sets: the live count follows the set scope", count.inner_text() == f"Rows to export: {picked}", count.inner_text())
    page.keyboard.press("Escape")
    settle(page, 300)
    size, magic = download_export(page, OUTPUT_DIR / "set-export.xlsx")
    checks.add("sets: export with the set scope downloads an xlsx", size > 500 and magic == XLSX_MAGIC, f"{size} bytes")
    open_tool_settings(page, "Excel export")
    dialog = page.get_by_role("dialog", name="Excel export settings")
    dialog.get_by_role("button", name="Delete Smoke set").click()
    settle(page, 300)
    rows_select = dialog.get_by_label("Rows", exact=True)
    checks.add("sets: a deleted set shows a visible fallback", "Deleted set" in rows_select.evaluate("el => el.selectedOptions[0].textContent"))
    wait_until(page, lambda: count.inner_text() == f"Rows to export: {total:,}")
    checks.add("sets: the count falls back to all elements", count.inner_text() == f"Rows to export: {total:,}", count.inner_text())
    page.keyboard.press("Escape")
    settle(page, 300)
    download_export(page, OUTPUT_DIR / "set-export-stale.xlsx")
    page.get_by_role("button", name=re.compile(r"^Tasks")).click()
    text = page.get_by_role("region", name="Tasks").inner_text()
    checks.add("sets: the stale-set export finishes with a notice", "no longer exists" in text, text[:200])
    page.keyboard.press("Escape")
    open_tool_settings(page, "Excel export")
    page.get_by_role("dialog", name="Excel export settings").get_by_label("Rows", exact=True).select_option("all")
    page.keyboard.press("Escape")
    settle(page, 300)


def check_collapsed_ring(page, checks):
    stubs = page.evaluate(COLLAPSED_RING)
    checks.add("a collapsed pane stub is present", len(stubs) >= 1, stubs)
    checks.add("no collapsed pane stub draws the active ring", all(stub["content"] in ("none", "normal") for stub in stubs), stubs)


def boxes_overlap(a, b):
    return a["x"] < b["x"] + b["width"] and b["x"] < a["x"] + a["width"] and a["y"] < b["y"] + b["height"] and b["y"] < a["y"] + a["height"]


def check_dashboard_gallery(page, checks):
    pane = page.locator(".pane-dashboard").first
    toggle = pane.get_by_role("button", name="Presets", exact=True)
    checks.add("the dashboard pane has a Presets toggle", toggle.count() == 1 and toggle.get_attribute("aria-expanded") == "false")
    toggle.click()
    settle(page, 300)
    checks.add("the Presets toggle opens the gallery", pane.get_by_role("list", name="Dashboard presets").count() == 1 and toggle.get_attribute("aria-expanded") == "true")
    checks.add("built-in cards have no rename or delete", pane.get_by_label(re.compile(r"^Rename ")).count() == 0 and pane.get_by_role("button", name=re.compile(r"^Delete ")).count() == 0)
    checks.add("built-in cards offer Save as my preset", pane.get_by_role("button", name="Save Model health as my preset").count() == 1)
    page.screenshot(path=str(OUTPUT_DIR / "mock-gallery.png"))
    pane.get_by_role("button", name="Save Model health as my preset").click()
    checks.add("saving a built-in adds an editable card", pane.get_by_label("Rename Model health").count() == 1 and pane.get_by_role("button", name="Delete Model health").count() == 1)
    pane.get_by_role("button", name="Apply Quantities by type").click()
    settle(page, 500)
    checks.add("applying from the gallery closes it", pane.get_by_role("list", name="Dashboard presets").count() == 0)
    names = pane.locator(".bsh-boards [role=img]").evaluate_all("(els) => els.map((el) => el.getAttribute('aria-label'))")
    checks.add("a preset hides charts whose property the model lacks", len(names) == 1 and names[0].endswith("by Category"), names)
    pane.get_by_role("button", name="Presets", exact=True).click()
    settle(page, 300)
    pane.get_by_role("button", name="Apply Model health").last.click()
    settle(page, 500)
    checks.add("a user preset applies from the gallery", pane.locator(".bsh-boards canvas").count() >= 2, pane.locator(".bsh-boards canvas").count())
    pane.get_by_role("button", name="Presets", exact=True).click()
    settle(page, 300)
    pane.get_by_role("button", name="Delete Model health").click()
    checks.add("deleting a user preset removes its card", pane.get_by_label("Rename Model health").count() == 0)
    page.mouse.click(330, 300)
    settle(page, 300)
    pane.get_by_label("Chart elements").select_option("selected")
    settle(page, 800)
    empty = pane.get_by_text("Nothing to chart here").count() == 1 and pane.get_by_role("list", name="Dashboard presets").count() == 1
    checks.add("a board with no chart left shows the message and the gallery as its call to action", empty, pane.inner_text()[:160])
    page.screenshot(path=str(OUTPUT_DIR / "mock-gallery-empty.png"))
    pane.get_by_label("Chart elements").select_option("all")
    settle(page, 400)
    pane.get_by_role("button", name="Dashboard settings").click()
    page.get_by_role("dialog", name="Dashboard settings").get_by_role("button", name="Single chart").click()
    page.keyboard.press("Escape")
    settle(page, 300)


def check_dashboard_tools(page, checks):
    check_collapsed_ring(page, checks)
    expand = page.get_by_role("button", name="Expand Dashboard")
    if expand.count():
        expand.first.click()
        settle(page, 600)
    pane = page.locator(".pane-dashboard").first
    pane.locator("canvas").first.wait_for(timeout=8000)
    trigger = pane.get_by_role("button", name=re.compile(r"^Export ")).first
    trigger_box = trigger.bounding_box()
    checks.add("chart export trigger is at least 24px", trigger_box["width"] >= 24 and trigger_box["height"] >= 24, trigger_box)
    checks.add("chart export row is compact", pane.locator(".bsh-chart__tools").first.bounding_box()["height"] <= 32)
    layout = page.evaluate(LEGEND_BOXES)
    checks.add("doughnut legend does not overlap the plot", not boxes_overlap(layout["plot"], layout["legend"]), layout)
    checks.add(
        "doughnut legend sits inside the pane",
        layout["legend"]["x"] >= layout["body"]["x"] - 1
        and layout["legend"]["x"] + layout["legend"]["width"] <= layout["body"]["x"] + layout["body"]["width"] + 1
        and layout["legend"]["y"] + layout["legend"]["height"] <= layout["body"]["y"] + layout["body"]["height"] + 1,
        layout,
    )
    page.screenshot(path=str(OUTPUT_DIR / "mock-dashboard.png"))
    trigger.click()
    with page.expect_download(timeout=8000) as info:
        page.get_by_role("menuitem", name="Download PNG").click()
    png = OUTPUT_DIR / "chart.png"
    info.value.save_as(str(png))
    checks.add("chart exports a PNG", png.read_bytes()[:4] == b"\x89PNG", png.stat().st_size)
    trigger.click()
    with page.expect_download(timeout=8000) as info:
        page.get_by_role("menuitem", name="Download CSV").click()
    checks.add("chart exports a CSV", info.value.suggested_filename.endswith(".csv"), info.value.suggested_filename)
    trigger.click()
    page.get_by_role("menuitem", name="Copy data").click()
    settle(page, 200)
    checks.add("chart copy reports a result", bool(pane.locator("[role=status]").first.inner_text().strip()))
    plot = pane.locator(".bsh-chart--doughnut canvas").first.bounding_box()
    page.mouse.click(plot["x"] + plot["width"] / 2 + 0.4 * min(plot["width"], plot["height"]), plot["y"] + plot["height"] / 2)
    settle(page, 300)
    selected = page.locator(".bsh-mock__el--selected").count()
    checks.add("clicking a chart slice selects elements in the viewer", selected >= 1, selected)
    checks.add("the dashboard pane has no preset buttons", pane.get_by_role("button", name="Model health").count() == 0)
    pane.get_by_role("button", name="Dashboard settings").click()
    dialog = page.get_by_role("dialog", name="Dashboard settings")
    box = dialog.bounding_box()
    view = page.viewport_size
    checks.add("dashboard settings is centred vertically", abs((box["y"] + box["height"] / 2) - view["height"] / 2) <= 40 or box["height"] >= view["height"] - 40, box)
    dialog.get_by_role("button", name="Model health").click()
    settle(page, 300)
    boards = pane.locator(".bsh-boards canvas").count()
    checks.add("a dashboard preset shows several charts", boards >= 2, boards)
    page.set_viewport_size({"width": MOBILE[0], "height": MOBILE[1]})
    settle(page, 300)
    box = dialog.bounding_box()
    checks.add("dashboard settings fit at 390 wide", box["x"] >= 0 and box["x"] + box["width"] <= MOBILE[0] and horizontal_overflow(page) <= 0, box)
    page.screenshot(path=str(OUTPUT_DIR / "mock-dashboard-settings-390.png"))
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    page.keyboard.press("Escape")
    settle(page, 300)
    checks.add("closing dashboard settings returns focus to the gear", page.evaluate("document.activeElement?.textContent") == "Dashboard settings")
    page.screenshot(path=str(OUTPUT_DIR / "mock-dashboard-preset.png"))
    open_settings(page)
    main = page.get_by_role("dialog", name="Settings", exact=True)
    checks.add("main settings holds no dashboard controls", main.get_by_role("button", name="Model health").count() == 0)
    main.get_by_role("button", name="Dashboard settings").click()
    settle(page, 300)
    main = page.get_by_role("dialog", name="Dashboard settings")
    checks.add("the dashboard window opened from settings shows the same preset", main.get_by_role("button", name="Model health").get_attribute("aria-pressed") == "true")
    main.get_by_role("button", name="Single chart").click()
    page.keyboard.press("Escape")
    settle(page, 300)
    checks.add("preset change in main settings reaches the pane", pane.locator(".bsh-boards").count() == 0 and pane.locator(".bsh-chart--doughnut").count() == 1)
    pane.get_by_role("button", name="Bar", exact=True).click()
    settle(page, 200)
    checks.add("the pane switch shows only the bar chart", pane.locator(".bsh-chart--doughnut").count() == 0 and pane.locator(".bsh-chart--bar").count() == 1)
    pane.get_by_role("button", name="Both").click()
    settle(page, 200)
    check_dashboard_gallery(page, checks)
    page.get_by_role("button", name="Collapse Dashboard").first.click()
    settle(page, 600)


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


def check_lock_maximize(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page)
    page.evaluate(TAG_VIEWER)
    before = groups(page)["Model summary"]
    pane_menu(page, "Model summary", "Maximize")
    found = groups(page)
    shown = {name: g for name, g in found.items() if g["right"] > g["left"] and g["bottom"] > g["top"]}
    checks.add("maximize shows one pane filling the dock", "Model summary" in found and (found["Model summary"]["right"] - found["Model summary"]["left"]) > before["right"] - before["left"] + 200, shown)
    page.keyboard.press("Escape")
    settle(page)
    restored = groups(page)["Model summary"]
    checks.add("Escape restores the maximized pane", abs((restored["right"] - restored["left"]) - (before["right"] - before["left"])) <= 2, restored)
    pane_menu(page, viewer_title(page), "Maximize")
    checks.add("maximized viewer fits its container", page.evaluate(VIEWER_FITS) <= 2, page.evaluate(VIEWER_FITS))
    page.get_by_role("tab").filter(has_text=viewer_title(page)).first.dblclick()
    settle(page)
    checks.add("double-click on the tab restores", default_arrangement(groups(page)), groups(page))
    checks.add("maximize keeps the viewer element", page.evaluate(VIEWER_KEPT))

    page.get_by_role("button", name="Panes").click()
    page.get_by_role("menuitemcheckbox", name="Lock layout").click()
    settle(page)
    checks.add("locked layout is stored", page.evaluate("() => localStorage.getItem('bsh.layout.locked')") == "true")
    checks.add("locked layout hides tab close buttons", page.locator(".dv-default-tab-action").count() == 0, page.locator(".dv-default-tab-action").count())
    tab_box = page.get_by_role("tab", name="Dashboard").bounding_box()
    viewer_box = page.locator(".dv-groupview:has([data-active='true'] .model-viewer) .dv-content-container").bounding_box()
    pointer_drag(page, page.get_by_role("tab", name="Dashboard"), viewer_box["x"] + 24, viewer_box["y"] + viewer_box["height"] / 2)
    checks.add("locked layout ignores a tab drag", default_arrangement(groups(page)), groups(page))
    page.get_by_role("button", name="Dashboard pane options").click()
    names = page.get_by_role("menuitem").all_inner_texts()
    checks.add("locked pane menu offers only Maximize and Unlock", [n.strip() for n in names] == ["Maximize", "Unlock layout"], names)
    page.keyboard.press("Escape")
    page.set_viewport_size({"width": MOBILE[0], "height": MOBILE[1]})
    settle(page, 800)
    checks.add("locked layout has no overflow at 390 wide", horizontal_overflow(page) <= 0)
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page, 1200)
    page.get_by_role("button", name="Panes").click()
    page.get_by_role("menuitemcheckbox", name="Lock layout").click()
    settle(page)
    checks.add("unlock stores false", page.evaluate("() => localStorage.getItem('bsh.layout.locked')") == "false")
    checks.add("unlocked tabs have close buttons again", page.locator(".dv-default-tab-action").count() > 0)


def check_session_banner(page, checks):
    import json

    def serve(offset_ms):
        body = json.dumps({"name": MOCK_USER_NAME, "picture": None, "expiresInMs": offset_ms})
        page.route("**/api/session", lambda route: route.fulfill(status=200, content_type="application/json", body=body))

    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    serve(4 * 60_000)
    page.reload(wait_until="networkidle")
    settle(page, 1500)
    warning = page.locator(".session-banner[data-state='soon']")
    checks.add("session banner warns before the session ends", warning.count() == 1 and "ends in" in warning.inner_text(), warning.count())
    soon_background = warning.evaluate("e => getComputedStyle(e).backgroundColor")
    checks.add("warning keeps the dock mounted", page.locator(".dv-dockview").count() == 1)
    page.set_viewport_size({"width": MOBILE[0], "height": MOBILE[1]})
    settle(page, 600)
    checks.add("warning has no horizontal overflow at 390 wide", horizontal_overflow(page) <= 0)
    brand = page.locator(".brand__name").bounding_box()
    checks.add("the app title stays on one line at 390 wide", brand["height"] <= 24, brand)
    checks.add("the soon banner has a leading icon", warning.locator("svg").count() == 1)
    page.unroute("**/api/session")
    serve(-1000)
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    page.reload(wait_until="networkidle")
    settle(page, 1500)
    ended = page.locator(".session-banner[data-state='ended']")
    checks.add("expired session shows a sign-in banner", ended.count() == 1 and ended.get_by_role("button", name="Sign in again").count() == 1)
    checks.add("ended and soon banners are coloured differently", ended.evaluate("e => getComputedStyle(e).backgroundColor") != soon_background)
    checks.add("expired session keeps the layout", page.locator(".dv-dockview").count() == 1 and page.get_by_role("tab", name="Documents", exact=True).count() == 1)
    page.screenshot(path=str(OUTPUT_DIR / "mock-session-ended.png"))
    page.unroute("**/api/session")
    page.reload(wait_until="networkidle")
    settle(page, 1000)
    checks.add("banner is gone after the session is healthy again", page.locator(".session-banner").count() == 0)


def open_settings(page):
    page.get_by_role("button", name=re.compile(MOCK_USER_NAME)).first.click()
    page.get_by_role("menuitem", name="Settings").click()
    settle(page, 300)


def open_tool_settings(page, title):
    open_settings(page)
    page.get_by_role("dialog", name="Settings", exact=True).get_by_role("button", name=f"{title} settings").click()
    settle(page, 300)


def check_saved_items(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    open_settings(page)
    main = page.get_by_role("dialog", name="Settings", exact=True)
    checks.add("main settings has a saved items section", main.get_by_role("button", name="Export saved items").count() == 1)
    checks.add("saved items section holds no tool switch", main.get_by_role("switch", name="Paint brushes").count() == 0)
    with page.expect_download(timeout=8000) as info:
        main.get_by_role("button", name="Export saved items").click()
    target = OUTPUT_DIR / "bsh-saved.json"
    info.value.save_as(str(target))
    checks.add("saved items export is bsh-saved JSON", '"format": "bsh-saved"' in target.read_text(), info.value.suggested_filename)
    bad = OUTPUT_DIR / "bad-saved.json"
    bad.write_text('{"format":"bsh-saved","version":99,"items":[]}')
    main.get_by_label("Saved items file").set_input_files(str(bad))
    settle(page, 300)
    checks.add("a newer-version file shows an error", "newer version" in main.get_by_role("alert").inner_text())
    good = OUTPUT_DIR / "good-saved.json"
    good.write_text('{"format":"bsh-saved","version":1,"items":[{"id":"smoke","kind":"dashboard-preset","name":"Smoke preset","data":{"kind":"bar"}}]}')
    main.get_by_label("Saved items file").set_input_files(str(good))
    settle(page, 300)
    checks.add("a valid file imports", "Imported 1 item" in main.get_by_role("status").inner_text(), main.get_by_role("status").inner_text())
    main.get_by_role("button", name="Dashboard settings").click()
    settle(page, 300)
    dialog = page.get_by_role("dialog", name="Dashboard settings")
    checks.add("an imported preset appears in the dashboard window", dialog.get_by_role("button", name="Apply Smoke preset").count() == 1)
    dialog.get_by_label("Preset name").fill("Smoke saved")
    dialog.get_by_role("button", name="Save current board").click()
    dialog.get_by_role("button", name="Apply Smoke preset").click()
    settle(page, 200)
    checks.add("applying a user preset sets the chart type", dialog.get_by_label("Chart type").input_value() == "bar")
    dialog.get_by_label("Rename Smoke saved").fill("Smoke renamed")
    dialog.get_by_label("Rename Smoke saved").press("Enter")
    settle(page, 200)
    checks.add("a user preset can be renamed", dialog.get_by_role("button", name="Delete Smoke renamed").count() == 1)
    dialog.get_by_role("button", name="Delete Smoke renamed").click()
    dialog.get_by_role("button", name="Delete Smoke preset").click()
    checks.add("user presets can be deleted", dialog.get_by_text("No saved presets yet.").count() == 1)
    dialog.get_by_label("Chart type").select_option("both")
    page.keyboard.press("Escape")
    settle(page, 300)


def check_paint_palette(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page)
    page.get_by_role("button", name="Settings", exact=True).click()
    settle(page, 300)
    checks.add("top bar gear opens settings", page.get_by_role("dialog", name="Settings").count() == 1)
    settings_box = page.get_by_role("dialog", name="Settings").bounding_box()
    view = page.viewport_size
    checks.add("settings is centred vertically", abs((settings_box["y"] + settings_box["height"] / 2) - view["height"] / 2) <= 40 or settings_box["height"] >= view["height"] - 40, settings_box)
    page.keyboard.press("Escape")
    settle(page, 300)
    open_settings(page)
    main = page.get_by_role("dialog", name="Settings", exact=True)
    checks.add("main settings lists each tool with an entry point", all(main.get_by_role("button", name=f"{t} settings").count() == 1 for t in ("Paint brushes", "Excel export", "Geometry export", "IFC export")))
    checks.add("main settings holds no swatches", page.get_by_label(re.compile(r"^Swatch \d$")).count() == 0)
    main.get_by_role("button", name="Paint brushes settings").click()
    settle(page, 300)
    checks.add("settings lists the three default swatches", page.get_by_label(re.compile(r"^Swatch \d$")).count() == 3)
    checks.add("settings labels the slider as intensity", page.get_by_label(re.compile(r"^Intensity \d+%")).count() == 1)
    page.get_by_label("Swatch 1", exact=True).fill("#112233")
    page.get_by_role("button", name="Add swatch").click()
    checks.add("add swatch makes four", page.get_by_label(re.compile(r"^Swatch \d$")).count() == 4)
    page.set_viewport_size({"width": MOBILE[0], "height": MOBILE[1]})
    settle(page, 400)
    checks.add("palette settings have no overflow at 390 wide", horizontal_overflow(page) <= 0)
    settings_box = page.get_by_role("dialog", name="Settings").bounding_box()
    checks.add("settings stay inside the 390 viewport", settings_box["y"] >= 0 and settings_box["y"] + settings_box["height"] <= MOBILE[1], settings_box)
    page.screenshot(path=str(OUTPUT_DIR / "mock-settings-390.png"))
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    page.keyboard.press("Escape")
    settle(page, 400)
    page.locator("button[title='Paint selection']").first.click()
    swatches = page.locator(".bsh-mock__flyout:visible button:not([data-button-id^='paint-reset'])")
    ids = swatches.evaluate_all("els => els.map(el => el.dataset.buttonId)")
    colour = swatches.first.locator(".bsh-mock__icon").evaluate("el => getComputedStyle(el).backgroundColor")
    checks.add("toolbar swatches follow the palette", len(ids) == 4 and ids[0].startswith("paint-112233"), ids)
    checks.add("first swatch uses the custom colour", colour == "rgb(17, 34, 51)", colour)
    page.keyboard.press("Escape")
    open_tool_settings(page, "Paint brushes")
    page.get_by_role("button", name="Reset palette").click()
    checks.add("reset palette restores three swatches", page.get_by_label(re.compile(r"^Swatch \d$")).count() == 3)
    page.keyboard.press("Escape")
    settle(page, 400)


def check_recents(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page)
    page.get_by_role("button", name=STRIP_TOGGLE).click()
    settle(page, 200)
    recent = page.get_by_role("region", name="Recent")
    checks.add("recent strip lists the opened model above the tree", recent.count() == 1 and recent.get_by_role("listitem").count() >= 1)
    above = page.evaluate("() => { const strip = document.querySelector('.recent-strip'); const tree = document.querySelector('.doc-tree'); return strip && tree ? strip.getBoundingClientRect().bottom <= tree.getBoundingClientRect().top + 1 : false; }")
    checks.add("recent strip sits above the tree", above)
    pin = recent.get_by_role("button", name=re.compile(r"^Pin ")).first
    pin.click()
    settle(page, 200)
    pinned = page.get_by_role("region", name="Pinned")
    checks.add("pinning moves the model to Pinned", pinned.count() == 1 and pinned.get_by_role("listitem").count() == 1)
    page.reload(wait_until="networkidle")
    settle(page, 1500)
    page.get_by_role("button", name=STRIP_TOGGLE).click()
    settle(page, 200)
    checks.add("pin survives a reload", page.get_by_role("region", name="Pinned").count() == 1)
    url_before = page.url
    page.get_by_role("region", name="Pinned").get_by_role("button", name=re.compile(r"^(?!Unpin)")).first.click()
    settle(page, 500)
    checks.add("clicking a pinned model opens it", "/model/" in page.url, page.url)
    page.get_by_role("region", name="Pinned").get_by_role("button", name=re.compile(r"^Unpin ")).first.click()
    checks.add("unpinning removes the Pinned section", page.get_by_role("region", name="Pinned").count() == 0)
    page.mouse.move(DESKTOP[0] - 10, DESKTOP[1] - 10)
    page.set_viewport_size({"width": MOBILE[0], "height": MOBILE[1]})
    settle(page, 600)
    page.get_by_role("button", name=TREE_TOGGLE).first.click()
    settle(page, 500)
    checks.add("recent strip is inside the narrow tree overlay with no overflow", page.locator(".stack__tree:not([hidden]) .recent-strip").count() == 1 and horizontal_overflow(page) <= 0)
    page.screenshot(path=str(OUTPUT_DIR / "mock-recents-narrow.png"))
    page.keyboard.press("Escape")
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page, 800)


def strip_expanded(page):
    return page.locator(".recent-strip__toggle").get_attribute("aria-expanded") == "true"


def strip_geometry(page):
    return page.evaluate("() => { const t = document.querySelector('.recent-strip__toggle').getBoundingClientRect(); const d = document.querySelector('.doc-tree').getBoundingClientRect(); return { header: t.height, treeTop: d.top }; }")


def check_strip(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page)
    page.mouse.move(DESKTOP[0] - 10, DESKTOP[1] - 10)
    page.wait_for_timeout(400)
    toggle = page.locator(".recent-strip__toggle")
    checks.add("recent strip starts collapsed with a counted header", not strip_expanded(page) and re.search(r"\(\d+\)", toggle.inner_text()) is not None, toggle.inner_text())
    closed = strip_geometry(page)
    toggle.hover()
    page.wait_for_timeout(300)
    checks.add("hovering the strip header expands it", strip_expanded(page) and page.locator(".recent-strip__panel").is_visible())
    small = page.evaluate("() => [...document.querySelectorAll('.recent-strip__pin, .recent-strip__more')].map((e) => { const b = e.getBoundingClientRect(); return Math.min(b.width, b.height); })")
    checks.add("strip pin and more buttons are at least 24px", bool(small) and min(small) >= 24, small)
    open_ = strip_geometry(page)
    checks.add("the expanded strip overlays the tree without reflow", abs(open_["header"] - closed["header"]) < 1 and abs(open_["treeTop"] - closed["treeTop"]) < 1, f"{closed} {open_}")
    page.screenshot(path=str(OUTPUT_DIR / "mock-strip-expanded.png"))
    page.mouse.move(DESKTOP[0] - 10, DESKTOP[1] - 10)
    page.wait_for_timeout(500)
    checks.add("leaving the strip collapses it again", not strip_expanded(page))

    rows = ensure_viewables(page)
    target = unselected_version(rows)
    first_urn = models(page)["active"]
    target.click(button="right")
    menu = page.get_by_role("menu")
    checks.add("right click on a version opens the model menu", menu.count() == 1 and menu.get_by_role("menuitem", name="Open as modal").count() == 1)
    page.screenshot(path=str(OUTPUT_DIR / "mock-row-menu.png"))
    menu.get_by_role("menuitem", name="Add to open model").click()
    settle(page, 800)
    checks.add("Add to open model puts the version into the url with=", "with=" in page.url, page.url)
    target.hover()
    remove = target.locator(".tree-row__action--remove")
    checks.add("an added version shows a remove button on hover", remove.count() == 1 and remove.is_visible())
    remove_box = remove.bounding_box()
    checks.add("the tree row remove button is at least 24px", remove_box["width"] >= 24 and remove_box["height"] >= 24, remove_box)
    page.get_by_role("tab", name="Models", exact=True).click()
    settle(page, 400)
    row = page.locator(".bsh-models__row").first
    name_box = row.locator(".bsh-models__name").bounding_box()
    remove_button = row.get_by_role("button", name=re.compile(r"^Remove ")).bounding_box()
    checks.add("the Models row keeps Remove on the name line", abs((remove_button["y"] + remove_button["height"] / 2) - (name_box["y"] + name_box["height"] / 2)) <= 12, f"{name_box} {remove_button}")
    page.screenshot(path=str(OUTPUT_DIR / "mock-models-tab.png"))
    page.get_by_role("tab", name="Documents", exact=True).click()
    settle(page, 400)
    target.click(button="right")
    menu = page.get_by_role("menu")
    checks.add("the menu offers Remove once the version is added", menu.get_by_role("menuitem", name="Remove from open model").count() == 1 and menu.get_by_role("menuitem", name="Add to open model").count() == 0)
    menu.get_by_role("menuitem", name="Remove from open model").click()
    settle(page, 800)
    checks.add("Remove from open model clears with= again", "with=" not in page.url, page.url)

    target.click(button="right")
    page.get_by_role("menu").get_by_role("menuitem", name="Open as modal").click()
    settle(page, 1500)
    state = models(page)
    modal_urn = state["active"]
    floating = wait_until(page, lambda: page.evaluate(f"mw:() => window.__bshLayout.location('viewer:{modal_urn}')") == "floating")
    checks.add("Open as modal floats the model in its own pane", modal_urn != first_urn and bool(floating), modal_urn)
    page.screenshot(path=str(OUTPUT_DIR / "mock-open-as-modal.png"))
    page.evaluate(f"mw:() => window.__bshLayout.closeModel('{modal_urn}')")
    settle(page, 800)

    page.set_viewport_size({"width": MOBILE[0], "height": MOBILE[1]})
    settle(page, 600)
    page.get_by_role("button", name=TREE_TOGGLE).first.click()
    settle(page, 500)
    toggle = page.locator(".stack__tree:not([hidden]) .recent-strip__toggle")
    page.screenshot(path=str(OUTPUT_DIR / "mock-strip-narrow-collapsed.png"))
    checks.add("narrow strip is collapsed until tapped", toggle.get_attribute("aria-expanded") == "false")
    toggle.click()
    settle(page, 300)
    checks.add("tapping the header expands the strip", toggle.get_attribute("aria-expanded") == "true")
    page.locator(".stack__tree:not([hidden]) .recent-strip__more").first.click()
    settle(page, 300)
    checks.add("the kebab button opens the menu on touch width", page.get_by_role("menu").count() == 1)
    page.screenshot(path=str(OUTPUT_DIR / "mock-strip-narrow-menu.png"))
    page.keyboard.press("Escape")
    checks.add("Escape closes the menu", page.get_by_role("menu").count() == 0)
    toggle.click()
    settle(page, 300)
    checks.add("tapping the header again collapses the strip", toggle.get_attribute("aria-expanded") == "false")
    page.keyboard.press("Escape")
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page, 800)


def tree_item_dates(page):
    return page.evaluate("() => [...document.querySelectorAll(\".tree-row[data-kind='item'] .tree-row__meta\")].map((el) => el.textContent)")


VIEW_BUTTON_OFFSET = """() => {
    const button = document.querySelector("button[aria-label='Documents view']");
    const icon = button.querySelector("svg").getBoundingClientRect();
    const box = button.getBoundingClientRect();
    const refresh = document.querySelector("button[aria-label='Refresh documents']").getBoundingClientRect();
    return {
        dx: icon.x + icon.width / 2 - (box.x + box.width / 2),
        dy: icon.y + icon.height / 2 - (box.y + box.height / 2),
        rowDy: box.y + box.height / 2 - (refresh.y + refresh.height / 2),
        sizeDiff: Math.abs(box.width - refresh.width) + Math.abs(box.height - refresh.height),
    };
}"""


def check_view_button(page, checks, label):
    off = page.evaluate(VIEW_BUTTON_OFFSET)
    checks.add(f"view button icon is centred ({label})", abs(off["dx"]) <= 1 and abs(off["dy"]) <= 1, off)
    checks.add(f"view button aligns with refresh ({label})", abs(off["rowDy"]) <= 1 and off["sizeDiff"] <= 1, off)


def check_tree_metadata(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page)
    check_view_button(page, checks, "desktop")
    page.set_viewport_size({"width": MOBILE[0], "height": MOBILE[1]})
    settle(page, 400)
    check_view_button(page, checks, "390 wide")
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page, 400)
    dates = tree_item_dates(page)
    checks.add("file rows show their modified date", len(dates) >= 2 and all(re.fullmatch(r"\d{4}-\d{2}-\d{2}", d) for d in dates), dates)
    page.get_by_role("button", name="Documents view").click()
    page.get_by_role("menuitemcheckbox", name="Sort by modified").click()
    settle(page, 800)
    groups_sorted = page.evaluate("""() => {
        const rows = [...document.querySelectorAll('.tree-row')];
        const runs = [];
        let run = [];
        for (const row of rows) {
            if (row.dataset.kind === 'item') run.push(row.querySelector('.tree-row__meta')?.textContent || '');
            else if (run.length) { runs.push(run); run = []; }
        }
        if (run.length) runs.push(run);
        return runs.filter((r) => r.length > 1).map((r) => r.every((d, i) => i === 0 || r[i - 1] >= d));
    }""")
    checks.add("sort by modified lists the newest file first in each folder", len(groups_sorted) >= 1 and all(groups_sorted), groups_sorted)
    page.get_by_role("button", name="Documents view").click()
    page.get_by_role("menuitemcheckbox", name="Show author").click()
    settle(page, 300)
    checks.add("author column adds the modifier", all(" · " in d for d in tree_item_dates(page)), tree_item_dates(page))
    checks.add("tree view choice is stored", "modified" in page.evaluate("() => localStorage.getItem('bsh.tree.view')"))
    page.evaluate("() => { document.querySelector('.tree-panel').style.width = '260px'; }")
    settle(page, 300)
    hidden = page.evaluate("() => [...document.querySelectorAll('.tree-row__meta')].every((el) => getComputedStyle(el).display === 'none')")
    checks.add("narrow tree hides the metadata columns", hidden)
    page.evaluate("() => { document.querySelector('.tree-panel').style.width = ''; }")
    page.get_by_role("button", name="Documents view").click()
    page.get_by_role("menuitemcheckbox", name="Show author").click()
    page.get_by_role("button", name="Documents view").click()
    page.get_by_role("menuitemcheckbox", name="Sort by name").click()
    settle(page, 500)
    page.set_viewport_size({"width": MOBILE[0], "height": MOBILE[1]})
    settle(page, 600)
    checks.add("tree metadata has no overflow at 390 wide", horizontal_overflow(page) <= 0)
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page, 800)


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
    return page.locator("[data-active='true'] .bsh-viewer-models .bsh-viewer-models__trigger")


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

    try:
        glb_path = OUTPUT_DIR / "combined-export.glb"
        size, magic = download_glb(page, glb_path)
        checks.add("combined: geometry export downloads a GLB", size > 1000 and magic == GLB_MAGIC, f"{size} bytes")
        glb_check(checks, glb_path, "combined GLB")
    except Exception as exc:
        checks.add("combined: geometry export downloads a GLB", False, f"{type(exc).__name__}: {str(exc)[:160]}")

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
    checks.add("combined: a file without geometry explains itself", "Nothing to show" in text, text[:160])
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
    addable = page.locator("[role=treeitem][data-viewable=true] .tree-row__action:not(.tree-row__action--remove)").count()
    target = page.locator("[role=treeitem][data-viewable=true]").filter(has=page.locator(".tree-row__action:not(.tree-row__action--remove)")).first
    if target.count():
        target.hover()
        target.locator(".tree-row__action:not(.tree-row__action--remove)").click()
        wait_until(page, lambda: len(combined_groups(page)) == 2)
    checks.add("combined: Add to open viewer adds a version to the active tab", addable >= 1 and len(combined_groups(page)) == 2 and len(models(page)["models"]) == 1, combined_groups(page))

    six = ",".join(f"{urn}-extra{index}" for index in range(5))
    page.goto(f"{BASE_URL}/model/{urn}?with={six}", wait_until="networkidle")
    settle(page, 2000)
    models_trigger(page).click()
    add = page.get_by_role("menuitem", name=re.compile(r"^Add model"))
    checks.add("combined: the menu explains the cap of six", add.count() == 1 and "limit of 6" in add.inner_text() and add.is_disabled(), add.inner_text() if add.count() else "")
    page.keyboard.press("Escape")
    close_all_models(page)


ACTIVE_VIEWER = "[data-active='true']"
STUB_CLIPBOARD = """mw:() => {
    window.__copied = null;
    window.__images = 0;
    navigator.clipboard.writeText = (text) => { window.__copied = text; return Promise.resolve(); };
    return true;
}"""
COPIED = "mw:() => window.__copied"
CAMERA = "() => document.querySelector(\"[data-active='true'] .bsh-mock\")?.dataset.camera || ''"
SELECTED = "() => document.querySelectorAll(\"[data-active='true'] .bsh-mock__el--selected\").length"
PNG_MAGIC = b"\x89PNG"


def share_menu(page, item):
    page.locator(f"{ACTIVE_VIEWER} .bsh-viewer-share button").click()
    page.get_by_role("menuitem", name=item).click()


def check_viewer_links(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    close_all_models(page)
    page.goto(BASE_URL, wait_until="networkidle")
    expand_to_viewable(page).click()
    page.wait_for_url(re.compile(r"/model/"), timeout=15000)
    urn = models(page)["active"]
    second = f"{urn}-second"
    page.goto(f"{BASE_URL}/model/{urn}?with={second}", wait_until="networkidle")
    settle(page, 1500)
    wait_until(page, lambda: len(combined_groups(page)) == 2)
    page.evaluate(STUB_CLIPBOARD)

    page.locator(f"{ACTIVE_VIEWER} [data-model-id='{urn}'] polygon").nth(3).dispatch_event("click")
    share_menu(page, "Copy link to this view")
    wait_until(page, lambda: page.evaluate(COPIED))
    link = page.evaluate(COPIED) or ""
    checks.add("share: the view link carries view and the model set", "view=" in link and "with=" in link, link[-160:])
    checks.add("share: the badge confirms the copy", page.get_by_text("Link copied").count() == 1)

    share_menu(page, "Copy link to these models")
    wait_until(page, lambda: page.evaluate(COPIED) != link)
    plain = page.evaluate(COPIED) or ""
    checks.add("share: the model link keeps with and drops view", "with=" in plain and "view=" not in plain, plain[-160:])

    page.goto(link, wait_until="networkidle")
    settle(page, 2000)
    wait_until(page, lambda: len(combined_groups(page)) == 2)
    wait_until(page, lambda: page.evaluate(CAMERA))
    checks.add("share: opening the link restores the camera", bool(page.evaluate(CAMERA)), page.evaluate(CAMERA))
    checks.add("share: opening the link restores the selection", page.evaluate(SELECTED) == 1, page.evaluate(SELECTED))

    with page.expect_download(timeout=30000) as download_info:
        share_menu(page, "Save image (PNG)")
    target = OUTPUT_DIR / "snapshot.png"
    download_info.value.save_as(str(target))
    checks.add("snapshot: Save image downloads a PNG", target.read_bytes()[:4] == PNG_MAGIC and target.stat().st_size > 200, target.stat().st_size)

    chip = page.locator(f"{ACTIVE_VIEWER} .bsh-viewer-models .bsh-viewer-models__trigger").first
    text = (chip.inner_text() if chip.count() else "") + " | " + (chip.get_attribute("title") or "")
    checks.add("meter: the chip shows how many of six models are open and its tooltip the parts estimate", "2 of 6 models" in text and "parts (estimate)" in text, text)
    checks.add("meter: no plain summary text sits over the 3D scene", page.locator(f"{ACTIVE_VIEWER} .bsh-viewer-cost__count, {ACTIVE_VIEWER} .bsh-viewer-cost__parts").count() == 0)

    page.set_viewport_size({"width": MOBILE[0], "height": MOBILE[1]})
    settle(page, 600)
    share = page.locator(f"{ACTIVE_VIEWER} .bsh-viewer-share button").bounding_box()
    trigger = page.locator(f"{ACTIVE_VIEWER} .bsh-viewer-models .bsh-viewer-models__trigger").first.bounding_box()
    fits = bool(share and trigger) and share["x"] + share["width"] <= MOBILE[0] and (trigger["x"] + trigger["width"] <= share["x"])
    checks.add("narrow: Share and Models controls fit side by side", fits, f"{share} {trigger}")
    checks.add("narrow: no horizontal overflow with the meter and share", horizontal_overflow(page) <= 0, horizontal_overflow(page))
    page.screenshot(path=str(OUTPUT_DIR / "mock-share-narrow.png"))
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})

    five = ",".join(f"{urn}-m{index}" for index in range(4))
    page.goto(f"{BASE_URL}/model/{urn}?with={five}", wait_until="networkidle")
    settle(page, 2000)
    text = page.locator(f"{ACTIVE_VIEWER} .bsh-viewer-cost").inner_text()
    checks.add("meter: warns before the sixth model", "One more model fits" in text, text)

    page.goto(f"{BASE_URL}/model/{urn}?with={urn}-processing,{urn}-nogeom", wait_until="networkidle")
    settle(page, 2000)
    failed = page.get_by_role("list", name="Models that failed")
    wait_until(page, lambda: failed.count() == 1)
    text = failed.inner_text() if failed.count() else ""
    checks.add("failures: processing and empty files get plain reasons", "Still processing" in text and "Nothing to show" in text, text[:200])
    checks.add("failures: only the retryable file offers Retry", failed.get_by_role("button", name=re.compile(r"^Retry")).count() == 1)

    page.goto(f"{BASE_URL}/model/{urn}-noaccess", wait_until="networkidle")
    settle(page, 1500)
    alert = page.get_by_role("alert").filter(has_text="No access")
    checks.add("failures: a model without access says so", alert.count() >= 1)
    page.screenshot(path=str(OUTPUT_DIR / "mock-no-access.png"))

    page.goto(f"{BASE_URL}/model/{urn}?with={second}", wait_until="networkidle")
    settle(page, 2000)
    docs_tab = page.get_by_role("tab", name="Documents", exact=True)
    models_tab = page.get_by_role("tab", name="Models", exact=True)
    checks.add("models pane: open by default as a tab beside Documents", models_tab.count() == 1 and page.evaluate(SAME_GROUP, ["Documents", "Models"]), models_tab.count())
    checks.add("models pane: Documents stays the active tab", docs_tab.get_attribute("aria-selected") == "true")
    models_tab.click()
    pane = page.locator(".pane-models")
    wait_until(page, lambda: pane.count() == 1 and pane.locator(".bsh-models__row").count() == 2)
    rows = pane.locator(".bsh-models__row")
    checks.add("models pane: lists both models with a status", rows.count() == 2 and pane.locator("[data-status='ready']").count() >= 2, rows.count())
    pane.get_by_role("button", name=re.compile(r"^Hide ")).first.click()
    settle(page, 400)
    checks.add("models pane: the eye hides a model", [g["hidden"] for g in combined_groups(page)].count(True) == 1, combined_groups(page))
    pane.get_by_role("button", name=re.compile(r"^Show ")).first.click()
    pane.get_by_role("button", name=re.compile(r"^Isolate ")).first.click()
    settle(page, 400)
    checks.add("models pane: Isolate hides the others", [g["hidden"] for g in combined_groups(page)].count(True) == 1, combined_groups(page))
    flipped = pane.get_by_role("button", name="Show all models")
    checks.add("models pane: the isolated row flips to Show all and is pressed", flipped.count() == 1 and flipped.get_attribute("aria-pressed") == "true", flipped.count())
    page.screenshot(path=str(OUTPUT_DIR / "mock-models-pane.png"))
    hidden_before = [g["hidden"] for g in combined_groups(page)]
    page.reload(wait_until="networkidle")
    settle(page, 2000)
    page.get_by_role("tab", name="Models", exact=True).click()
    pane = page.locator(".pane-models")
    wait_until(page, lambda: pane.get_by_role("button", name="Show all models").count() == 1)
    checks.add("models pane: reload restores the isolation", [g["hidden"] for g in combined_groups(page)] == hidden_before and pane.get_by_role("button", name="Show all models").count() == 1, combined_groups(page))
    page.set_viewport_size({"width": MOBILE[0], "height": MOBILE[1]})
    settle(page, 800)
    checks.add("models pane: narrow screen keeps the isolation and shows no Models tab", [g["hidden"] for g in combined_groups(page)] == hidden_before and page.get_by_role("tab", name="Models", exact=True).count() == 0, combined_groups(page))
    page.screenshot(path=str(OUTPUT_DIR / "mock-models-pane-narrow.png"))
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page, 800)
    page.get_by_role("tab", name="Models", exact=True).click()
    pane = page.locator(".pane-models")
    pane.get_by_role("button", name="Show all models").click()
    settle(page, 400)
    checks.add("models pane: Show all brings every model back", [g["hidden"] for g in combined_groups(page)].count(True) == 0, combined_groups(page))
    pane.get_by_role("button", name=re.compile(r"^Remove ")).last.click()
    settle(page, 800)
    checks.add("models pane: Remove drops the model from the url", "with=" not in page.url, page.url)
    page.get_by_role("tab", name="Documents", exact=True).click()
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


def state_versions(page, file_name):
    first = expand_state_rows(page, file_name)
    first.wait_for(timeout=15000)
    file_row = first.locator("xpath=preceding-sibling::*[@role='treeitem'][1]")
    rows = file_row.locator("xpath=following-sibling::*[@role='treeitem']")
    found = []
    for index in range(rows.count()):
        row = rows.nth(index)
        if row.get_attribute("data-kind") != "version":
            break
        found.append(row)
    return found


def check_blocked_picks(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    close_all_models(page)
    page.goto(BASE_URL, wait_until="networkidle")
    blocked = state_versions(page, "STATE-no-geometry.rvt")
    ready = state_versions(page, "STATE-ready.rvt")
    checks.add("blocked picks: fixture rows are listed", bool(blocked) and bool(ready), f"{len(blocked)} blocked, {len(ready)} ready")
    notice = page.locator(".doc-tree__notice[role=status][aria-live=polite]")
    blocked[0].click(modifiers=["ControlOrMeta"], force=True)
    page.wait_for_timeout(400)
    checks.add("blocked picks: Ctrl or Cmd click on a blocked version is not picked", page.locator("[role=treeitem][aria-checked='true']").count() == 0 and blocked[0].get_attribute("aria-checked") is None)
    checks.add("blocked picks: Ctrl or Cmd click explains why", "cannot be opened" in notice.inner_text(), notice.inner_text()[:160])
    blocked[0].focus()
    page.keyboard.press("Space")
    page.wait_for_timeout(300)
    checks.add("blocked picks: Space on a blocked version shows the notice and picks nothing", "cannot be opened" in notice.inner_text() and page.locator("[role=treeitem][aria-checked='true']").count() == 0)
    ready[0].click(modifiers=["ControlOrMeta"])
    blocked[0].click(modifiers=["Shift"], force=True)
    page.wait_for_timeout(400)
    picked = page.locator("[role=treeitem][aria-checked='true']").count()
    blocked_picked = sum(1 for row in blocked if row.get_attribute("aria-checked") == "true")
    text = notice.inner_text()
    checks.add("blocked picks: a Shift range skips blocked versions", picked >= 1 and blocked_picked == 0, f"{picked} picked, {blocked_picked} blocked picked")
    checks.add("blocked picks: the skip is announced", "Skipped" in text and "cannot be opened" in text, text[:160])
    page.get_by_role("button", name="Clear").click()
    ready[0].click()
    wait_until(page, lambda: models(page)["active"])
    settle(page, 800)
    blocked_buttons = sum(row.locator(".tree-row__action").count() for row in blocked)
    checks.add("blocked picks: blocked versions get no add-to-viewer button", blocked_buttons == 0, blocked_buttons)
    close_all_models(page)


FAR_OFFSET = "(urn) => document.querySelector(`[data-active='true'] [data-model-id='${urn}']`)?.dataset.offset || ''"


def check_far_apart(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    close_all_models(page)
    page.goto(BASE_URL, wait_until="networkidle")
    expand_to_viewable(page).click()
    page.wait_for_url(re.compile(r"/model/"), timeout=15000)
    urn = models(page)["active"]
    far = f"{urn}-far"
    page.goto(f"{BASE_URL}/model/{urn}?with={far}", wait_until="networkidle")
    warning = page.locator("[data-active='true'] .bsh-viewer-models__far")
    wait_until(page, lambda: warning.count() == 1)
    text = warning.inner_text() if warning.count() else ""
    checks.add("far apart: the models menu warns with the distance", "far apart in model space" in text and " km" in text, text[:160])
    tooltip = (page.evaluate(VIEWER_TAB) or {}).get("title", "")
    checks.add("far apart: the tab tooltip carries the warning", "far apart in model space" in tooltip, tooltip[-120:])
    page.get_by_role("button", name="Bring models together (view only)").click()
    wait_until(page, lambda: page.evaluate(FAR_OFFSET, far) == "moved")
    checks.add("far apart: Bring models together moves the far model", page.evaluate(FAR_OFFSET, far) == "moved")
    page.reload(wait_until="networkidle")
    settle(page, 2000)
    wait_until(page, lambda: page.evaluate(FAR_OFFSET, far) == "moved")
    checks.add("far apart: positions survive a reload", page.evaluate(FAR_OFFSET, far) == "moved")
    page.get_by_role("button", name="Restore positions").first.click()
    wait_until(page, lambda: page.evaluate(FAR_OFFSET, far) == "original")
    checks.add("far apart: Restore positions puts the model back", page.evaluate(FAR_OFFSET, far) == "original")
    page.screenshot(path=str(OUTPUT_DIR / "mock-far-apart.png"))
    close_all_models(page)


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


def check_presentation_mode(page, checks):
    try:
        page.get_by_role("button", name="Panes").click()
        page.get_by_role("menuitem", name="Present").click()
        page.wait_for_timeout(500)
        hidden = page.evaluate(
            "() => ({present: document.documentElement.hasAttribute('data-presenting'),"
            " top: getComputedStyle(document.querySelector('.topbar')).display,"
            " tabs: [...document.querySelectorAll('.dv-tabs-and-actions-container')].every(e => getComputedStyle(e).display === 'none'),"
            " viewerShare: document.querySelector('.bsh-viewer-pane').getBoundingClientRect().width / innerWidth})"
        )
        checks.add(
            "presentation mode hides the chrome and leaves one pane",
            hidden["present"] and hidden["top"] == "none" and hidden["tabs"] and hidden["viewerShare"] > 0.95,
            hidden,
        )
        page.screenshot(path=str(OUTPUT_DIR / "mock-presenting.png"))
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        restored = page.evaluate(
            "() => ({present: document.documentElement.hasAttribute('data-presenting'),"
            " top: getComputedStyle(document.querySelector('.topbar')).display})"
        )
        checks.add(
            "Escape restores the layout after presenting",
            not restored["present"] and restored["top"] != "none" and page.get_by_role("tab").count() >= 2,
            restored,
        )
    except Exception as exc:
        checks.add("presentation mode", False, f"{type(exc).__name__}: {str(exc)[:160]}")


def png_size(path):
    data = path.read_bytes()
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


def snapshot_to(page, target):
    with page.expect_download(timeout=30000) as download_info:
        share_menu(page, "Save image (PNG)")
    download_info.value.save_as(str(target))


SNAPSHOT_KEY = "bsh.snapshot.v1"


def set_snapshot_settings(page, value):
    page.evaluate("([key, value]) => localStorage.setItem(key, JSON.stringify(value))", [SNAPSHOT_KEY, value])


def drop_viewpoints(page):
    page.evaluate(
        """() => {
            const raw = localStorage.getItem('bsh.saved.v1');
            if (!raw) return;
            const data = JSON.parse(raw);
            data.items = data.items.filter((item) => item.kind !== 'viewpoint');
            localStorage.setItem('bsh.saved.v1', JSON.stringify(data));
        }"""
    )


def position(page):
    return page.locator(".present-position [aria-hidden='true']").inner_text().replace("\xa0", " ").strip()


def check_snapshots_viewpoints_present(page, checks):
    try:
        page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
        settle(page)
        page.evaluate("(key) => localStorage.removeItem(key)", SNAPSHOT_KEY)
        base = OUTPUT_DIR / "snapshot-1x.png"
        snapshot_to(page, base)
        set_snapshot_settings(page, {"resolution": "2x", "overlay": True})
        double = OUTPUT_DIR / "snapshot-2x-caption.png"
        snapshot_to(page, double)
        (w1, h1), (w2, h2) = png_size(base), png_size(double)
        checks.add(
            "snapshot: 2x with the caption produces a larger image",
            w2 >= w1 * 2 - 2 and h2 >= h1 * 2 - 2 and double.stat().st_size > base.stat().st_size,
            f"{w1}x{h1} -> {w2}x{h2}",
        )
        set_snapshot_settings(page, {"resolution": "custom", "customWidth": 8192, "overlay": False})
        share_menu(page, "Save image (PNG)")
        page.get_by_text("Snapshot too large").wait_for(timeout=5000)
        checks.add("snapshot: a size over the cap fails visibly", True)
        page.evaluate("(key) => localStorage.removeItem(key)", SNAPSHOT_KEY)

        drop_viewpoints(page)
        for _ in range(2):
            share_menu(page, "Save viewpoint")
            page.wait_for_timeout(300)
        page.locator(f"{ACTIVE_VIEWER} .bsh-viewer-share button").click()
        listed = page.get_by_role("menuitem").filter(has_text="Go to Viewpoint").count()
        page.screenshot(path=str(OUTPUT_DIR / "mock-viewpoints-menu.png"))
        page.keyboard.press("Escape")
        checks.add("viewpoints: two saved viewpoints are listed in the Share menu", listed == 2, listed)

        before = groups(page)["Model summary"]
        pane_menu(page, "Model summary", "Maximize")
        maximized = groups(page)["Model summary"]
        page.get_by_role("button", name="Panes").click()
        page.get_by_role("menuitem", name="Present").click()
        page.wait_for_timeout(500)
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(300)
        first = position(page)
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(300)
        second = position(page)
        announced = page.locator(".present-position [role='status']").inner_text()
        page.keyboard.press("ArrowLeft")
        page.wait_for_timeout(300)
        back = position(page)
        page.keyboard.press("Space")
        page.wait_for_timeout(300)
        spaced = position(page)
        checks.add(
            "present: arrows and Space cycle viewpoints with a position indicator",
            (first, second, back, spaced) == ("1 / 2", "2 / 2", "1 / 2", "2 / 2") and "Viewpoint 2 of 2" in announced,
            (first, second, back, spaced, announced),
        )
        page.screenshot(path=str(OUTPUT_DIR / "mock-presenting-viewpoints.png"))
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        restored = groups(page).get("Model summary", {})
        width = restored.get("right", 0) - restored.get("left", 0)
        checks.add(
            "present: exit restores the previously maximized pane",
            not page.evaluate("() => document.documentElement.hasAttribute('data-presenting')")
            and abs(width - (maximized["right"] - maximized["left"])) <= 2
            and width > before["right"] - before["left"] + 200,
            restored,
        )
        page.keyboard.press("Escape")
        settle(page)

        page.set_viewport_size({"width": MOBILE[0], "height": MOBILE[1]})
        settle(page)
        share_menu(page, "Present")
        page.wait_for_timeout(500)
        narrow = page.evaluate(
            "() => ({present: document.documentElement.hasAttribute('data-presenting'),"
            " tabs: getComputedStyle(document.querySelector('.stack__models')).display,"
            " viewer: document.querySelector('.bsh-viewer-pane').getBoundingClientRect().height / innerHeight})"
        )
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(300)
        narrow_position = position(page)
        page.screenshot(path=str(OUTPUT_DIR / "mock-presenting-narrow.png"))
        checks.add(
            "present: the narrow layout enters Present from the Share menu and cycles",
            narrow["present"] and narrow["tabs"] == "none" and narrow["viewer"] > 0.9 and narrow_position == "1 / 2",
            (narrow, narrow_position),
        )
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        checks.add(
            "present: Escape leaves Present on the narrow layout",
            not page.evaluate("() => document.documentElement.hasAttribute('data-presenting')"),
        )
    except Exception as exc:
        checks.add("snapshots, viewpoints and present", False, f"{type(exc).__name__}: {str(exc)[:200]}")
    finally:
        drop_viewpoints(page)
        page.evaluate("(key) => localStorage.removeItem(key)", SNAPSHOT_KEY)
        page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
        settle(page)


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
    box = open_palette(page)
    box.fill("present")
    option = palette(page).get_by_role("option", name=re.compile("Present"))
    checks.add(
        "Present is disabled with a reason when no model is open",
        option.count() >= 1 and option.first.get_attribute("aria-disabled") == "true" and "Open a model first" in option.first.inner_text(),
        option.first.inner_text() if option.count() else "",
    )
    page.keyboard.press("Escape")
    settle(page, 200)


def check_task_center(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page)
    if not models(page)["models"]:
        page.locator("[role=treeitem][data-viewable=true]").first.click()
        wait_until(page, lambda: models(page)["active"])
        settle(page, 1000)
    trigger = page.get_by_role("button", name=re.compile(r"^Tasks"))
    checks.add("the top bar shows the task center once a model has loaded", trigger.count() == 1, trigger.count())
    trigger.click()
    popover = page.get_by_role("region", name="Tasks")
    checks.add("the task list names the model load as done", popover.get_by_text("Done").count() >= 1 and popover.get_by_text(re.compile(r"^Loading ")).count() >= 1, popover.inner_text())
    page.keyboard.press("Escape")
    checks.add("Escape closes the task list", page.get_by_role("region", name="Tasks").count() == 0)
    live = page.locator("[role=status][aria-live=polite]").filter(has_text=re.compile(r"Loading .* finished"))
    checks.add("one live region announces the finished load", live.count() == 1, live.count())


def check_export_tasks(page, checks):
    for label, download, name in (
        ("Exporting Excel", download_export, "export-tasks.xlsx"),
        ("Exporting geometry (GLB)", download_glb, "export-tasks.glb"),
        ("Exporting IFC", download_ifc, "export-tasks.ifc"),
    ):
        try:
            download(page, OUTPUT_DIR / name)
            live = page.locator("[role=status][aria-live=polite]").filter(has_text=f"{label} finished")
            wait_until(page, lambda: live.count() == 1)
            checks.add(f"export task: {label} is announced once", live.count() == 1, live.count())
        except Exception as exc:
            checks.add(f"export task: {label} is announced once", False, f"{type(exc).__name__}: {str(exc)[:160]}")
    page.get_by_role("button", name=re.compile(r"^Tasks")).click()
    popover = page.get_by_role("region", name="Tasks")
    text = popover.inner_text()
    checks.add("export task: the list shows the three exports with counts", all(label in text for label in ("Exporting Excel", "Exporting geometry (GLB)", "Exporting IFC")) and "Exported" in text, text)
    checks.add("export task: no export offers a cancel after finishing", popover.get_by_role("button", name="Cancel").count() == 0)
    page.keyboard.press("Escape")
    checks.add("export task: the pane no longer shows an export badge", page.locator(".bsh-viewer-badge").count() == 0)


def check_pane_families(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page)
    if not models(page)["models"]:
        page.locator("[role=treeitem][data-viewable=true]").first.click()
        wait_until(page, lambda: models(page)["active"])
        settle(page, 1000)
    charts = lambda: page.locator(".dv-tab").filter(has_text=re.compile(r"^Chart \d$"))
    for _ in range(2):
        page.get_by_role("button", name="Panes").click()
        page.get_by_role("menuitem", name="New chart").click()
        settle(page, 500)
    checks.add("New chart opens two chart panes", charts().count() == 2, charts().count())
    charts().nth(1).click()
    settle(page, 400)
    groupers = page.get_by_label("Group by")
    checks.add("a chart pane has its own property picker", groupers.count() == 1, groupers.count())
    groupers.first.select_option("Level")
    settle(page, 500)
    stored = lambda key: page.evaluate(f"() => JSON.parse(localStorage.getItem('{key}') || 'null')")
    checks.add("a chart spec is saved per instance", (stored("bsh.pane.chart.2.v1") or {}).get("property") == "Level" and stored("bsh.pane.chart.1.v1") is None, stored("bsh.pane.chart.2.v1"))
    page.get_by_role("button", name="Panes").click()
    page.get_by_role("menuitem", name="New model summary").click()
    settle(page, 500)
    summaries = lambda: page.locator(".dv-tab").filter(has_text=re.compile(r"^Model summary \d$"))
    checks.add("New model summary opens a pane", summaries().count() == 1, summaries().count())
    checks.add("the summary pane is pinned to the model it was made for", (stored("bsh.pane.modelSummary.1.v1") or {}).get("scope") == models(page)["active"], stored("bsh.pane.modelSummary.1.v1"))
    page.get_by_role("button", name="Panes").click()
    page.get_by_role("menuitem", name="New model summary").click()
    settle(page, 500)
    checks.add("a second summary pane opens", summaries().count() == 2, summaries().count())
    first_summary = page.locator(".pane-summary").filter(has=page.get_by_role("heading", name=re.compile(r"^Model summary 1"))).first
    first_summary.get_by_role("button", name="Summary settings").click()
    dialog = page.get_by_role("dialog", name="Summary settings")
    dialog.get_by_label("Density").select_option("compact")
    dialog.get_by_label("Sort by").select_option("value")
    settle(page, 300)
    page.keyboard.press("Escape")
    settle(page, 400)
    spec_one = stored("bsh.pane.modelSummary.1.v1") or {}
    spec_two = stored("bsh.pane.modelSummary.2.v1") or {}
    checks.add("one summary instance keeps its own density and sort", (spec_one.get("view") or {}).get("density") == "compact" and (spec_one.get("view") or {}).get("sort") == "value", spec_one)
    checks.add("another summary instance and the main pane are unchanged", (spec_two.get("view") or {}).get("density") == "comfortable" and (spec_two.get("view") or {}).get("sort") == "count" and (stored("bsh.summary.view.v1") or {}).get("density", "comfortable") == "comfortable", [spec_two, stored("bsh.summary.view.v1")])
    tab = summaries().nth(1)
    tab.hover()
    tab.locator(".dv-default-tab-action").click()
    settle(page, 500)
    page.reload()
    settle(page, 1500)
    checks.add("chart panes survive a reload", charts().count() == 2, charts().count())
    charts().nth(1).click()
    settle(page, 400)
    second = page.get_by_label("Group by").first.input_value()
    charts().nth(0).click()
    settle(page, 400)
    first = page.get_by_label("Group by").first.input_value()
    checks.add("chart specs survive a reload", second == "Level" and first != "Level", [first, second])
    checks.add("the summary pane survives a reload", summaries().count() == 1, summaries().count())
    for urn in [model["urn"] for model in models(page)["models"]]:
        page.evaluate(f"mw:() => window.__bshLayout.closeModel('{urn}')")
    wait_until(page, lambda: not models(page)["models"])
    page.reload()
    settle(page, 1500)
    checks.add("user panes are restored with no model open", charts().count() == 2 and summaries().count() == 1, [charts().count(), summaries().count()])
    checks.add("user panes show an empty state with no model open", page.get_by_text("No charts yet").count() >= 1 and page.get_by_text("No model loaded yet").count() == 1, [page.get_by_text("No charts yet").count(), page.get_by_text("No model loaded yet").count()])
    page.evaluate("mw:() => window.__bshLayout.movePane('chart:1', 'left')")
    settle(page, 500)
    home_side = tab_side(page, "Chart 1")
    checks.add("a user pane placed at home sits left of Documents", home_side == "left", home_side)
    expand_to_viewable(page).click()
    wait_until(page, lambda: models(page)["active"])
    settle(page, 1000)
    checks.add("user panes stay when a model opens again", charts().count() == 2 and summaries().count() == 1, [charts().count(), summaries().count()])
    checks.add("a user pane keeps its home placement when the first model opens", tab_side(page, "Chart 1") == "left", tab_side(page, "Chart 1"))
    page.reload()
    settle(page, 1500)
    checks.add("a user pane keeps its placement after a reload", tab_side(page, "Chart 1") == "left", tab_side(page, "Chart 1"))
    for urn in [model["urn"] for model in models(page)["models"]]:
        page.evaluate(f"mw:() => window.__bshLayout.closeModel('{urn}')")
    wait_until(page, lambda: not models(page)["models"])
    expand_to_viewable(page).click()
    wait_until(page, lambda: models(page)["active"])
    settle(page, 1000)
    checks.add("a user pane keeps its placement after closing all models and reopening", tab_side(page, "Chart 1") == "left", tab_side(page, "Chart 1"))
    tab = summaries().first
    tab.hover()
    tab.locator(".dv-default-tab-action").click()
    settle(page, 500)
    checks.add("closing the summary pane clears its spec", summaries().count() == 0 and stored("bsh.pane.modelSummary.1.v1") is None, stored("bsh.pane.modelSummary.1.v1"))
    tab = charts().first
    tab.hover()
    tab.locator(".dv-default-tab-action").click()
    settle(page, 500)
    checks.add("closing one chart pane keeps the other", charts().count() == 1, charts().count())
    tab = charts().first
    tab.hover()
    tab.locator(".dv-default-tab-action").click()
    settle(page, 500)
    checks.add("closing the last chart pane removes the family", charts().count() == 0, charts().count())


def tab_side(page, text):
    return page.evaluate(
        """(text) => {
            const tab = [...document.querySelectorAll('.dv-tab')].find((el) => el.textContent.trim() === text);
            const docs = [...document.querySelectorAll('.dv-tab')].find((el) => el.textContent.trim() === 'Documents');
            const a = tab?.closest('.dv-groupview')?.getBoundingClientRect();
            const b = docs?.closest('.dv-groupview')?.getBoundingClientRect();
            return a && b ? (a.left < b.left ? 'left' : 'right') : null;
        }""",
        text,
    )


def check_properties_pane(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page)
    if not models(page)["models"]:
        expand_to_viewable(page).click()
        wait_until(page, lambda: models(page)["active"])
        settle(page, 1000)
    page.get_by_role("button", name="Panes").click()
    page.get_by_role("menuitem", name="New properties").click()
    settle(page, 600)
    tab = page.locator(".dv-tab").filter(has_text=re.compile(r"^Properties \d$"))
    checks.add("New properties opens a pane", tab.count() == 1, tab.count())
    stored = page.evaluate("() => JSON.parse(localStorage.getItem('bsh.pane.properties.1.v1') || 'null')")
    checks.add("the properties pane is bound to the active model", (stored or {}).get("scope") == models(page)["active"], stored)
    checks.add("the properties pane asks for a selection", page.get_by_text("Select an element").count() == 1, page.get_by_text("Select an element").count())
    page.locator("[data-active='true'] [data-dbid]").first.click(force=True)
    settle(page, 800)
    checks.add("selecting an element lists its properties by category", page.locator(".bsh-props").get_by_text("Identity Data", exact=True).count() == 1 and page.locator(".bsh-props").get_by_text("Assembly Code", exact=True).count() == 1, page.locator(".bsh-props").inner_text())
    page.get_by_label("Filter properties").fill("level")
    settle(page, 300)
    props = page.locator(".bsh-props")
    checks.add("the properties filter narrows the list", props.get_by_text("Assembly Code", exact=True).count() == 0 and props.get_by_text("Level", exact=True).count() == 1, props.inner_text())
    page.get_by_label("Filter properties").fill("")
    page.evaluate("mw:() => window.__bshLayout.movePane('properties:1', 'float')")
    settle(page, 500)
    checks.add("a properties pane floats", page.evaluate("mw:() => window.__bshLayout.location('properties:1')") == "floating", "")
    page.reload()
    settle(page, 1500)
    checks.add("a floating properties pane survives a reload", page.locator(".dv-tab").filter(has_text=re.compile(r"^Properties \d$")).count() == 1 and page.evaluate("mw:() => window.__bshLayout.location('properties:1')") == "floating", "")
    tab = page.locator(".dv-tab").filter(has_text=re.compile(r"^Properties \d$")).first
    tab.hover()
    tab.locator(".dv-default-tab-action").click()
    settle(page, 500)
    checks.add("closing the properties pane clears its spec", page.locator(".dv-tab").filter(has_text=re.compile(r"^Properties \d$")).count() == 0 and page.evaluate("() => localStorage.getItem('bsh.pane.properties.1.v1')") is None, "")


def palette(page):
    return page.get_by_role("dialog", name="Command palette")


def open_palette(page):
    page.keyboard.press("Control+k")
    palette(page).wait_for(state="visible", timeout=3000)
    return palette(page).get_by_role("combobox")


def check_command_palette(page, checks):
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    settle(page)
    if not models(page)["models"]:
        expand_to_viewable(page).click()
        wait_until(page, lambda: models(page)["active"])
        settle(page, 1000)
    start = page.evaluate(ROOT_THEME)
    other = "light" if start == "dark" else "dark"
    anchor = page.get_by_role("button", name=THEME_TOGGLE).first
    anchor.focus()
    box = open_palette(page)
    checks.add("palette opens with Ctrl+K and focuses its search", box.evaluate("(el) => el === document.activeElement"), "")
    checks.add("palette search is a combobox tied to a listbox", box.get_attribute("aria-controls") is not None and palette(page).get_by_role("listbox").count() == 1, "")
    box.fill("theme")
    active_id = box.get_attribute("aria-activedescendant")
    checks.add("active descendant points at the first match", bool(active_id) and palette(page).locator(f"[id='{active_id}']").get_attribute("aria-selected") == "true", active_id)
    page.keyboard.press("Enter")
    settle(page, 300)
    checks.add("running the theme command flips the theme and closes the palette", page.evaluate(ROOT_THEME) == other and palette(page).count() == 0, page.evaluate(ROOT_THEME))
    box = open_palette(page)
    checks.add("a used command is listed under Recent", palette(page).get_by_text("Recent", exact=True).count() == 1, "")
    box.fill("theme")
    page.keyboard.press("Enter")
    settle(page, 300)
    checks.add("the theme command flips back", page.evaluate(ROOT_THEME) == start, page.evaluate(ROOT_THEME))
    anchor.focus()
    box = open_palette(page)
    box.fill("export excel")
    option = palette(page).get_by_role("option", name=re.compile("Export to Excel"))
    checks.add("export commands are listed and enabled with a model open", option.count() == 1 and option.get_attribute("aria-disabled") is None, option.count())
    box.fill("isolate sel")
    option = palette(page).get_by_role("option", name=re.compile("Isolate selection"))
    checks.add("element actions are disabled with a reason when nothing is selected", option.count() == 1 and option.get_attribute("aria-disabled") == "true" and "Select elements first" in option.inner_text(), option.inner_text() if option.count() else "")
    box.fill("pane")
    panes = palette(page).get_by_role("option").all_inner_texts()
    checks.add("pane commands are listed", any("Dashboard pane" in text for text in panes) and any("Model summary pane" in text for text in panes), panes[:6])
    page.keyboard.press("Escape")
    settle(page, 200)
    checks.add("Escape closes the palette and returns focus", palette(page).count() == 0 and anchor.evaluate("(el) => el === document.activeElement"), page.evaluate("() => document.activeElement?.outerHTML.slice(0, 120)"))
    box = open_palette(page)
    box.fill("geometry export settings")
    page.keyboard.press("Enter")
    settle(page, 400)
    checks.add("a tool settings command opens that tool window", page.get_by_role("dialog", name="Geometry export settings").is_visible(), "")
    page.keyboard.press("Escape")
    settle(page, 300)


def run_interaction_checks(page, checks, notes):
    try:
        check_layout(page, checks, notes)
    except Exception as exc:
        page.screenshot(path=str(OUTPUT_DIR / "mock-layout-failure.png"))
        checks.add("check_layout", False, f"{type(exc).__name__}: {str(exc)[:160]}")
    for check in (check_lock_maximize, check_active_pane, check_session_banner, check_saved_items, check_paint_palette, check_recents, check_strip, check_tree_metadata, check_theme, check_summary_rail, check_summary_tools, check_selection_sets, check_dashboard_tools, check_tree_resize):
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
        check_far_apart(page, checks)
    except Exception as exc:
        page.screenshot(path=str(OUTPUT_DIR / "mock-far-apart-failure.png"))
        checks.add("check_far_apart", False, f"{type(exc).__name__}: {str(exc)[:160]}")
    try:
        check_viewer_links(page, checks)
    except Exception as exc:
        page.screenshot(path=str(OUTPUT_DIR / "mock-viewer-links-failure.png"))
        checks.add("check_viewer_links", False, f"{type(exc).__name__}: {str(exc)[:160]}")
    try:
        check_command_palette(page, checks)
    except Exception as exc:
        page.screenshot(path=str(OUTPUT_DIR / "mock-command-palette-failure.png"))
        checks.add("check_command_palette", False, f"{type(exc).__name__}: {str(exc)[:160]}")
    try:
        check_blocked_picks(page, checks)
    except Exception as exc:
        page.screenshot(path=str(OUTPUT_DIR / "mock-blocked-picks-failure.png"))
        checks.add("check_blocked_picks", False, f"{type(exc).__name__}: {str(exc)[:160]}")
    for check in (check_task_center, check_export_tasks, check_pane_families, check_properties_pane):
        try:
            check(page, checks)
        except Exception as exc:
            page.screenshot(path=str(OUTPUT_DIR / f"mock-{check.__name__}-failure.png"))
            checks.add(check.__name__, False, f"{type(exc).__name__}: {str(exc)[:160]}")
    try:
        check_documents_return(page, checks)
    except Exception as exc:
        page.screenshot(path=str(OUTPUT_DIR / "mock-documents-failure.png"))
        checks.add("check_documents_return", False, f"{type(exc).__name__}: {str(exc)[:160]}")


HINT_TITLE = "No projects to show yet"
NOTICE_TITLE = "Looking for projects from ACC, BIM 360 or Forma?"
MOCK_CLIENT_ID = "MOCK-CLIENT-ID-NOT-A-REAL-KEY"
VARIANT = os.environ.get("E2E_MOCK_VARIANT", "").strip().lower()


def hint_count(page):
    return page.get_by_text(HINT_TITLE).count() + page.get_by_text(NOTICE_TITLE).count()


def check_no_hint(page, checks):
    checks.add("default mock data shows no missing-hubs hint", hint_count(page) == 0)


def shoot_hint(page, name):
    for label, (width, height) in (("desktop", DESKTOP), ("mobile", MOBILE)):
        page.set_viewport_size({"width": width, "height": height})
        settle(page)
        overflow = horizontal_overflow(page)
        checks_overflow = overflow <= 0
        page.screenshot(path=str(OUTPUT_DIR / f"mock-{name}-{label}-{page.evaluate(ROOT_THEME)}.png"))
        yield label, checks_overflow


def run_variant(context, checks, notes):
    page = context.new_page()
    watch(page, notes)
    page.on("dialog", lambda dialog: dialog.accept())
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    page.goto(BASE_URL, wait_until="networkidle")
    settle(page, 1200)
    if VARIANT == "empty":
        checks.add("empty hub list shows the full hint", page.get_by_role("heading", name=HINT_TITLE).count() == 1)
        checks.add("hint shows the placeholder client id", page.get_by_text(MOCK_CLIENT_ID).count() == 1)
        link = page.get_by_role("link", name=re.compile("How to add a custom integration"))
        checks.add(
            "help link opens safely in a new tab",
            link.get_attribute("target") == "_blank" and link.get_attribute("rel") == "noopener noreferrer",
        )
        checks.add("no hub rows in the empty state", page.locator("[role=treeitem]").count() == 0)
        checks.add("Check again button is present", page.get_by_role("button", name="Check again").count() == 1)
    else:
        checks.add("personal-only shows the notice", page.get_by_role("heading", name=NOTICE_TITLE).count() == 1)
        checks.add("tree still lists the personal hub", page.locator("[role=treeitem][aria-level='1']").count() == 1)
        notice_box = page.locator(".hub-notice").bounding_box()
        search_box = page.locator(".doc-tree__search").bounding_box()
        checks.add(
            "notice sits above the filter box",
            bool(notice_box and search_box and notice_box["y"] + notice_box["height"] <= search_box["y"] + 1),
        )
    for _ in range(2):
        for label, ok in shoot_hint(page, VARIANT):
            checks.add(f"no horizontal overflow with the hint ({label}, {page.evaluate(ROOT_THEME)})", ok)
        page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
        page.get_by_role("button", name=THEME_TOGGLE).first.click()
        settle(page, 300)
    if VARIANT == "personal":
        page.get_by_role("button", name="Dismiss").click()
        settle(page, 300)
        checks.add("dismissing hides the notice", page.get_by_text(NOTICE_TITLE).count() == 0)
        page.reload(wait_until="networkidle")
        settle(page, 1200)
        checks.add("dismissal survives a reload", page.get_by_text(NOTICE_TITLE).count() == 0)
        checks.add("tree is still visible after dismissing", page.locator("[role=treeitem][aria-level='1']").count() == 1)
    checks.add("no uncaught page errors", not notes["page_errors"], notes["page_errors"][:2])


def run(context, checks, notes):
    page = context.new_page()
    watch(page, notes)
    page.on("dialog", lambda dialog: dialog.accept())
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
    check_no_hint(page, checks)
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
    check_presentation_mode(page, checks)
    check_snapshots_viewpoints_present(page, checks)

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

    try:
        glb_path = OUTPUT_DIR / "export.glb"
        size, magic = download_glb(page, glb_path)
        checks.add("geometry export downloads a GLB", size > 1000 and magic == GLB_MAGIC, f"{size} bytes")
        info = glb_check(checks, glb_path, "mock GLB")
        if info:
            notes["mock_glb"] = info
    except Exception as exc:
        checks.add("geometry export downloads a GLB", False, f"{type(exc).__name__}: {str(exc)[:160]}")

    try:
        ifc_path = OUTPUT_DIR / "export.ifc"
        size, head = download_ifc(page, ifc_path)
        text = ifc_path.read_text(errors="replace")
        checks.add(
            "IFC export downloads a STEP file with walls and storeys",
            head.startswith(b"ISO-10303-21;") and "IFCWALL(" in text and "IFCBUILDINGSTOREY(" in text,
            f"{size} bytes",
        )
        if importlib.util.find_spec("ifcopenshell"):
            info = ifc_check(checks, ifc_path, "mock IFC")
            if info:
                notes["mock_ifc"] = info
    except Exception as exc:
        checks.add("IFC export downloads a STEP file with walls and storeys", False, f"{type(exc).__name__}: {str(exc)[:160]}")

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
        if VARIANT in ("empty", "personal"):
            run_variant(context, checks, notes)
        else:
            run(context, checks, notes)
        context.close()
    return checks.finish(notes, "mock-report.json")


if __name__ == "__main__":
    sys.exit(main())
