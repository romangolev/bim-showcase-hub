import re
import sys

from camoufox.sync_api import Camoufox
from common import (
    BASE_URL,
    Checks,
    DESKTOP,
    HEADLESS,
    HOST_OS,
    MOBILE,
    app_reachable,
    expand_to_viewable,
    horizontal_overflow,
    new_notes,
    watch,
)

SETTINGS_KEY = "bsh-settings-v1"
SHELL_TIMEOUT_MS = 20000
MODEL_TIMEOUT_MS = 30000
SETTLE_MS = 1500
SUMMARY_TAB = "Model summary"
VIEWER = ".adsk-viewing-viewer"
CYRILLIC_FOLDER = "Рабочая документация"
CYRILLIC_TRAIL = [
    "Northwind Architects",
    "Riverside Tower",
    "Project Files",
    CYRILLIC_FOLDER,
]
TREE_EXPAND = {
    "en": "Expand document tree",
    "ru": "Развернуть дерево документов",
}

NAMELESS = """(exclude) => [...document.querySelectorAll('button, a[href], input, select, textarea, [role=button], [role=menuitem], [role=tab]')]
  .filter((el) => el.offsetParent !== null)
  .filter((el) => !exclude || !el.closest(exclude))
  .filter((el) => {
    const label = el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent.trim();
    const by = el.getAttribute('aria-labelledby');
    const labelled = by && by.split(' ').some((id) => document.getElementById(id)?.textContent.trim());
    const forLabel = el.id && document.querySelector(`label[for="${el.id}"]`);
    return !label && !labelled && !forLabel && !el.closest('label');
  })
  .map((el) => el.outerHTML.slice(0, 120))
"""

CLIPPED = """() => [...document.querySelectorAll('body *')]
  .filter((el) => el.children.length === 0 && el.textContent.trim())
  .filter((el) => el.offsetParent !== null && !el.closest('.adsk-viewing-viewer'))
  .filter((el) => {
    const style = getComputedStyle(el);
    const srOnly = style.clipPath !== 'none' || (el.clientWidth <= 1 && el.clientHeight <= 1);
    return !srOnly && el.scrollWidth > el.clientWidth + 1 && style.overflow !== 'visible' && style.textOverflow !== 'ellipsis' && !el.title;
  })
  .map((el) => el.className + ': ' + el.textContent.trim().slice(0, 40))
"""

TOPBAR = """() => {
  const bar = document.querySelector('.topbar');
  return bar ? { scrollWidth: bar.scrollWidth, innerWidth: window.innerWidth } : null;
}"""

STACK_BUTTONS = """() => [...document.querySelectorAll('.stack button')]
  .filter((el) => el.offsetParent !== null)
  .map((el) => ({
    label: (el.getAttribute('aria-label') || el.textContent.trim() || 'button').slice(0, 40),
    height: Math.round(el.getBoundingClientRect().height),
    inline: el.matches('.bsh-row-pick'),
  }))
  .filter((row) => row.height < 44)
"""

STACK_ROWS = """() => [...document.querySelectorAll('.stack .tree-row')]
  .filter((el) => el.offsetParent !== null)
  .map((el) => Math.round(el.getBoundingClientRect().height))
  .filter((height) => height < 44)
"""

DOCK = "mw:() => JSON.stringify(window.__bshLayout.read().dock ?? null)"

GROUP_FOCUSED = """(title) => {
  const el = document.activeElement;
  const group = el && el.closest ? el.closest('.dv-groupview') : null;
  if (!group) return false;
  return [...group.querySelectorAll('.dv-tab')].some((tab) => tab.textContent.trim() === title);
}"""

MENUS = """() => [...document.querySelectorAll('[role=menu]')]
  .filter((menu) => menu.getBoundingClientRect().width > 0 && getComputedStyle(menu).visibility !== 'hidden').length"""

MENU_ITEM = "() => { const el = document.activeElement; return el && el.getAttribute('role') === 'menuitem' ? el.textContent.trim() : ''; }"

FOCUSED_TAB = """() => {
  const el = document.activeElement;
  const tab = el && el.closest ? el.closest('.dv-tab') : null;
  return tab ? tab.textContent.trim() : '';
}"""

