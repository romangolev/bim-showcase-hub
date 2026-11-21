import json
import os
import re
import sys

from camoufox.sync_api import Camoufox
from common import (
    BASE_URL,
    EXIT_CHECK_FAILED,
    EXIT_PASS,
    ROOT,
    HEADLESS,
    HOST_OS,
    OUTPUT_DIR,
    app_reachable,
    expand_to_viewable,
    horizontal_overflow,
    new_notes,
    watch,
)

SETTINGS_KEY = "bsh-settings-v1"
STACKED_MAX = int(re.search(r"STACKED_MAX_WIDTH = (\d+)", (ROOT.parent / "src/web/layout/breakpoint.ts").read_text()).group(1))
COMPACT = ".inline-action, .panes-menu__action, .dv-default-tab-action, .dock-action, .bsh-models__swatch, .tree-row__action, .bsh-chart__tools .icon-button, .bsh-table-block__toggle"
WIDTHS = {320: 640, 768: 1024, 1440: 900}
THEMES = ("dark", "light")
WINDOWS = [
    ("settings", "Open settings"),
    ("summary-settings", "Summary settings"),
    ("dashboard-settings", "Dashboard settings"),
    ("viewpoints", "Viewpoints"),
    ("paint-settings", "Paint brushes settings"),
    ("excel-settings", "Excel export settings"),
    ("glb-settings", "Geometry export settings"),
    ("ifc-settings", "IFC export settings"),
    ("toolbar-settings", "Toolbar profile settings"),
    ("display-settings", "Viewer display settings"),
]

COLOR = """
const parse = (value) => {
  const srgb = value.match(/color\\(srgb ([^)]+)\\)/);
  if (srgb) {
    const parts = srgb[1].split(/[ \\/]+/).filter(Boolean).map(Number);
    return { r: parts[0] * 255, g: parts[1] * 255, b: parts[2] * 255, a: parts.length > 3 ? parts[3] : 1 };
  }
  const m = value.match(/rgba?\\(([^)]+)\\)/);
  if (!m) return null;
  const parts = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
};
const over = (top, bottom) => ({
  r: top.r * top.a + bottom.r * (1 - top.a),
  g: top.g * top.a + bottom.g * (1 - top.a),
  b: top.b * top.a + bottom.b * (1 - top.a),
  a: 1,
});
const lum = (c) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const backdrop = (el) => {
  const layers = [];
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    const c = parse(getComputedStyle(node).backgroundColor);
    if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
  }
  let base = parse(getComputedStyle(document.documentElement).backgroundColor);
  if (!base || base.a < 1) base = { r: 255, g: 255, b: 255, a: 1 };
  for (const layer of layers.reverse()) base = over(layer, base);
  return base;
};
const visible = (el) => {
  const box = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && el.closest('[inert]') === null;
};
const name = (el) => (el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''));
const disabled = (el) => el.closest(':disabled, [aria-disabled=true], .adsk-viewing-viewer') !== null;
"""

CONTRAST = "(scope) => {" + COLOR + """
  const root = scope ? document.querySelector(scope) : document.body;
  if (!root) return { checked: 0, fails: [] };
  const fails = [];
  let checked = 0;
  for (const el of root.querySelectorAll('*')) {
    if (!visible(el) || disabled(el)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const style = getComputedStyle(el);
    if (style.clipPath !== 'none' || el.clientWidth <= 1) continue;
    let fg = parse(style.color);
    let alpha = fg.a;
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) alpha *= Number(getComputedStyle(node).opacity);
    const bg = backdrop(el);
    fg = over({ ...fg, a: alpha }, bg);
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    const value = ratio(fg, bg);
    checked += 1;
    if (value < (large ? 3 : 4.5)) fails.push({ el: name(el), text: el.textContent.trim().slice(0, 30), ratio: Math.round(value * 100) / 100 });
  }
  return { checked, fails };
}"""

