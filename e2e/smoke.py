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

FULLSCREEN_BUTTON = "#toolbar-fullscreenTool"
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
    const viewer = document.querySelector('.bsh-viewer-surface > .adsk-viewing-viewer');
    const canvas = document.querySelector('.bsh-viewer-surface .canvas-wrap canvas');
    const toolbar = viewer && viewer.querySelector('.adsk-toolbar');
    return {
        fullscreen: Boolean(full),
        viewerIsFullscreen: Boolean(full && full === viewer),
        frame: rect(full),
        host: rect(document.querySelector('.bsh-viewer-surface')),
        canvas: rect(canvas),
        toolbar: rect(toolbar),
        window: { width: window.innerWidth, height: window.innerHeight },
    };
}"""

BUTTON_COLOR_SCRIPT = """mw:() => {
    const button = document.querySelector('.adsk-toolbar .adsk-button:hover');
    return button && getComputedStyle(button).color;
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


def run_model_checks(page, checks, found, notes):
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
    check_canvas_follows_summary(page, checks)
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
    const host = document.querySelector('.model-viewer');
    const canvases = [...document.querySelectorAll('.adsk-viewing-viewer canvas')];
    const canvas = canvases.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    const viewer = window.NOP_VIEWER;
    const model = viewer && viewer.model;
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { width: r.width, height: r.height }; };
    return {
        host: box(host),
        canvas: box(canvas),
        kept: document.querySelector('.adsk-viewing-viewer')?.dataset.e2eTag === 'kept',
        loaded: Boolean(model && (typeof model.isLoadDone !== 'function' || model.isLoadDone())),
        ready: document.querySelector('.bsh-viewer-pane')?.dataset.state === 'ready',
        floating: Boolean(document.querySelector('.dv-resize-container .model-viewer')),
    };
}"""
TAG_VIEWER_SCRIPT = "() => { const el = document.querySelector('.adsk-viewing-viewer'); if (el) el.dataset.e2eTag = 'kept'; return Boolean(el); }"
LAYOUT_MOVES = ("Move right", "Float", "Dock", "Move below", "Move left")


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


def viewer_menu(page, item):
    page.get_by_role("button", name="Viewer pane options").click(timeout=8000)
    page.get_by_role("menuitem", name=item).click(timeout=8000)


def check_layout(page, checks):
    page.bring_to_front()
    checks.add("viewer element can be tagged", page.evaluate(TAG_VIEWER_SCRIPT))
    start = wait_for_viewer_state(page, canvas_follows)
    checks.add("layout: canvas fills the viewer before moving", canvas_follows(start), start)
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
        page.wait_for_timeout(VIEWER_SETTLE_MS)
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


def main():
    layout_only = "--layout" in sys.argv[1:]
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
        if found and layout_only:
            if open_model_for_layout(page, checks, found):
                check_layout(page, checks)
        elif found:
            run_model_checks(page, checks, found, notes)
        checks.add("no uncaught page errors", not notes["page_errors"], notes["page_errors"][:2])
        checks.add("no failed app requests", not notes["failed_requests"], notes["failed_requests"][:3])
    return checks.finish(notes, "layout-report.json" if layout_only else "report.json")


if __name__ == "__main__":
    sys.exit(main())