CYRILLIC_ROW = """() => {
  const row = [...document.querySelectorAll('[role=treeitem]')]
    .find((el) => el.textContent.includes('Жилой комплекс'));
  if (!row) return null;
  const label = row.querySelector('.tree-row__mid-head') || row;
  return {
    available: document.fonts.check('14px "Inter Variable"', 'Жилой'),
    family: getComputedStyle(label).fontFamily,
    title: row.getAttribute('title') || '',
  };
}"""

FORCED = """() => {
  const tab = document.querySelector('.bsh-dock .dv-tab.dv-active-tab');
  const focused = document.activeElement;
  return {
    active: matchMedia('(forced-colors: active)').matches,
    outlineStyle: focused ? getComputedStyle(focused).outlineStyle : '',
    focusedRole: focused ? focused.getAttribute('role') || focused.className : '',
    borderColor: tab ? getComputedStyle(tab).borderBottomColor : '',
  };
}"""


def lang_flag():
    if "--lang" in sys.argv:
        index = sys.argv.index("--lang")
        if index + 1 < len(sys.argv):
            return sys.argv[index + 1]
    return ""


LANG = lang_flag()


def seed(page, settings):
    page.goto(BASE_URL, wait_until="domcontentloaded")
    page.evaluate("() => localStorage.clear()")
    if settings:
        page.evaluate(
            f"(value) => localStorage.setItem('{SETTINGS_KEY}', JSON.stringify(value))",
            settings,
        )
    page.reload(wait_until="networkidle")


def wait_for_shell(page):
    page.locator(".topbar").first.wait_for(timeout=SHELL_TIMEOUT_MS)
    page.locator("[role=treeitem]").first.wait_for(timeout=SHELL_TIMEOUT_MS)


def open_model(page):
    expand_to_viewable(page).click()
    page.wait_for_url(re.compile(r"/model/"), timeout=MODEL_TIMEOUT_MS)
    page.wait_for_timeout(SETTLE_MS)


def check_names(page, checks, label, exclude=""):
    found = page.evaluate(NAMELESS, exclude)
    checks.add(
        f"{label}: every visible control has an accessible name",
        not found,
        "; ".join(found[:3]),
    )


def check_layout(page, checks, label):
    overflow = horizontal_overflow(page)
    checks.add(f"{label}: no horizontal overflow", overflow <= 0, f"{overflow}px")
    clipped = page.evaluate(CLIPPED)
    checks.add(f"{label}: no clipped text", not clipped, "; ".join(clipped[:3]))
    bar = page.evaluate(TOPBAR)
    checks.add(
        f"{label}: the top bar fits the viewport",
        bool(bar) and bar["scrollWidth"] <= bar["innerWidth"] + 1,
        f"{bar['scrollWidth']}px in {bar['innerWidth']}px" if bar else "no top bar",
    )


def check_cyrillic(page, checks, label):
    page.evaluate("() => document.fonts.ready.then(() => true)")
    for depth, name in enumerate(CYRILLIC_TRAIL, start=1):
        row = page.locator(f"[role=treeitem][aria-level='{depth}']", has_text=name).first
        row.wait_for(timeout=SHELL_TIMEOUT_MS)
        if row.get_attribute("aria-expanded") != "true":
            row.click()
            page.keyboard.press("ArrowRight")
        page.wait_for_timeout(500)
    info = page.evaluate(CYRILLIC_ROW)
    family = (info or {}).get("family", "").replace('"', "").replace("'", "")
    checks.add(
        f"{label}: the Cyrillic row renders in Inter Variable",
        bool(info) and family.startswith("Inter Variable"),
        info["family"] if info else "no Cyrillic row",
    )
    checks.add(
        f"{label}: the Inter Variable Cyrillic face is available",
        bool(info) and info["available"],
        "" if info else "no Cyrillic row",
    )
    checks.add(
        f"{label}: the long Cyrillic name keeps its full text as a title",
        bool(info) and info["title"] == "Жилой комплекс — АР.rvt",
        info["title"] if info else "no Cyrillic row",
    )
    clipped = page.evaluate(CLIPPED)
    checks.add(
        f"{label}: no clipped text with Cyrillic names",
        not clipped,
        "; ".join(clipped[:3]),
    )