FIELDS = "(scope) => {" + COLOR + """
  const root = scope ? document.querySelector(scope) : document.body;
  if (!root) return { checked: 0, fails: [] };
  const fails = [];
  let checked = 0;
  for (const el of root.querySelectorAll('input:not([type=hidden]):not([type=range]):not([type=color]), select, textarea, [role=switch]')) {
    if (!visible(el) || disabled(el)) continue;
    const style = getComputedStyle(el);
    if (el.matches('input[type=checkbox], input[type=radio]') && style.appearance !== 'none') continue;
    const outer = backdrop(el.parentElement);
    const own = parse(style.backgroundColor);
    const fill = own && own.a > 0 ? ratio(over(own, outer), outer) : 1;
    const edges = (node, bg) => ['Top', 'Right', 'Bottom', 'Left'].map((side) => {
      const s = getComputedStyle(node);
      return parseFloat(s[`border${side}Width`]) > 0 ? ratio(over(parse(s[`border${side}Color`]), bg), bg) : 1;
    });
    const own_edges = edges(el, outer);
    const wrapper = (!own || own.a === 0) && Math.max(...own_edges) === 1 && el.parentElement ? edges(el.parentElement, backdrop(el.parentElement.parentElement || el.parentElement)) : [1];
    checked += 1;
    const best = Math.max(fill, ...own_edges, ...wrapper);
    if (best < 3) fails.push({ el: name(el), ratio: Math.round(best * 100) / 100 });
  }
  return { checked, fails };
}"""

FOCUS = "() => {" + COLOR + """
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const style = getComputedStyle(el);
  const bg = backdrop(el.parentElement || el);
  const width = parseFloat(style.outlineWidth) || 0;
  const color = parse(style.outlineColor);
  const shadow = style.boxShadow !== 'none';
  return {
    el: name(el),
    label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30),
    outline: style.outlineStyle !== 'none' && width > 0,
    width,
    ratio: color ? Math.round(ratio(over(color, bg), bg) * 100) / 100 : 0,
    shadow,
  };
}"""

TARGETS = "(args) => {" + COLOR + """
  const [scope, minimum, compact] = args;
  const root = scope ? document.querySelector(scope) : document.body;
  if (!root) return { checked: 0, fails: [] };
  const fails = [];
  let checked = 0;
  for (const el of root.querySelectorAll('button, a[href], input:not([type=hidden]), select, [role=tab], [role=menuitem], [role=option], [role=switch], summary')) {
    if (!visible(el) || el.closest('.adsk-viewing-viewer')) continue;
    if (el.matches('.bsh-row-pick, .skip-link, .visually-hidden') || el.clientWidth <= 1) continue;
    if (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) continue;
    const wrapped = el.matches('input[type=checkbox], input[type=radio]') ? el.closest('label') : null;
    const box = wrapped ? wrapped.getBoundingClientRect() : el.getBoundingClientRect();
    const floor = minimum === 44 || !el.matches(compact) ? minimum : 24;
    checked += 1;
    if (Math.round(box.height) < floor || Math.round(box.width) < Math.min(floor, 24)) fails.push({ el: name(el), label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24), h: Math.round(box.height), w: Math.round(box.width) });
  }
  return { checked, fails };
}"""

CLIPPED = """(scope) => [...(scope ? document.querySelector(scope) || document.body : document.body).querySelectorAll('*')]
  .filter((el) => el.children.length === 0 && el.textContent.trim())
  .filter((el) => el.offsetParent !== null && !el.closest('.adsk-viewing-viewer'))
  .filter((el) => {
    const style = getComputedStyle(el);
    const srOnly = style.clipPath !== 'none' || (el.clientWidth <= 1 && el.clientHeight <= 1);
    return !srOnly && el.scrollWidth > el.clientWidth + 1 && style.overflow !== 'visible' && style.textOverflow !== 'ellipsis' && !el.title;
  })
  .map((el) => el.className + ': ' + el.textContent.trim().slice(0, 40))"""

TABS_CUT = """() => [...document.querySelectorAll('.dv-tabs-container')].flatMap((box) => {
  const outer = box.getBoundingClientRect();
  return [...box.querySelectorAll('.dv-tab')]
    .filter((tab) => {
      const r = tab.getBoundingClientRect();
      return r.width > 0 && (r.right > outer.right + 1 || r.left < outer.left - 1);
    })
    .map((tab) => 'tab cut: ' + tab.textContent.trim());
})"""

DIALOG_OVERFLOW = """() => {
  const body = document.querySelector('dialog[open] .modal__body');
  return body ? body.scrollWidth - body.clientWidth : 0;
}"""

