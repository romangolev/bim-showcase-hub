import os
import re
import sys

from camoufox.sync_api import Camoufox
import viewer_selectors
from common import (
    BASE_URL,
    DESKTOP,
    HOST_OS,
    EXIT_NOT_SIGNED_IN,
    HEADLESS,
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
    show_controls,
    wait_for_canvas_width,
    watch,
    wrapped_count_cells,
)

CALL_BUDGET = 40
MODEL_EXTENSIONS = (".rvt", ".nwd", ".nwc", ".ifc", ".dwg")
VIEWER_TIMEOUT_MS = 60000
VIEWER_SETTLE_MS = 15000
AUTODESK_CYAN = "rgb(0, 191, 255)"

GRAPHITE_RGB_SCRIPT = """mw:() => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--color-graphite)';
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
}"""

CHROME_STATE_SCRIPT = """mw:() => {
    const group = document.querySelector('.adsk-control-group');
    const tooltip = document.querySelector('.adsk-control-tooltip');
    const panel = document.querySelector('.docking-panel');
    const groupStyle = group && getComputedStyle(group);
    return {
        groupBackground: groupStyle && groupStyle.backgroundColor,
        groupShadow: groupStyle && groupStyle.boxShadow,
        tooltipTransform: tooltip && getComputedStyle(tooltip).textTransform,
        panelFont: panel && getComputedStyle(panel).fontFamily,
    };
}"""

FULLSCREEN_BUTTON = "[data-active='true'] #toolbar-fullscreenTool"
FULLSCREEN_TOLERANCE_PX = 2
FULLSCREEN_TIMEOUT_MS = 8000
FULLSCREEN_ATTEMPTS = 3

FRAME_STATE_SCRIPT = """mw:() => {
    const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    const full = document.fullscreenElement || document.webkitFullscreenElement || null;
    const active = document.querySelector("[data-active='true']") || document;
    const viewer = active.querySelector('.bsh-viewer-surface > .adsk-viewing-viewer');
    const canvas = active.querySelector('.bsh-viewer-surface .canvas-wrap canvas');
    const toolbar = viewer && viewer.querySelector('.adsk-toolbar');
    return {
        fullscreen: Boolean(full),
        viewerIsFullscreen: Boolean(full && full === viewer),
        frame: rect(full),
        host: rect(active.querySelector('.bsh-viewer-surface')),
        canvas: rect(canvas),
        toolbar: rect(toolbar),
        window: { width: window.innerWidth, height: window.innerHeight },
    };
}"""

BUTTON_COLOR_SCRIPT = """mw:() => {
    const button = document.querySelector('.adsk-toolbar .adsk-button:hover');
    return button && getComputedStyle(button).color;
}"""

CONTEXT_MENU_SCRIPT = """mw:() => {
    const menus = [...document.querySelectorAll('.adsk-viewing-viewer .menu.docking-panel')];
    if (!menus.length) return null;
    const channels = (value) => (value.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = (value) => {
        const [r, g, b] = channels(value).map((v) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a, b) => {
        const la = luminance(a);
        const lb = luminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    const visible = (rect) => rect.width > 0 && rect.height > 0;
    const items = [];
    let inViewport = true;
    const sizes = [];
    menus.forEach((menu) => {
        const menuRect = menu.getBoundingClientRect();
        const background = getComputedStyle(menu).backgroundColor;
        sizes.push([Math.round(menuRect.width), Math.round(menuRect.height)]);
        inViewport = inViewport && menuRect.left >= 0 && menuRect.top >= 0
            && menuRect.right <= window.innerWidth && menuRect.bottom <= window.innerHeight;
        menu.querySelectorAll('.menu-item').forEach((item) => {
            const text = item.querySelector('.menu-item-text');
            const icon = item.querySelector('.menu-item-icon');
            item.scrollIntoView({ block: 'nearest' });
            const itemRect = item.getBoundingClientRect();
            const textRect = text.getBoundingClientRect();
            const iconRect = icon.getBoundingClientRect();
            const color = getComputedStyle(text).color;
            const probe = document.elementFromPoint(
                textRect.left + textRect.width / 2,
                textRect.top + textRect.height / 2,
            );
            const iconStyle = getComputedStyle(icon);
            items.push({
                label: text.textContent.trim(),
                visible: visible(itemRect) && visible(textRect),
                contrast: contrast(color, background),
                iconOversized: visible(iconRect)
                    && (iconRect.width > itemRect.width + 0.5 || iconRect.height > itemRect.height + 0.5),
                iconCovers: !!probe && icon.contains(probe) && visible(iconRect),
                iconPaintsBox: visible(iconRect)
                    && iconStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'
                    && iconStyle.maskImage === 'none',
                topmost: !!probe && item.contains(probe) && !icon.contains(probe),
            });
        });
    });
    return { items, inViewport, size: sizes, menus: menus.length };
}"""


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


def wait_children(page, row, depth, timeout=20000):
    row.locator(f"xpath=self::*[@aria-expanded='true']").wait_for(timeout=timeout)
    child = row.locator(
        f"xpath=following-sibling::*[1][@aria-level='{depth + 1}' or (contains(@class,'tree-status') and @data-variant!='loading')]"
    )
    child.wait_for(timeout=timeout)


def open_in_tree(page, found):
    for depth, name in enumerate(found["crumbs"] + [found["file"]], start=1):
        row = page.locator(f"[role=treeitem][aria-level='{depth}']", has_text=name).first
        row.wait_for(timeout=15000)
        if row.get_attribute("aria-expanded") != "true":
            row.click()
            page.keyboard.press("ArrowRight")
        wait_children(page, row, depth, 15000)
    version_row = page.locator("[role=treeitem][data-viewable=true]").first
    version_row.wait_for(timeout=15000)
    version_row.click()
    page.wait_for_url(re.compile(r"/model/"), timeout=15000)


def run_model_checks(page, checks, found, notes):
    try:
        open_in_tree(page, found)
        checks.add("tree click opens the model route", "/model/" in page.url)
    except Exception as exc:
        checks.add("tree click opens the model route", False, f"{type(exc).__name__}: {str(exc)[:160]}")
        page.goto(f"{BASE_URL}/model/{found['urn']}", wait_until="domcontentloaded")
    page.wait_for_timeout(2000)
    checks.add("document title names the file", found["file"] in page.title(), page.title())
    tab_text = active_tab_label(page)
    checks.add("viewer tab is named after the file", found["file"] in tab_text, tab_text)
    checks.add("viewer pane has no breadcrumb header", page.locator("nav[aria-label^='Breadcrumb'], .model-head").count() == 0)
    try:
        page.wait_for_selector(".adsk-viewing-viewer", timeout=VIEWER_TIMEOUT_MS)
        page.wait_for_timeout(VIEWER_SETTLE_MS)
        checks.add("autodesk viewer is mounted", True)
    except Exception:
        checks.add("autodesk viewer is mounted", False, f"no viewer element within {VIEWER_TIMEOUT_MS // 1000}s")
    checks.add("viewer toolbar is present", page.locator(".adsk-toolbar").count() >= 1)
    checks.add("tool group is in the native toolbar", page.locator(".adsk-toolbar [id^='paint-']:not([id$='-tooltip']), .adsk-toolbar [id^='export-xlsx-']:not([id$='-tooltip'])").count() >= 2)
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
    check_viewer_chrome(page, checks)
    check_context_menu(page, checks)
    check_canvas_follows_summary(page, checks)
    check_summary_columns(page, checks)
    check_fullscreen(page, checks, notes)