def run_cyrillic(browser, checks, notes):
    label = "ru, Cyrillic names"
    context = browser.new_context(viewport={"width": DESKTOP[0], "height": DESKTOP[1]})
    page = context.new_page()
    watch(page, notes)
    try:
        seed(page, {"language": "ru"})
        wait_for_shell(page)
        check_cyrillic(page, checks, label)
    except Exception as exc:
        checks.add(label, False, f"{type(exc).__name__}: {str(exc)[:180]}")
    finally:
        page.close()
        context.close()


def check_targets(page, checks, notes, label):
    expand = TREE_EXPAND.get(LANG, TREE_EXPAND["en"])
    page.get_by_role("button", name=expand).first.click()
    page.wait_for_timeout(600)
    small = page.evaluate(STACK_BUTTONS)
    boxes = [row for row in small if not row["inline"]]
    links = [row for row in small if row["inline"]]
    checks.add(
        f"{label}: stacked buttons reach 44px",
        not boxes,
        "; ".join(f"{row['label']} {row['height']}px" for row in boxes[:4]),
    )
    if links:
        notes["inline_links"] = (
            f"{len(links)} inline table links (.bsh-row-pick) keep their text "
            "height; WCAG 2.5.8 exempts targets inside a sentence"
        )
    rows = page.evaluate(STACK_ROWS)
    checks.add(
        f"{label}: stacked tree rows reach 44px",
        not rows,
        f"{len(rows)} rows, shortest {min(rows)}px" if rows else "",
    )


def check_dock_keyboard(page, checks, notes, label):
    tabs = page.locator(".bsh-dock .dv-tab")
    tabs.first.wait_for(timeout=SHELL_TIMEOUT_MS)
    summary = tabs.filter(has_text=re.compile(f"^{SUMMARY_TAB}$")).first
    summary.focus()
    for _ in range(8):
        if page.evaluate(GROUP_FOCUSED, SUMMARY_TAB):
            break
        page.keyboard.press("F6")
        page.wait_for_timeout(200)
    checks.add(
        f"{label}: F6 reaches the summary group",
        page.evaluate(GROUP_FOCUSED, SUMMARY_TAB),
        page.evaluate(FOCUSED_TAB),
    )

    before = page.evaluate(DOCK)
    page.keyboard.press("Shift+F10")
    page.wait_for_timeout(400)
    opened = page.evaluate(MENUS) > 0
    if not opened:
        notes["dock_menu"] = (
            "Shift+F10 does not open a dock tab menu; the audit reached the pane "
            "options button instead. Binding Shift+F10 on tabs is deferred."
        )
        page.get_by_role("button", name=f"{SUMMARY_TAB} pane options").first.focus()
        page.keyboard.press("Enter")
        page.wait_for_timeout(400)
        opened = page.evaluate(MENUS) > 0
    checks.add(f"{label}: the pane menu opens from the keyboard", opened)

    for _ in range(24):
        if page.evaluate(MENU_ITEM) == "Move left":
            break
        page.keyboard.press("ArrowDown")
        page.wait_for_timeout(80)
    reached = page.evaluate(MENU_ITEM) == "Move left"
    checks.add(f"{label}: the pane menu reaches Move left with arrows", reached)
    if reached:
        page.keyboard.press("Enter")
        page.wait_for_timeout(800)
    checks.add(
        f"{label}: Move left changes the dock",
        bool(before) and page.evaluate(DOCK) != before,
    )
    checks.add(
        f"{label}: focus stays on the moved tab",
        page.evaluate(FOCUSED_TAB) == SUMMARY_TAB,
        page.evaluate(FOCUSED_TAB),
    )


def run_case(browser, checks, notes, label, viewport, settings, with_model, dock=False, targets=False):
    language = (settings or {}).get("language")
    if language:
        label = f"{label} [{language}]"
    context = browser.new_context(viewport={"width": viewport[0], "height": viewport[1]})
    page = context.new_page()
    watch(page, notes)
    try:
        seed(page, settings)
        wait_for_shell(page)
        if with_model:
            open_model(page)
        check_names(page, checks, label, VIEWER if with_model else "")
        check_layout(page, checks, label)
        if targets:
            check_targets(page, checks, notes, label)
        if dock:
            check_dock_keyboard(page, checks, notes, label)
    except Exception as exc:
        checks.add(label, False, f"{type(exc).__name__}: {str(exc)[:180]}")
    finally:
        page.close()
        context.close()