STRUCTURE = """() => {
  const dialog = document.querySelector('dialog[open]');
  if (!dialog) return null;
  const pick = (el, keys) => { const s = getComputedStyle(el); return keys.map((k) => s[k]).join(' '); };
  const sig = (selector, keys) => [...new Set([...dialog.querySelectorAll(selector)].filter((el) => el.getBoundingClientRect().height > 0).map((el) => pick(el, keys)))];
  const body = dialog.querySelector('.modal__body > *');
  return {
    headings: sig('h3, legend', ['fontSize', 'fontWeight', 'color']),
    labels: sig('label, .switch-row__label', ['fontSize', 'color']),
    hints: sig('.settings__hint, .switch-row__hint, .bsh-muted, small', ['fontSize', 'color']),
    selects: sig('select', ['height', 'borderRadius', 'backgroundColor', 'fontSize']),
    textInputs: sig('input[type=text], input[type=number], input[type=search], input:not([type])', ['height', 'borderRadius', 'backgroundColor', 'fontSize']),
    buttons: sig('.modal__body button:not([role=switch]):not([role=tab])', ['height', 'borderRadius', 'backgroundColor', 'fontSize', 'fontWeight']),
    sectionGap: body ? getComputedStyle(body).rowGap : '',
    classes: [...new Set([...dialog.querySelectorAll('[class]')].flatMap((el) => [...el.classList]).filter((c) => /^(settings|bsh-|btn|field|switch-row|item-list|inline-action)/.test(c)))].sort(),
  };
}"""


def seed(page, settings):
    page.goto(BASE_URL, wait_until="domcontentloaded")
    page.evaluate("() => localStorage.clear()")
    page.evaluate(
        f"(value) => localStorage.setItem('{SETTINGS_KEY}', JSON.stringify(value))",
        settings,
    )
    page.reload(wait_until="networkidle")
    page.locator(".topbar").first.wait_for(timeout=20000)
    page.locator("[role=treeitem]").first.wait_for(timeout=20000)


def open_model(page):
    expand_to_viewable(page).click()
    page.wait_for_url(re.compile(r"/model/"), timeout=30000)
    page.wait_for_timeout(2000)


def tab_focus(page, scope, stops):
    found = []
    for _ in range(stops):
        page.keyboard.press("Tab")
        page.wait_for_timeout(40)
        state = page.evaluate(FOCUS)
        inside = page.evaluate(
            "(scope) => !scope || Boolean(document.activeElement?.closest(scope))", scope
        )
        if state and inside and not state["el"].startswith("canvas"):
            found.append(state)
    return found


def measure(page, scope, label, results, shots, focus_stops=0):
    entry = {
        "contrast": page.evaluate(CONTRAST, scope),
        "fields": page.evaluate(FIELDS, scope),
        "targets": page.evaluate(TARGETS, [scope, 44 if page.viewport_size["width"] <= STACKED_MAX else 32, COMPACT]),
        "clipped": page.evaluate(CLIPPED, scope) + ([] if scope else page.evaluate(TABS_CUT)),
        "overflow": horizontal_overflow(page),
    }
    if scope == "dialog[open]":
        entry["dialog_overflow"] = page.evaluate(DIALOG_OVERFLOW)
        entry["structure"] = page.evaluate(STRUCTURE)
    page.screenshot(path=str(shots / f"{label}.png"))
    if scope == "dialog[open]":
        full_dialog(page, shots / f"{label}-full.png")
    if focus_stops:
        entry["focus"] = tab_focus(page, scope, focus_stops)
    results[label] = entry


UNCLAMP = "dialog[open], dialog[open] .modal__panel { max-height: none !important; }"


def full_dialog(page, path):
    size = page.viewport_size
    handle = page.add_style_tag(content=UNCLAMP)
    page.set_viewport_size({"width": size["width"], "height": 3000})
    page.wait_for_timeout(200)
    page.locator("dialog[open]").first.screenshot(path=str(path))
    handle.evaluate("(node) => node.remove()")
    page.set_viewport_size(size)
    page.wait_for_timeout(200)


PANES = [
    "Measurements",
    "Sheets and views",
    "Version history",
    "Colors",
    "Export",
    "Search elements",
    "Help",
    "Activity log",
]


def run_command(page, title):
    page.keyboard.press("Control+k")
    palette = page.get_by_role("dialog", name="Command palette")
    palette.wait_for(state="visible", timeout=3000)
    palette.get_by_role("combobox").fill(title)
    page.wait_for_timeout(250)
    palette.get_by_role("option", name=re.compile(f"^{re.escape(title)}", re.I)).first.click(timeout=3000)
    page.wait_for_timeout(1200)


SAVE_FIRST = {
    "viewpoints": [("Viewpoint name", "Save viewpoint", "North view"), ("Viewpoint name", "Save viewpoint", "A second saved viewpoint with a long name")],
    "dashboard-settings": [("Preset name", "Save current board", "Board one")],
    "excel-settings": [("Export preset name", "Save current setup", "Setup one")],
}