def check_viewer_chrome(page, checks):
    try:
        graphite = page.evaluate(GRAPHITE_RGB_SCRIPT)
        button = page.locator(".adsk-toolbar .adsk-button:not(.disabled):visible").first
        hover_color = None
        for _ in range(5):
            button.hover(timeout=8000)
            page.wait_for_timeout(400)
            hover_color = page.evaluate(BUTTON_COLOR_SCRIPT)
            if hover_color:
                break
        state = page.evaluate(CHROME_STATE_SCRIPT)
        browser_button = page.locator("#toolbar-modelStructureTool")
        opened_panel = False
        if not state["panelFont"] and browser_button.count():
            browser_button.click(timeout=8000)
            opened_panel = True
            page.wait_for_selector(".docking-panel", timeout=8000)
            state = page.evaluate(CHROME_STATE_SCRIPT)
        checks.add(
            "viewer chrome is themed: control group uses the graphite token",
            state["groupBackground"] == graphite,
            f"{state['groupBackground']} vs {graphite}",
        )
        checks.add(
            "viewer chrome is themed: control group has no shadow",
            state["groupShadow"] in (None, "none"),
            state["groupShadow"],
        )
        checks.add(
            "viewer chrome is themed: button hover is not the Autodesk cyan",
            bool(hover_color) and hover_color != AUTODESK_CYAN,
            hover_color,
        )
        checks.add(
            "viewer chrome is themed: tooltip text is not capitalized",
            state["tooltipTransform"] == "none",
            state["tooltipTransform"],
        )
        checks.add(
            "viewer chrome is themed: docking panel font is Inter",
            bool(state["panelFont"]) and "Inter" in state["panelFont"],
            state["panelFont"],
        )
        page.screenshot(path=str(OUTPUT_DIR / "05-viewer-chrome.png"))
        if opened_panel:
            browser_button.click(timeout=8000)
    except Exception as exc:
        checks.add("viewer chrome is themed", False, f"{type(exc).__name__}: {str(exc)[:160]}")
    try:
        problems = viewer_selectors.check(
            viewer_selectors.fetch_stylesheet(viewer_selectors.stylesheet_url())
        )
        checks.add("viewer chrome selectors still exist upstream", not problems, "; ".join(problems[:3]))
    except Exception as exc:
        checks.add("viewer chrome selectors still exist upstream", False, f"{type(exc).__name__}: {str(exc)[:160]}")


def check_context_menu(page, checks):
    try:
        canvas = page.locator(".adsk-viewing-viewer canvas").first
        box = canvas.bounding_box()
        page.mouse.click(
            box["x"] + box["width"] / 2,
            box["y"] + box["height"] / 2,
            button="right",
        )
        page.wait_for_selector(".adsk-viewing-viewer .menu.docking-panel", timeout=8000)
        page.wait_for_timeout(300)
        state = page.evaluate(CONTEXT_MENU_SCRIPT)
        page.screenshot(path=str(OUTPUT_DIR / "10-context-menu.png"))
        parent = page.locator(
            ".adsk-viewing-viewer .menu.docking-panel .menu-item:has(.menu-item-expand[style*='opacity: 1'])"
        ).first
        if parent.count():
            parent.hover(timeout=5000)
            page.wait_for_timeout(500)
            nested = page.evaluate(CONTEXT_MENU_SCRIPT)
            page.screenshot(path=str(OUTPUT_DIR / "11-context-submenu.png"))
            if nested and nested["menus"] > state["menus"]:
                state = nested
        items = state["items"]
        checks.add("context menu has items", len(items) > 0, state["size"])
        checks.add(
            "context menu items are visible with text",
            bool(items) and all(i["visible"] and i["label"] for i in items),
            [i["label"] for i in items],
        )
        checks.add(
            "context menu text has 4.5:1 contrast",
            bool(items) and all(i["contrast"] >= 4.5 for i in items),
            [round(i["contrast"], 2) for i in items],
        )
        checks.add(
            "context menu icon slot is not larger than its item",
            not any(i["iconOversized"] for i in items),
        )
        checks.add(
            "context menu icon does not cover the label",
            not any(i["iconCovers"] or i["iconPaintsBox"] or not i["topmost"] for i in items),
        )
        checks.add("context menu stays inside the viewport", state["inViewport"], state["size"])
    except Exception as exc:
        checks.add("context menu is readable", False, f"{type(exc).__name__}: {str(exc)[:160]}")
    try:
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        if page.locator(".adsk-viewing-viewer .menu.docking-panel").count():
            canvas = page.locator(".adsk-viewing-viewer canvas").first
            box = canvas.bounding_box()
            page.mouse.click(box["x"] + 20, box["y"] + 20)
            page.wait_for_timeout(300)
        checks.add(
            "context menu closes",
            page.locator(".adsk-viewing-viewer .menu.docking-panel").count() == 0,
        )
    except Exception as exc:
        checks.add("context menu closes", False, f"{type(exc).__name__}: {str(exc)[:160]}")


def check_canvas_follows_summary(page, checks):
    toggle = page.get_by_role("button", name=re.compile(r"^(Collapse|Expand) Model summary$")).first
    page.bring_to_front()
    start_expanded = None
    first = None
    try:
        start_expanded = toggle.get_attribute("aria-expanded") == "true"
        before = main_canvas_width(page)
        try:
            toggle.click(timeout=8000)
            if start_expanded:
                first = wait_for_canvas_width(page, lambda w: w > before + 20)
                ok = first > before + 20
            else:
                first = wait_for_canvas_width(page, lambda w: w < before - 20)
                ok = first < before - 20
            checks.add("canvas follows the first summary toggle", ok, f"{before:.0f} -> {first:.0f}")
            page.screenshot(path=str(OUTPUT_DIR / "04-summary-toggled.png"))
        except Exception as exc:
            checks.add("canvas follows the first summary toggle", False, f"{type(exc).__name__}: {str(exc)[:160]}")
        try:
            if first is None:
                raise RuntimeError("first toggle did not produce a width")
            toggle.click(timeout=8000)
            if start_expanded:
                back = wait_for_canvas_width(page, lambda w: w < first - 20)
                ok = back < first - 20
            else:
                back = wait_for_canvas_width(page, lambda w: w > first + 20)
                ok = back > first + 20
            checks.add("canvas follows the second summary toggle", ok, f"{first:.0f} -> {back:.0f}")
        except Exception as exc:
            checks.add("canvas follows the second summary toggle", False, f"{type(exc).__name__}: {str(exc)[:160]}")
    except Exception as exc:
        for name in ("canvas follows the first summary toggle", "canvas follows the second summary toggle"):
            if not any(r["name"] == name for r in checks.results):
                checks.add(name, False, f"{type(exc).__name__}: {str(exc)[:160]}")
    finally:
        if start_expanded is not None:
            try:
                if (toggle.get_attribute("aria-expanded") == "true") != start_expanded:
                    toggle.click(timeout=8000)
            except Exception:
                pass


VIEWER_STATE_SCRIPT = """mw:() => {
    const active = document.querySelector("[data-active='true']") || document;
    const host = active.querySelector('.model-viewer');
    const canvases = [...active.querySelectorAll('.adsk-viewing-viewer canvas')];
    const canvas = canvases.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    const viewer = window.NOP_VIEWER;
    const model = viewer && viewer.model;
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { width: r.width, height: r.height }; };
    return {
        host: box(host),
        canvas: box(canvas),
        kept: active.querySelector('.adsk-viewing-viewer')?.dataset.e2eTag === 'kept',
        loaded: Boolean(model && (typeof model.isLoadDone !== 'function' || model.isLoadDone())),
        ready: active.querySelector('.bsh-viewer-pane')?.dataset.state === 'ready',
        floating: Boolean(document.querySelector(".dv-resize-container [data-active='true'] .model-viewer")),
    };
}"""
TAG_VIEWER_SCRIPT = "() => { const el = document.querySelector(\"[data-active='true'] .adsk-viewing-viewer\"); if (el) el.dataset.e2eTag = 'kept'; return Boolean(el); }"
LAYOUT_MOVES = ("Move right", "Float", "Dock", "Move below", "Move left")
ACTIVE_TAB_SCRIPT = """() => {
    const body = document.querySelector("[data-active='true']");
    const group = body && body.closest('.dv-groupview');
    const tab = group && group.querySelector('.dv-tab.dv-active-tab');
    if (tab) return tab.textContent.trim();
    const stacked = document.querySelector(".stack__model-tab[data-active='true']");
    return stacked ? stacked.textContent.trim() : '';
}"""