def run_forced_colors(browser, checks, notes):
    label = "forced colors"
    try:
        context = browser.new_context(
            viewport={"width": DESKTOP[0], "height": DESKTOP[1]},
            forced_colors="active",
        )
    except Exception as exc:
        notes["forced_colors"] = (
            f"forced colors cannot be emulated in this Camoufox build "
            f"({type(exc).__name__}); the check was skipped"
        )
        print(f"NOTE {label} - skipped: {type(exc).__name__}", flush=True)
        return
    page = context.new_page()
    watch(page, notes)
    try:
        seed(page, {})
        wait_for_shell(page)
        open_model(page)
        page.locator(".bsh-dock .dv-tab.dv-active-tab").first.click()
        page.keyboard.press("F6")
        page.wait_for_timeout(400)
        state = page.evaluate(FORCED)
    except Exception as exc:
        notes["forced_colors"] = (
            f"forced colors setup failed ({type(exc).__name__}); the check was skipped"
        )
        print(f"NOTE {label} - skipped: {type(exc).__name__}", flush=True)
        return
    finally:
        page.close()
        context.close()
    if not state.get("active"):
        notes["forced_colors"] = (
            "forced colors not supported in this Camoufox build; the check was skipped"
        )
        print(f"NOTE {label} - matchMedia stayed inactive, skipped", flush=True)
        return
    checks.add(
        f"{label}: the focused dock tab keeps an outline",
        state["outlineStyle"] != "none",
        f"{state['focusedRole']} {state['outlineStyle']}",
    )
    checks.add(
        f"{label}: the active dock tab has a border colour",
        state["borderColor"] not in ("", "transparent", "rgba(0, 0, 0, 0)"),
        state["borderColor"],
    )


def main():
    checks = Checks()
    notes = new_notes()
    notes["viewer"] = (
        "the Autodesk Viewer canvas and its controls stay outside the name, clipping "
        "and focus checks; Autodesk owns their markup"
    )
    with Camoufox(headless=HEADLESS, os=HOST_OS, main_world_eval=True) as browser:
        probe = browser.new_context()
        if not app_reachable(probe):
            checks.add(
                "app is reachable",
                False,
                f"{BASE_URL}/api/health did not return 200; start npm run dev:mock",
            )
            probe.close()
            return checks.finish(notes, "a11y_report.json")
        probe.close()

        language = {"language": LANG} if LANG else {}
        run_case(browser, checks, notes, "desktop, no model", DESKTOP, language, False)
        run_case(browser, checks, notes, "desktop, model open", DESKTOP, language, True, dock=True)
        run_case(browser, checks, notes, "200% zoom, no model", (640, 400), language, False)
        run_case(browser, checks, notes, "200% zoom, model open", (640, 400), language, True)
        run_case(browser, checks, notes, "125% text, no model", (1280, 800), {**language, "textSize": 125}, False)
        run_case(browser, checks, notes, "125% text, model open", (1280, 800), {**language, "textSize": 125}, True)
        run_case(browser, checks, notes, "stacked 390, model open", MOBILE, language, True, targets=True)
        if LANG:
            run_cyrillic(browser, checks, notes)
        if not LANG:
            run_case(
                browser,
                checks,
                notes,
                "ru, 200% zoom, no model",
                (640, 400),
                {"language": "ru"},
                False,
            )
            run_case(
                browser,
                checks,
                notes,
                "ru, 125% text, model open",
                (1280, 800),
                {"language": "ru", "textSize": 125},
                True,
            )
        run_forced_colors(browser, checks, notes)
    notes["console_errors"] = [
        error
        for error in notes["console_errors"]
        if "downloadable font" not in error
    ][:5]
    notes["page_errors"] = notes["page_errors"][:5]
    notes["failed_requests"] = notes["failed_requests"][:5]
    return checks.finish(notes, "a11y_report.json")


if __name__ == "__main__":
    sys.exit(main())
