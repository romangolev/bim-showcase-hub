import re
import sys

from camoufox.sync_api import Camoufox
import viewer_selectors
from common import (
    BASE_URL,
    DESKTOP,
    HOST_OS,
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
    check_viewer_chrome(page, checks)
    check_context_menu(page, checks)
    check_canvas_follows_summary(page, checks)


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
    toggle = page.locator(".model-summary button.bsh-summary__toggle").first
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


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    checks = Checks()
    notes = new_notes()
    with Camoufox(
        headless=False,
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