def summary_item_titles(page):
    show_controls(page.locator(".pane-summary").first, "Summary controls")
    page.locator(".pane-summary").first.get_by_role("button", name="Summary settings").click()
    dialog = page.get_by_role("dialog", name="Summary settings")
    labels = dialog.locator("button[aria-label^='Remove ']").evaluate_all("els => els.map(e => e.getAttribute('aria-label'))")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    return {label[len("Remove "):] for label in labels if not label.endswith(" from the grouping")}


def drop_summary_items(page, names):
    pane = page.locator(".pane-summary").first
    show_controls(pane, "Summary controls")
    pane.get_by_role("button", name="Summary settings").click()
    dialog = page.get_by_role("dialog", name="Summary settings")
    for name in names:
        button = dialog.get_by_role("button", name=f"Remove {name}", exact=True)
        if button.count():
            button.click()
            page.wait_for_timeout(300)
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)


def add_summary_property(page, name, role, aggregate=None):
    pane = page.locator(".pane-summary").first
    show_controls(pane, "Summary controls")
    pane.get_by_role("button", name="Add property", exact=True).click()
    prompt = page.locator("dialog[open]").last
    prompt.get_by_role("radio", name=role, exact=True).check()
    prompt.get_by_label("Search properties").fill(name)
    prompt.get_by_role("radio", name=name, exact=True).first.check(timeout=VIEWER_TIMEOUT_MS)
    if aggregate:
        prompt.get_by_label("Aggregate").select_option(aggregate)
    prompt.get_by_role("button", name="Add property", exact=True).click()
    page.wait_for_timeout(1500)


def check_summary_columns(page, checks):
    pane = page.locator(".pane-summary").first
    before = summary_item_titles(page)
    try:
        if "Level" not in before:
            add_summary_property(page, "Level", "Rows")
        if "Sum of Area" not in before:
            add_summary_property(page, "Area", "Column", "sum")
        page.wait_for_timeout(3000)
        checks.add("real: Sum of Area joins the summary header", pane.get_by_role("columnheader", name="Sum of Area").count() == 1)
        with page.expect_download(timeout=30000) as info:
            pane.get_by_role("button", name="Summary actions").click()
            page.get_by_role("menuitem", name="Download CSV").click()
        target = OUTPUT_DIR / "summary-columns.csv"
        info.value.save_as(target)
        header = target.read_text(encoding="utf-8-sig").splitlines()[0]
        checks.add("real: the summary CSV carries the Sum of Area column", "Sum of Area" in header, header)
        cells = pane.locator("tbody tr td:last-child").all_inner_texts()
        checks.add("real: Sum of Area has a number for some row", any(re.match(r"^-?[\d,.]+", text.strip()) for text in cells), cells[:5])
        page.screenshot(path=str(OUTPUT_DIR / "05-summary-columns.png"))
    except Exception as exc:
        checks.add("real: Sum of Area joins the summary header", False, f"{type(exc).__name__}: {str(exc)[:160]}")
        page.keyboard.press("Escape")
    finally:
        drop_summary_items(page, [name for name in ("Sum of Area", "Level") if name not in before])


def canvas_follows(state, tolerance=4):
    host, canvas = state.get("host"), state.get("canvas")
    if not host or not canvas or host["width"] == 0:
        return False
    return abs(host["width"] - canvas["width"]) <= tolerance and abs(host["height"] - canvas["height"]) <= tolerance