def populate(page, key):
    dialog = page.locator("dialog[open]").first
    for field, button, value in SAVE_FIRST.get(key, []):
        dialog.get_by_label(field, exact=True).fill(value)
        dialog.get_by_role("button", name=button).click()
        page.wait_for_timeout(300)


def open_window(page, title):
    page.keyboard.press("Control+k")
    palette = page.get_by_role("dialog", name="Command palette")
    palette.wait_for(state="visible", timeout=3000)
    palette.get_by_role("combobox").fill(title)
    page.wait_for_timeout(250)
    palette.get_by_role("option", name=re.compile(re.escape(title), re.I)).first.click()
    page.locator("dialog[open]").first.wait_for(timeout=3000)
    page.wait_for_timeout(300)


def close_dialog(page):
    page.keyboard.press("Escape")
    page.wait_for_timeout(250)


def run(browser, theme, width, language, results, notes):
    height = WIDTHS[width]
    prefix = f"{theme}-{width}" + (f"-{language}" if language else "")
    shots = OUTPUT_DIR
    context = browser.new_context(viewport={"width": width, "height": height})
    page = context.new_page()
    watch(page, notes)
    settings = {"theme": theme}
    if language:
        settings["language"] = language
    try:
        seed(page, settings)
        measure(page, None, f"{prefix}-home", results, shots)
        open_model(page)
        measure(page, None, f"{prefix}-model", results, shots, focus_stops=0 if language else 40)
        for key, title in WINDOWS:
            try:
                open_window(page, title)
                populate(page, key)
                measure(page, "dialog[open]", f"{prefix}-{key}", results, shots, focus_stops=0 if language else 30)
            except Exception as exc:
                results[f"{prefix}-{key}"] = {"error": f"{type(exc).__name__}: {str(exc)[:160]}"}
            close_dialog(page)
        if width > STACKED_MAX:
            try:
                page.get_by_role("button", name="Documents pane options").first.click()
                page.get_by_role("menuitem", name="Settings").click()
                page.locator("dialog[open]").first.wait_for(timeout=3000)
                measure(page, "dialog[open]", f"{prefix}-documents-settings", results, shots, focus_stops=0 if language else 30)
                close_dialog(page)
            except Exception as exc:
                results[f"{prefix}-documents-settings"] = {"error": f"{type(exc).__name__}: {str(exc)[:160]}"}
        if not language and width == 1440:
            for pane in PANES:
                key = "pane-" + pane.lower().replace(" ", "-")
                try:
                    run_command(page, f"Open {pane} pane")
                    measure(page, None, f"{prefix}-{key}", results, shots)
                    run_command(page, f"Close {pane} pane")
                except Exception as exc:
                    results[f"{prefix}-{key}"] = {"error": f"{type(exc).__name__}: {str(exc)[:160]}"}
                    close_dialog(page)
        for key, name, scope in () if width <= STACKED_MAX else (
            ("panes-menu", "Panes", ".panes-menu__popover"),
            ("workspaces", "Workspaces", "[role=dialog][aria-label='Workspaces']"),
            ("pane-options", "Model summary pane options", "[role=menu]"),
        ):
            try:
                page.get_by_role("button", name=name, exact=True).first.click(timeout=5000)
                page.locator(scope).first.wait_for(timeout=3000)
                measure(page, scope, f"{prefix}-{key}", results, shots)
                close_dialog(page)
            except Exception as exc:
                results[f"{prefix}-{key}"] = {"error": f"{type(exc).__name__}: {str(exc)[:160]}"}
                close_dialog(page)
        try:
            page.locator(".user-menu__trigger").first.click()
            page.locator("[role=menu]").first.wait_for(timeout=3000)
            measure(page, "[role=menu]", f"{prefix}-user-menu", results, shots)
            close_dialog(page)
        except Exception as exc:
            results[f"{prefix}-user-menu"] = {"error": f"{type(exc).__name__}: {str(exc)[:160]}"}
        try:
            page.keyboard.press("Control+k")
            page.get_by_role("dialog", name="Command palette").wait_for(state="visible", timeout=3000)
            measure(page, "[aria-label='Command palette']", f"{prefix}-palette", results, shots)
            close_dialog(page)
        except Exception as exc:
            results[f"{prefix}-palette"] = {"error": f"{type(exc).__name__}: {str(exc)[:160]}"}
    except Exception as exc:
        results[f"{prefix}-setup"] = {"error": f"{type(exc).__name__}: {str(exc)[:160]}"}
    finally:
        page.close()
        context.close()