def wait_for_viewer_state(page, predicate, timeout_ms=8000):
    state = page.evaluate(VIEWER_STATE_SCRIPT)
    for _ in range(timeout_ms // 200):
        if predicate(state):
            break
        page.wait_for_timeout(200)
        state = page.evaluate(VIEWER_STATE_SCRIPT)
    return state


def active_tab_label(page):
    return page.evaluate(ACTIVE_TAB_SCRIPT) or ""


def viewer_menu(page, item):
    page.get_by_role("button", name=f"{active_tab_label(page)} pane options").click(timeout=8000)
    page.get_by_role("menuitem", name=item).click(timeout=8000)


def check_layout(page, checks):
    page.bring_to_front()
    checks.add("viewer element can be tagged", page.evaluate(TAG_VIEWER_SCRIPT))
    start = wait_for_viewer_state(page, lambda s: canvas_follows(s) and s["loaded"], timeout_ms=VIEWER_TIMEOUT_MS)
    checks.add("layout: canvas fills the viewer before moving", canvas_follows(start), start)
    checks.add("layout: the model finished loading before moving", start["loaded"], start)
    for move in LAYOUT_MOVES:
        try:
            viewer_menu(page, move)
            state = wait_for_viewer_state(page, canvas_follows)
            checks.add(f"layout: {move} keeps the canvas on its container", canvas_follows(state), state)
            checks.add(f"layout: {move} keeps the same viewer", state["kept"], state)
            checks.add(f"layout: {move} keeps the model loaded", state["loaded"] and state["ready"], state)
            page.screenshot(path=str(OUTPUT_DIR / f"06-layout-{move.lower().replace(' ', '-')}.png"))
        except Exception as exc:
            checks.add(f"layout: {move}", False, f"{type(exc).__name__}: {str(exc)[:160]}")
    try:
        page.get_by_role("button", name="Panes").click(timeout=8000)
        page.get_by_role("menuitem", name="Reset layout").click(timeout=8000)
        state = wait_for_viewer_state(page, canvas_follows)
        checks.add("layout: reset keeps the canvas on its container", canvas_follows(state), state)
        checks.add("layout: reset keeps the same viewer and model", state["kept"] and state["loaded"], state)
        checks.add("layout: reset docks the viewer", not state["floating"], state)
        page.screenshot(path=str(OUTPUT_DIR / "07-layout-reset.png"))
    except Exception as exc:
        checks.add("layout: reset", False, f"{type(exc).__name__}: {str(exc)[:160]}")


def open_model_for_layout(page, checks, found):
    try:
        open_in_tree(page, found)
    except Exception:
        page.goto(f"{BASE_URL}/model/{found['urn']}", wait_until="domcontentloaded")
    try:
        page.wait_for_selector(".adsk-viewing-viewer", timeout=VIEWER_TIMEOUT_MS)
        page.locator(".pane-model[data-active='true'] .bsh-viewer-pane[data-state='ready']").first.wait_for(timeout=VIEWER_TIMEOUT_MS)
        checks.add("autodesk viewer is mounted", True)
        return True
    except Exception:
        checks.add("autodesk viewer is mounted", False, f"no viewer element within {VIEWER_TIMEOUT_MS // 1000}s")
        return False


def fits(inner, outer):
    if not inner or not outer:
        return False
    return all(
        abs(inner[key] - outer[key]) <= FULLSCREEN_TOLERANCE_PX
        for key in ("left", "top", "width", "height")
    )


def size_text(state, key):
    box = state.get(key) if state else None
    return f"{box['width']:.0f}x{box['height']:.0f}" if box else "none"


def wait_frame_state(page, predicate):
    state = page.evaluate(FRAME_STATE_SCRIPT)
    for _ in range(FULLSCREEN_TIMEOUT_MS // 100):
        if predicate(state):
            break
        page.wait_for_timeout(100)
        state = page.evaluate(FRAME_STATE_SCRIPT)
    return state


def entered(state):
    return state["viewerIsFullscreen"] and fits(state["canvas"], state["frame"])


def left(state):
    return not state["fullscreen"] and fits(state["canvas"], state["host"])


def enter_fullscreen(page, checks, label, shot):
    attempts = 0
    state = page.evaluate(FRAME_STATE_SCRIPT)
    while not state["fullscreen"] and attempts < FULLSCREEN_ATTEMPTS:
        attempts += 1
        page.locator(FULLSCREEN_BUTTON).click(timeout=8000)
        wait_frame_state(page, entered)
        page.wait_for_timeout(800)
        state = page.evaluate(FRAME_STATE_SCRIPT)
    checks.add(
        f"{label}: the viewer element is the fullscreen element",
        state["viewerIsFullscreen"],
        f"after {attempts} clicks: {state}",
    )
    checks.add(
        f"{label}: canvas fills the fullscreen element",
        fits(state["canvas"], state["frame"]),
        f"canvas {size_text(state, 'canvas')} vs frame {size_text(state, 'frame')}",
    )
    checks.add(
        f"{label}: fullscreen element fills the window",
        bool(state["frame"])
        and abs(state["frame"]["width"] - state["window"]["width"]) <= FULLSCREEN_TOLERANCE_PX
        and abs(state["frame"]["height"] - state["window"]["height"]) <= FULLSCREEN_TOLERANCE_PX,
        f"frame {size_text(state, 'frame')} vs window {state['window']}",
    )
    toolbar, frame = state["toolbar"], state["frame"]
    checks.add(
        f"{label}: toolbar sits inside the fullscreen element",
        bool(toolbar and frame)
        and toolbar["top"] + toolbar["height"] <= frame["top"] + frame["height"] + FULLSCREEN_TOLERANCE_PX
        and toolbar["left"] >= frame["left"] - FULLSCREEN_TOLERANCE_PX
        and toolbar["left"] + toolbar["width"] <= frame["left"] + frame["width"] + FULLSCREEN_TOLERANCE_PX,
        f"toolbar {toolbar} frame {frame}",
    )
    page.screenshot(path=str(OUTPUT_DIR / shot))
    return state


def exit_checks(page, checks, label, before, shot):
    state = wait_frame_state(page, left)
    page.wait_for_timeout(800)
    state = page.evaluate(FRAME_STATE_SCRIPT)
    checks.add(f"{label}: fullscreen has ended", not state["fullscreen"], state)
    checks.add(
        f"{label}: canvas returns to the host size",
        fits(state["canvas"], state["host"]),
        f"canvas {size_text(state, 'canvas')} vs host {size_text(state, 'host')}",
    )
    checks.add(
        f"{label}: host is the same size as before fullscreen",
        fits(state["host"], before["host"]),
        f"host {size_text(state, 'host')} vs before {size_text(before, 'host')}",
    )
    page.screenshot(path=str(OUTPUT_DIR / shot))
    if state["fullscreen"]:
        page.evaluate("mw:() => document.exitFullscreen && document.exitFullscreen()")
        wait_frame_state(page, lambda s: not s["fullscreen"])


def check_fullscreen(page, checks, notes):
    page.bring_to_front()
    errors_before = len(notes["page_errors"])
    try:
        if page.locator(FULLSCREEN_BUTTON).count() == 0:
            checks.add("fullscreen button is in the native toolbar", False, FULLSCREEN_BUTTON)
            return
        checks.add("fullscreen button is in the native toolbar", True)
        before = page.evaluate(FRAME_STATE_SCRIPT)
        checks.add(
            "before fullscreen: canvas fills the host",
            fits(before["canvas"], before["host"]),
            f"canvas {size_text(before, 'canvas')} vs host {size_text(before, 'host')}",
        )
        state = enter_fullscreen(page, checks, "fullscreen via button", "06-fullscreen.png")
        if state["fullscreen"]:
            page.keyboard.press("Escape")
            exit_checks(page, checks, "exit via Escape", before, "07-fullscreen-escape.png")
        else:
            checks.add("exit via Escape", False, "skipped: fullscreen was not entered")
        state = enter_fullscreen(page, checks, "fullscreen again", "08-fullscreen-again.png")
        if state["fullscreen"]:
            page.locator(FULLSCREEN_BUTTON).click(timeout=8000)
            exit_checks(page, checks, "exit via the button", before, "09-fullscreen-button-exit.png")
        else:
            checks.add("exit via the button", False, "skipped: fullscreen was not entered")
    except Exception as exc:
        checks.add("fullscreen round trip", False, f"{type(exc).__name__}: {str(exc)[:160]}")
        try:
            page.evaluate("mw:() => document.fullscreenElement && document.exitFullscreen()")
        except Exception:
            pass
    new_errors = notes["page_errors"][errors_before:]
    checks.add("no page errors during fullscreen", not new_errors, new_errors[:2])


MULTI_COUNT = 3
MULTI_CALL_BUDGET = 90
MULTI_EXTENSIONS = (".rvt",)
MULTI_FILL_EXTENSIONS = (".nwd", ".nwc", ".dwg")
GEOMETRY_OUTPUTS = ("svf", "svf2")

MULTI_STATE_SCRIPT = """mw:() => [...document.querySelectorAll('.pane-model')].map((body) => {
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
    const canvases = [...body.querySelectorAll('.adsk-viewing-viewer canvas')];
    const canvas = canvases.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    return {
        urn: body.dataset.model,
        label: body.getAttribute('aria-label') || '',
        active: body.dataset.active === 'true',
        live: body.dataset.live === 'true',
        state: body.querySelector('.bsh-viewer-pane')?.dataset.state || '',
        host: box(body.querySelector('.model-viewer')),
        canvas: box(canvas),
        viewers: body.querySelectorAll('.adsk-viewing-viewer').length,
    };
})"""

SUMMARY_SCRIPT = """() => ({
    model: (document.querySelector('.bsh-summary__model')?.textContent || '').replace(/^:\\s*/, ''),
    tooltip: document.querySelector('.dv-tab[aria-label="Model summary"] [title]')?.getAttribute('title') || '',
    rows: [...document.querySelectorAll('.pane-summary tbody tr')].map((row) => row.innerText).join('|'),
})"""


def has_geometry(context, urn):
    status, token = api_get(context, "/api/viewer/token")
    if status != 200 or not isinstance(token, dict) or not token.get("access_token"):
        return True
    response = context.request.get(
        f"https://developer.api.autodesk.com/modelderivative/v2/designdata/{urn}/manifest",
        headers={"Authorization": f"Bearer {token['access_token']}"},
        timeout=30000,
    )
    if response.status in (401, 403):
        return True
    try:
        manifest = response.json()
    except Exception:
        return False
    derivatives = manifest.get("derivatives") if isinstance(manifest, dict) else None
    if not isinstance(derivatives, list):
        return False
    return any(
        isinstance(d, dict) and d.get("outputType") in GEOMETRY_OUTPUTS and d.get("status") == "success"
        for d in derivatives
    )


def find_models(context, count=MULTI_COUNT, extensions=MULTI_EXTENSIONS, skip=()):
    found = []
    seen = set(skip)
    calls = 0
    for hub in list_of(context, "/api/hubs") or []:
        projects = list_of(context, f"/api/hubs/{hub['id']}/projects")
        calls += 1
        for project in (projects or [])[:6]:
            top = list_of(context, f"/api/hubs/{hub['id']}/projects/{project['id']}/folders")
            calls += 1
            queue = [(project["id"], f["id"], [hub["name"], project["name"], f["name"]]) for f in top or []]
            while queue and calls < MULTI_CALL_BUDGET and len(found) < count:
                pid, fid, crumbs = queue.pop(0)
                contents = list_of(context, f"/api/projects/{pid}/folders/{fid}/contents")
                calls += 1
                if contents is None:
                    continue
                queue.extend((pid, n["id"], crumbs + [n["name"]]) for n in contents if n["kind"] == "folder")
                for item in contents:
                    if len(found) >= count or calls >= MULTI_CALL_BUDGET:
                        break
                    if item["kind"] != "item" or not item["name"].lower().endswith(extensions):
                        continue
                    if item["name"] in seen:
                        continue
                    versions = list_of(context, f"/api/projects/{pid}/items/{item['id']}/versions")
                    calls += 1
                    version = next((v for v in versions or [] if v.get("viewable") and v.get("urn")), None)
                    if version and has_geometry(context, version["urn"]):
                        seen.add(item["name"])
                        found.append({"urn": version["urn"], "file": item["name"], "crumbs": crumbs, "version": version.get("name", "")})
            if len(found) >= count:
                return found
    return found


def expand_to_file(page, found):
    previous = None
    for depth, name in enumerate(found["crumbs"] + [found["file"]], start=1):
        if previous is None:
            row = page.locator(f"[role=treeitem][aria-level='{depth}']", has_text=name).first
        else:
            row = previous.locator(f"xpath=following-sibling::*[@role='treeitem'][@aria-level='{depth}']").filter(has_text=name).first
        row.wait_for(timeout=20000)
        if row.get_attribute("aria-expanded") != "true":
            row.click()
            page.keyboard.press("ArrowRight")
        wait_children(page, row, depth)
        previous = row
    return previous


def open_version(page, found):
    previous = expand_to_file(page, found)
    version_row = previous.locator("xpath=following-sibling::*[@data-viewable='true']").first
    version_row.wait_for(timeout=20000)
    version_row.click()


def multi_state(page):
    return page.evaluate(MULTI_STATE_SCRIPT)


def follows(view, tolerance=4):
    host, canvas = view.get("host"), view.get("canvas")
    if not host or not canvas or host["width"] == 0:
        return False
    return abs(host["width"] - canvas["width"]) <= tolerance and abs(host["height"] - canvas["height"]) <= tolerance


def visible_models(page):
    return [v for v in multi_state(page) if v["host"] and v["host"]["width"] > 0]


def wait_models(page, predicate, timeout_ms=VIEWER_TIMEOUT_MS):
    views = visible_models(page)
    for _ in range(timeout_ms // 500):
        if predicate(views):
            return views
        page.wait_for_timeout(500)
        views = visible_models(page)
    return views


def loaded(view):
    return view["state"] == "ready" and view["viewers"] >= 1 and follows(view)


def summary_of(page, label, timeout_ms=VIEWER_TIMEOUT_MS):
    state = page.evaluate(SUMMARY_SCRIPT)
    for _ in range(timeout_ms // 500):
        if state["model"] == label and state["rows"]:
            return state
        page.wait_for_timeout(500)
        state = page.evaluate(SUMMARY_SCRIPT)
    return state


def tab_of(page, label):
    return page.locator(".dv-tab").filter(has_text=label).first


def pointer_drag(page, source, target_x, target_y):
    box = source.bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.mouse.down()
    for step in range(1, 13):
        page.mouse.move(
            box["x"] + (target_x - box["x"]) * step / 12,
            box["y"] + (target_y - box["y"]) * step / 12,
        )
        page.wait_for_timeout(30)
    page.mouse.up()
    page.wait_for_timeout(1500)


def check_multi_model(page, checks, revit, notes):
    page.bring_to_front()
    errors_before = len(notes["page_errors"])
    models = revit[:MULTI_COUNT]
    labels = {}
    summaries = {}
    for model in models:
        name = model["file"]
        try:
            open_version(page, model)
            page.wait_for_url(re.compile(re.escape(model["urn"])), timeout=20000)
            views = wait_models(page, lambda vs: any(v["urn"] == model["urn"] and v["active"] and loaded(v) for v in vs))
            view = next((v for v in views if v["urn"] == model["urn"]), None)
            label = active_tab_label(page)
            labels[model["urn"]] = label
            checks.add(f"multi: {name} opens in its own tab", name in label and tab_of(page, label).count() == 1, label)
            checks.add(f"multi: {name} canvas fills its container", bool(view) and follows(view), view)
            checks.add(f"multi: {name} model is loaded", bool(view) and view["state"] == "ready", view)
            checks.add(f"multi: url mirrors {name}", model["urn"] in page.url, page.url)
            summary = summary_of(page, label)
            summaries[model["urn"]] = summary
            checks.add(f"multi: summary belongs to {name}", summary["model"] == label and bool(summary["rows"]) and name in summary["tooltip"], summary["model"])
            page.screenshot(path=str(OUTPUT_DIR / f"10-multi-{len(labels)}.png"))
        except Exception as exc:
            checks.add(f"multi: open {name}", False, f"{type(exc).__name__}: {str(exc)[:160]}")
    tabs = page.locator(".dv-tab").filter(has_text=" · v").count()
    checks.add("multi: one tab per opened model", tabs == len(labels), tabs)
    rows = [s["rows"] for s in summaries.values()]
    checks.add("multi: summary rows differ between models", len(set(rows)) == len(rows) and len(rows) >= 2, [len(r) for r in rows])

    if len(labels) >= 2:
        try:
            first_urn, second_urn = list(labels)[0], list(labels)[1]
            tab_of(page, labels[first_urn]).click()
            page.wait_for_url(re.compile(re.escape(first_urn)), timeout=10000)
            back = summary_of(page, labels[first_urn])
            checks.add("multi: activating a tab switches the summary back", back["rows"] == summaries[first_urn]["rows"], back["model"])
            checks.add("multi: activating a tab updates the url", first_urn in page.url, page.url)
            content = page.locator(".dv-groupview:has([data-active='true'] .model-viewer) .dv-content-container").bounding_box()
            pointer_drag(page, tab_of(page, labels[second_urn]), content["x"] + content["width"] - 24, content["y"] + content["height"] / 2)
            views = wait_models(page, lambda vs: len(vs) >= 2 and all(loaded(v) for v in vs))
            side = len(views) >= 2 and (
                views[0]["host"]["left"] + views[0]["host"]["width"] <= views[1]["host"]["left"] + 2
                or views[1]["host"]["left"] + views[1]["host"]["width"] <= views[0]["host"]["left"] + 2
            )
            checks.add("multi: dragging a tab splits two models side by side", side, views)
            checks.add("multi: both split canvases follow their containers", len(views) >= 2 and all(follows(v) for v in views), views)
            checks.add("multi: both split models stay loaded", len(views) >= 2 and all(v["state"] == "ready" for v in views), views)
            page.screenshot(path=str(OUTPUT_DIR / "11-multi-split.png"))

            closing = next((v for v in views if v["urn"] == first_urn), None)
            tab = tab_of(page, labels[first_urn])
            tab.hover()
            tab.locator(".dv-default-tab-action").click(timeout=8000)
            tab.wait_for(state="detached", timeout=10000)
            remaining = wait_models(page, lambda vs: vs and all(loaded(v) for v in vs))
            checks.add("multi: closing a tab removes it", tab_of(page, labels[first_urn]).count() == 0 and closing is not None)
            checks.add("multi: the other models stay loaded after a close", bool(remaining) and all(loaded(v) for v in remaining), remaining)
            page.screenshot(path=str(OUTPUT_DIR / "12-multi-closed.png"))
        except Exception as exc:
            checks.add("multi: split and close", False, f"{type(exc).__name__}: {str(exc)[:160]}")

    try:
        reopened = models[0]
        open_version(page, reopened)
        page.wait_for_url(re.compile(re.escape(reopened["urn"])), timeout=20000)
        views = wait_models(page, lambda vs: any(v["urn"] == reopened["urn"] and loaded(v) for v in vs))
        checks.add("multi: a closed model opens again in a new tab", any(v["urn"] == reopened["urn"] and loaded(v) for v in views), views)
        open_tabs = [label for label in labels.values() if tab_of(page, label).count()]
        active_label = active_tab_label(page)
        manifests = []
        page.on("request", lambda request: manifests.append(request.url))
        page.reload(wait_until="domcontentloaded")
        views = wait_models(page, lambda vs: any(v["active"] and loaded(v) for v in vs))
        page.locator(".pane-model[data-active='true'][data-live='true'] .bsh-viewer-pane[data-state='ready']").first.wait_for(timeout=VIEWER_TIMEOUT_MS)
        restored = [label for label in open_tabs if tab_of(page, label).count()]
        checks.add("multi: reload restores the tabs", restored == open_tabs, f"{restored} vs {open_tabs}")
        checks.add("multi: reload loads the active model", any(v["active"] and loaded(v) for v in views) and active_tab_label(page) == active_label, views)
        shown = {v["urn"] for v in visible_models(page)}
        hidden = [urn for urn, label in labels.items() if label in open_tabs and urn not in shown]
        fetched = [urn for urn in hidden if any(urn in url for url in manifests)]
        checks.add("multi: hidden tabs stay unloaded after reload", not fetched, f"hidden {len(hidden)}, fetched {len(fetched)}")
        if hidden:
            urn = hidden[0]
            tab_of(page, labels[urn]).click()
            views = wait_models(page, lambda vs: any(v["urn"] == urn and loaded(v) for v in vs))
            checks.add("multi: a hidden tab loads when activated", any(v["urn"] == urn and loaded(v) for v in views), views)
        page.screenshot(path=str(OUTPUT_DIR / "13-multi-reloaded.png"))
    except Exception as exc:
        checks.add("multi: reload", False, f"{type(exc).__name__}: {str(exc)[:160]}")
    new_errors = notes["page_errors"][errors_before:]
    checks.add("multi: no page errors", not new_errors, new_errors[:2])


STATE_BUDGET = 150
STATE_ITEM_LIMIT = 40
BLOCKED_STATES = ("processing", "failed", "no-geometry", "not-translated")


def parse_expectations():
    expected = {}
    for pair in os.environ.get("E2E_STATE_EXPECT", "").split(","):
        name, _, state = pair.partition("=")
        if name.strip() and state.strip():
            expected[name.strip().lower()] = state.strip()
    return expected


def discover_items(context, budget=STATE_BUDGET, limit=STATE_ITEM_LIMIT):
    calls = 0
    items = []
    hubs = list_of(context, "/api/hubs") or []
    for hub in hubs:
        projects = list_of(context, f"/api/hubs/{hub['id']}/projects") or []
        calls += 1
        projects.sort(key=lambda p: "test" not in p["name"].lower())
        for project in projects:
            top = list_of(context, f"/api/hubs/{hub['id']}/projects/{project['id']}/folders")
            calls += 1
            queue = [(project["id"], f["id"], [hub["name"], project["name"], f["name"]]) for f in top or []]
            while queue and calls < budget and len(items) < limit:
                pid, fid, crumbs = queue.pop(0)
                contents = list_of(context, f"/api/projects/{pid}/folders/{fid}/contents")
                calls += 1
                if contents is None:
                    continue
                queue.extend((pid, n["id"], crumbs + [n["name"]]) for n in contents if n["kind"] == "folder")
                for item in contents:
                    if item["kind"] != "item" or len(items) >= limit or calls >= budget:
                        continue
                    versions = list_of(context, f"/api/projects/{pid}/items/{item['id']}/versions")
                    calls += 1
                    if versions:
                        items.append({"file": item["name"], "crumbs": crumbs, "item": item["id"], "project": pid, "versions": versions})
            if len(items) >= limit or calls >= budget:
                return items
    return items


def version_rows(page, file_row):
    rows = file_row.locator("xpath=following-sibling::*[@role='treeitem']")
    found = {}
    for index in range(rows.count()):
        row = rows.nth(index)
        if row.get_attribute("data-kind") != "version":
            break
        found[row.get_attribute("aria-label")] = row
    return found


def check_view_states(page, context, checks):
    items = discover_items(context)
    states = {}
    for item in items:
        for version in item["versions"]:
            states.setdefault(version.get("viewState"), []).append((item, version))
    checks.add("states: items discovered", True, f"{len(items)} items, states {{{', '.join(f'{k}: {len(v)}' for k, v in states.items())}}}")
    checks.add("states: every version carries a viewState", all(v.get("viewState") for vs in states.values() for _, v in vs) and None not in states, sorted(map(str, states)))

    expected = parse_expectations()
    for suffix, state in expected.items():
        match = next((i for i in items if i["file"].lower().endswith(suffix)), None)
        checks.add(f"states: expected {suffix} is {state}", match is not None and match["versions"][0].get("viewState") == state, None if match is None else match["versions"][0].get("viewState"))

    picked = []
    for state in ("ready", "unknown", *BLOCKED_STATES):
        for item, _ in states.get(state, [])[:1]:
            if item["item"] not in [p["item"] for p in picked]:
                picked.append(item)
    for item in picked:
        label = item["file"]
        try:
            page.goto(BASE_URL, wait_until="networkidle")
            page.locator("[role=treeitem]").first.wait_for(timeout=20000)
            file_row = expand_to_file(page, {"crumbs": item["crumbs"], "file": item["file"]})
            rows = version_rows(page, file_row)
            for version in item["versions"]:
                row = rows.get(version["name"])
                if row is None:
                    continue
                checks.add(f"states: {label} {version['name'][:6]} row matches the api", row.get_attribute("data-view-state") == version.get("viewState"), f"row {row.get_attribute('data-view-state')} api {version.get('viewState')}")
            blocked = next((v for v in item["versions"] if v.get("viewState") in BLOCKED_STATES and v["name"] in rows), None)
            if blocked:
                start = page.url
                rows[blocked["name"]].click(force=True)
                try:
                    page.locator(".doc-tree__notice[role=status]", has_text="cannot be opened").wait_for(timeout=10000)
                except Exception:
                    checks.add(f"states: {label} blocked version notice appears", False, "timed out after 10s")
                notice = page.locator(".doc-tree__notice[role=status]").inner_text()
                checks.add(f"states: {label} blocked version opens no tab", page.url == start, f"{start} -> {page.url}")
                checks.add(f"states: {label} blocked version shows the notice", "cannot be opened" in notice, notice)
            ready = next((v for v in item["versions"] if v.get("viewState") == "ready" and v["name"] in rows), None)
            if ready:
                rows[ready["name"]].click()
                page.wait_for_url(re.compile(r"/model/"), timeout=15000)
                checks.add(f"states: {label} ready version opens", "/model/" in page.url, page.url)
        except Exception as exc:
            checks.add(f"states: {label}", False, f"{type(exc).__name__}: {str(exc)[:160]}")


COMBINED_GOOD = ("snowdon towers sample architectural.rvt", "racbasicsampleproject.rvt")
COMBINED_FILL = ("fili_20170810_01.nwd", "sgok_test.nwd")
COMBINED_BAD = ("rmebasicsampleproject.rvt",)
COMBINED_CALL_BUDGET = 120
NO_GEOMETRY_TEXT = "No viewable geometry"

COMBINED_STATE_SCRIPT = """mw:() => {
    const host = document.querySelector("[data-active='true'] [data-bsh-viewer]");
    const viewer = host?.bshViewer;
    if (!viewer) return null;
    const boxOf = (b) => b ? { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] } : null;
    const models = viewer.getAllModels().map((model) => ({
        id: model.id,
        done: Boolean(model.isLoadDone && model.isLoadDone()),
        box: boxOf(model.getBoundingBox && model.getBoundingBox()),
        unit: model.getUnitString ? model.getUnitString() : null,
    }));
    const visible = viewer.impl && viewer.impl.getVisibleBounds ? boxOf(viewer.impl.getVisibleBounds(true)) : null;
    const canvas = viewer.canvas?.getBoundingClientRect();
    const frame = host.getBoundingClientRect();
    return {
        models,
        visible,
        canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
        host: { width: frame.width, height: frame.height },
    };
}"""

COMBINED_SELECT_SCRIPT = """mw:() => new Promise((resolve) => {
    const viewer = document.querySelector("[data-active='true'] [data-bsh-viewer]")?.bshViewer;
    const models = viewer ? viewer.getAllModels() : [];
    const model = models[models.length - 1];
    if (!model) return resolve(null);
    model.getObjectTree((tree) => {
        let leaf = null;
        tree.enumNodeChildren(tree.getRootId(), (id) => {
            if (leaf === null && tree.getChildCount(id) === 0) leaf = id;
        }, true);
        viewer.select([leaf], model);
        const selection = viewer.getAggregateSelection();
        resolve({ leaf, modelId: model.id, selected: selection.map((s) => ({ modelId: s.model.id, ids: s.selection })) });
    }, () => resolve(null));
})"""


def find_named(context, wanted):
    found = {}
    calls = 0
    for hub in list_of(context, "/api/hubs") or []:
        for project in (list_of(context, f"/api/hubs/{hub['id']}/projects") or [])[:6]:
            calls += 1
            top = list_of(context, f"/api/hubs/{hub['id']}/projects/{project['id']}/folders")
            calls += 1
            queue = [(project["id"], f["id"], [hub["name"], project["name"], f["name"]]) for f in top or []]
            while queue and calls < COMBINED_CALL_BUDGET and len(found) < len(wanted):
                pid, fid, crumbs = queue.pop(0)
                contents = list_of(context, f"/api/projects/{pid}/folders/{fid}/contents")
                calls += 1
                if contents is None:
                    continue
                queue.extend((pid, n["id"], crumbs + [n["name"]]) for n in contents if n["kind"] == "folder")
                for item in contents:
                    name = item["name"].lower()
                    key = next((w for w in wanted if name.endswith(w)), None)
                    if item["kind"] != "item" or key is None or key in found:
                        continue
                    versions = list_of(context, f"/api/projects/{pid}/items/{item['id']}/versions")
                    calls += 1
                    version = next((v for v in versions or [] if v.get("urn")), None)
                    if version:
                        found[key] = {"urn": version["urn"], "file": item["name"], "crumbs": crumbs, "version": version.get("name", ""), "viewState": version.get("viewState")}
            if len(found) >= len(wanted):
                return found
    return found


def combined_state(page):
    return page.evaluate(COMBINED_STATE_SCRIPT)


def wait_combined(page, predicate, timeout_ms=VIEWER_TIMEOUT_MS * 2):
    state = combined_state(page)
    for _ in range(timeout_ms // 1000):
        if state and predicate(state):
            return state
        page.wait_for_timeout(1000)
        state = combined_state(page)
    return state


def center(box):
    return [(box["min"][i] + box["max"][i]) / 2 for i in range(3)]


def diagonal(box):
    return sum((box["max"][i] - box["min"][i]) ** 2 for i in range(3)) ** 0.5


def encloses(outer, inner, tolerance):
    return all(outer["min"][i] <= inner["min"][i] + tolerance and outer["max"][i] >= inner["max"][i] - tolerance for i in range(3))


def combined_url(members):
    from urllib.parse import quote

    first, rest = members[0], members[1:]
    query = f"file={quote(first['file'])}"
    if rest:
        query += "&with=" + ",".join(member["urn"] for member in rest)
    return f"{BASE_URL}/model/{first['urn']}?{query}"


def union_box(boxes):
    return {
        "min": [min(b["min"][i] for b in boxes) for i in range(3)],
        "max": [max(b["max"][i] for b in boxes) for i in range(3)],
    }


def check_far_apart_live(page, checks, notes, count):
    warning = page.locator("[data-active='true'] .bsh-viewer-models__far")
    try:
        warning.wait_for(timeout=VIEWER_TIMEOUT_MS)
    except Exception:
        notes["combined_far_warning"] = ""
        checks.add("combined: the far apart warning appears", False, f"timed out after {VIEWER_TIMEOUT_MS // 1000}s")
        return
    text = warning.inner_text()
    notes["combined_far_warning"] = text[:200]
    checks.add("combined: the far apart warning appears", "far apart in model space" in text, text[:160] or "no warning")
    if not text:
        return
    before = combined_state(page)
    original = {m["id"]: center(m["box"]) for m in before["models"] if m["box"]}
    largest = max(diagonal(m["box"]) for m in before["models"] if m["box"])
    page.get_by_role("button", name="Bring models together (view only)").first.click()
    together = wait_combined(page, lambda s: s["models"] and diagonal(union_box([m["box"] for m in s["models"] if m["box"]])) < largest * 2)
    boxes = [m["box"] for m in (together or {}).get("models", []) if m["box"]]
    spread = diagonal(union_box(boxes)) if boxes else None
    notes["combined_together_diagonal"] = spread and round(spread, 2)
    checks.add("combined: Bring models together shrinks the scene below 2x the largest model", spread is not None and spread < largest * 2, f"{spread} vs {largest}")
    checks.add("combined: every model stays loaded after moving", bool(together) and len(together["models"]) == count and all(m["done"] for m in together["models"]), together and len(together["models"]))
    page.screenshot(path=str(OUTPUT_DIR / "combined-03-together.png"))
    page.get_by_role("button", name="Restore positions").first.click()
    page.get_by_role("button", name="Bring models together (view only)").first.wait_for(timeout=VIEWER_TIMEOUT_MS)
    after = combined_state(page)
    restored = {m["id"]: center(m["box"]) for m in after["models"] if m["box"]}
    worst = max(
        (sum((restored[i][k] - original[i][k]) ** 2 for k in range(3)) ** 0.5 for i in original if i in restored),
        default=None,
    )
    checks.add("combined: Restore positions returns the original centres", worst is not None and worst <= largest * 0.001 + 0.01, worst)


def check_combined(page, context, checks, notes):
    page.bring_to_front()
    errors_before = len(notes["page_errors"])
    named = find_named(context, COMBINED_GOOD + COMBINED_FILL + COMBINED_BAD)
    good = [named[name] for name in COMBINED_GOOD if name in named]
    fill = next((named[name] for name in COMBINED_FILL if name in named and has_geometry(context, named[name]["urn"])), None)
    if fill:
        good.append(fill)
    good = [member for member in good if has_geometry(context, member["urn"])]
    checks.add("combined: two or three models with geometry exist", len(good) >= 2, [m["file"] for m in good])
    notes["combined_members"] = [m["file"] for m in good]
    if len(good) < 2:
        return

    page.goto(combined_url(good), wait_until="networkidle")
    tab = page.locator(".dv-tab").filter(has_text=f"{len(good)} models")
    tab.first.wait_for(timeout=VIEWER_TIMEOUT_MS)
    checks.add("combined: one tab for the set", tab.count() == 1 and page.locator(".pane-model").count() == 1, tab.count())
    state = wait_combined(page, lambda s: len(s["models"]) == len(good) and all(m["done"] for m in s["models"]))
    count = len(state["models"]) if state else 0
    checks.add("combined: getAllModels has every model", count == len(good), f"{count} of {len(good)}")
    checks.add("combined: every model finished loading", bool(state) and all(m["done"] for m in state["models"]), state and [m["done"] for m in state["models"]])

    boxes = [m["box"] for m in (state or {}).get("models", []) if m["box"]]
    if boxes and state.get("visible"):
        tolerance = max(diagonal(b) for b in boxes) * 0.01 + 0.01
        checks.add("combined: the scene bounds enclose every model", all(encloses(state["visible"], b, tolerance) for b in boxes), state["visible"])
        centers = [center(b) for b in boxes]
        distances = [sum((centers[0][i] - c[i]) ** 2 for i in range(3)) ** 0.5 for c in centers[1:]]
        largest = max(diagonal(b) for b in boxes)
        notes["combined_center_distances"] = [round(d, 2) for d in distances]
        notes["combined_units"] = [m["unit"] for m in state["models"]]
        if any(d > largest * 2 for d in distances):
            notes.setdefault("warnings", []).append(f"combined models look unaligned: centre distances {distances} vs largest diagonal {largest:.1f}")
    else:
        checks.add("combined: model bounds are readable", False, state)

    selection = page.evaluate(COMBINED_SELECT_SCRIPT)
    picked = bool(selection) and any(s["modelId"] == selection["modelId"] and selection["leaf"] in s["ids"] for s in selection["selected"])
    checks.add("combined: selecting an object in a later model works", picked, selection)
    page.evaluate("mw:() => document.querySelector(\"[data-active='true'] [data-bsh-viewer]\")?.bshViewer?.clearSelection()")

    show_controls(page, "Summary controls")
    scope = page.get_by_role("combobox", name="Summarize models")
    scope.wait_for(timeout=VIEWER_TIMEOUT_MS)
    options = scope.locator("option").all_inner_texts()
    checks.add("combined: summary offers All models and each model", len(options) == len(good) + 1 and options[0] == "All models", options)
    per_model = {}
    for index in range(1, len(options)):
        scope.select_option(index=index)
        rows = page.locator(".pane-summary tbody tr")
        try:
            rows.first.wait_for(timeout=VIEWER_TIMEOUT_MS)
        except Exception:
            checks.add(f"combined: summary rows appear for {options[index]}", False, f"timed out after {VIEWER_TIMEOUT_MS // 1000}s")
        per_model[f"{index}:{options[index]}"] = rows.count()
    scope.select_option(index=0)
    checks.add("combined: summary rows include data from every model", all(count > 0 for count in per_model.values()), per_model)
    page.screenshot(path=str(OUTPUT_DIR / "combined-01-loaded.png"))
    check_far_apart_live(page, checks, notes, len(good))

    page.locator("[data-active='true'] .bsh-viewer-models__trigger").click()
    remove = page.get_by_role("menuitem", name=re.compile(r"^Remove ")).last
    removed_label = remove.inner_text()
    remove.click()
    after = wait_combined(page, lambda s: len(s["models"]) == len(good) - 1)
    remaining = after["models"] if after else []
    checks.add("combined: removing one model leaves the others rendered", len(remaining) == len(good) - 1 and all(m["done"] for m in remaining), f"{removed_label}: {len(remaining)} left")

    def canvas_on_host(state):
        return bool(state and state["canvas"]) and abs(state["canvas"]["width"] - state["host"]["width"]) <= 4 and abs(state["canvas"]["height"] - state["host"]["height"]) <= 4

    after = wait_combined(page, canvas_on_host, timeout_ms=10000)
    follows_container = canvas_on_host(after)
    checks.add("combined: canvas follows its container", follows_container, after and (after["canvas"], after["host"]))

    bad = named.get(COMBINED_BAD[0])
    if bad:
        members = good[:2] + [bad]
        page.goto(combined_url(members), wait_until="networkidle")
        failed = page.get_by_role("list", name="Models that failed")
        try:
            failed.wait_for(timeout=VIEWER_TIMEOUT_MS)
        except Exception:
            checks.add("combined: the failed member list appears", False, f"timed out after {VIEWER_TIMEOUT_MS // 1000}s")
        text = failed.inner_text() if failed.count() else ""
        notes["combined_bad_member"] = text[:200]
        checks.add("combined: a member without geometry explains why", NO_GEOMETRY_TEXT in text or "Document load failed" in text, text[:160])
        if NO_GEOMETRY_TEXT not in text:
            notes.setdefault("warnings", []).append(f"{bad['file']} failed without the no-geometry text: {text[:120]}")
        state = wait_combined(page, lambda s: len(s["models"]) == 2 and all(m["done"] for m in s["models"]))
        checks.add("combined: the bad member leaves the others rendered", bool(state) and len(state["models"]) == 2 and all(m["done"] for m in state["models"]), state and len(state["models"]))
        page.screenshot(path=str(OUTPUT_DIR / "combined-02-bad-member.png"))
    else:
        notes.setdefault("warnings", []).append("rmebasicsampleproject.rvt not found; bad member check skipped")

    new_errors = notes["page_errors"][errors_before:]
    checks.add("combined: no page errors", not new_errors, new_errors[:2])


def main():
    layout_only = "--layout" in sys.argv[1:]
    multi = "--multi" in sys.argv[1:]
    states = "--states" in sys.argv[1:]
    combined = "--combined" in sys.argv[1:]
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    checks = Checks()
    notes = new_notes()
    with Camoufox(
        headless=HEADLESS,
        persistent_context=True,
        user_data_dir=str(PROFILE_DIR),
        window=DESKTOP,
        os=HOST_OS,
        main_world_eval=True,
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
        found = None if multi or states or combined else find_viewable(context)
        if not multi and not states and not combined:
            checks.add("a viewable model exists", found is not None, "none found within the API call budget")
        revit = find_models(context) if multi else []
        if multi and len(revit) < MULTI_COUNT:
            revit += find_models(context, MULTI_COUNT - len(revit), MULTI_FILL_EXTENSIONS, skip=[m["file"] for m in revit])
        if multi:
            checks.add(f"{MULTI_COUNT} different viewable models exist (Revit first)", len(revit) >= MULTI_COUNT, [m["file"] for m in revit])

        page = context.pages[0] if context.pages else context.new_page()
        page.on("dialog", lambda dialog: dialog.accept())
        watch(page, notes)
        page.goto(BASE_URL, wait_until="networkidle")
        try:
            page.locator("[role=treeitem]").first.wait_for(timeout=20000)
        except Exception:
            pass
        checks.add("tree lists hubs", page.locator("[role=treeitem]").count() >= 1)
        page.screenshot(path=str(OUTPUT_DIR / "01-home.png"))
        if combined:
            check_combined(page, context, checks, notes)
        elif states:
            check_view_states(page, context, checks)
        elif multi and len(revit) >= 2:
            check_multi_model(page, checks, revit, notes)
        elif found and layout_only:
            if open_model_for_layout(page, checks, found):
                check_layout(page, checks)
        elif found:
            run_model_checks(page, checks, found, notes)
        checks.add("no uncaught page errors", not notes["page_errors"], notes["page_errors"][:2])
        checks.add("no failed app requests", not notes["failed_requests"], notes["failed_requests"][:3])
    report = "combined-report.json" if combined else "states-report.json" if states else "multi-report.json" if multi else "layout-report.json" if layout_only else "report.json"
    return checks.finish(notes, report)


if __name__ == "__main__":
    sys.exit(main())