def hubs_state(route, kind):
    if kind == "error":
        route.fulfill(status=500, content_type="application/json", body='{"error":"Upstream failed"}')
    elif kind == "empty":
        route.fulfill(status=200, content_type="application/json", body="[]")


def run_states(browser, theme, results, notes):
    for kind in ("loading", "error", "empty"):
        label = f"{theme}-1440-state-{kind}"
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        watch(page, notes)
        try:
            page.route("**/api/hubs", (lambda k: lambda route, request=None: hubs_state(route, k))(kind))
            page.goto(BASE_URL, wait_until="domcontentloaded")
            page.evaluate(f"(value) => localStorage.setItem('{SETTINGS_KEY}', JSON.stringify(value))", {"theme": theme})
            page.reload(wait_until="domcontentloaded")
            page.locator(".topbar").first.wait_for(timeout=20000)
            page.wait_for_timeout(2500)
            measure(page, None, label, results, OUTPUT_DIR)
            results[label]["state_blocks"] = page.evaluate(
                "() => [...document.querySelectorAll('.state-block')].map((el) => el.dataset.variant)"
            )
        except Exception as exc:
            results[label] = {"error": f"{type(exc).__name__}: {str(exc)[:160]}"}
        finally:
            page.close()
            context.close()


def run_forced(browser, results, notes):
    try:
        context = browser.new_context(viewport={"width": 1440, "height": 900}, forced_colors="active")
    except Exception as exc:
        results["forced-setup"] = {"error": f"{type(exc).__name__}: {str(exc)[:160]}"}
        return
    page = context.new_page()
    watch(page, notes)
    try:
        seed(page, {"theme": "dark"})
        open_model(page)
        results["forced-active"] = {"active": page.evaluate("() => matchMedia('(forced-colors: active)').matches")}
        measure(page, None, "forced-1440-model", results, OUTPUT_DIR, focus_stops=40)
        for key, title in (("settings", "Open settings"), ("dashboard-settings", "Dashboard settings"), ("excel-settings", "Excel export settings")):
            open_window(page, title)
            measure(page, "dialog[open]", f"forced-1440-{key}", results, OUTPUT_DIR, focus_stops=20)
            close_dialog(page)
    except Exception as exc:
        results["forced-run"] = {"error": f"{type(exc).__name__}: {str(exc)[:160]}"}
    finally:
        page.close()
        context.close()


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    notes = new_notes()
    results = {}
    only = sys.argv[1:]
    with Camoufox(headless=HEADLESS, os=HOST_OS, main_world_eval=True) as browser:
        probe = browser.new_context()
        if not app_reachable(probe):
            print(f"{BASE_URL} is not reachable", file=sys.stderr)
            return 1
        probe.close()
        for theme in THEMES:
            for width in WIDTHS:
                if only and f"{theme}-{width}" not in only:
                    continue
                print(f"{theme} {width}", flush=True)
                run(browser, theme, width, "", results, notes)
        if not only or "states" in only:
            for theme in THEMES:
                print(f"states {theme}", flush=True)
                run_states(browser, theme, results, notes)
            print("forced colors", flush=True)
            run_forced(browser, results, notes)
        for width in (320, 768):
            if only and f"ru-{width}" not in only:
                continue
            print(f"ru {width}", flush=True)
            run(browser, "dark", width, "ru", results, notes)
    (OUTPUT_DIR / "ux_audit.json").write_text(json.dumps({"results": results, "notes": notes}, indent=2, ensure_ascii=False))
    return verdict(results)


def verdict(results):
    problems = []
    for label, entry in results.items():
        if "error" in entry:
            problems.append(f"{label}: could not run: {entry['error'][:120]}")
            continue
        for key in ("contrast", "fields", "targets"):
            for fail in entry.get(key, {}).get("fails", []):
                problems.append(f"{label}: {key} {fail}")
        for clip in entry.get("clipped", []):
            problems.append(f"{label}: clipped {clip}")
        if entry.get("overflow", 0) > 0:
            problems.append(f"{label}: page overflow {entry['overflow']}px")
        if entry.get("dialog_overflow", 0) > 0:
            problems.append(f"{label}: dialog overflow {entry['dialog_overflow']}px")
        for stop in entry.get("focus", []):
            if not stop["outline"] or stop["ratio"] < 3:
                problems.append(f"{label}: focus {stop}")
    for line in problems[:60]:
        print(f"FAIL {line}", flush=True)
    print(f"{len(results)} captures, {len(problems)} problems", flush=True)
    return EXIT_CHECK_FAILED if problems else EXIT_PASS


if __name__ == "__main__":
    sys.exit(main())
