import json
import re
import sys

from camoufox.sync_api import Camoufox
from common import BASE_URL, DESKTOP, HEADLESS, HOST_OS, MOBILE, OUTPUT_DIR, app_reachable, expand_to_viewable

SETTINGS_KEY = "bsh-settings-v1"
USER = re.compile("Alex Rivera")
VIEWPORTS = {"1440": DESKTOP, "390": MOBILE}
THEMES = ("dark", "light")
DIFF_LIMIT = 0.5
STEP_TIMEOUT_MS = 5000


def settle(page, ms=500):
    page.wait_for_timeout(ms)


def dismiss(page):
    for _ in range(3):
        page.keyboard.press("Escape")
        settle(page, 150)


def user_menu(page):
    page.get_by_role("button", name=USER).first.click()


def settings(page):
    user_menu(page)
    page.get_by_role("menuitem", name="Settings").click()


def settings_sections(page, emit):
    settings(page)
    settle(page)
    dialog = page.get_by_role("dialog", name="Settings", exact=True)
    tabs = dialog.get_by_role("tab")
    if tabs.count() == 0:
        emit("settings-list")
        return
    for index in range(tabs.count()):
        tab = tabs.nth(index)
        name = re.sub(r"[^a-z0-9]+", "-", tab.inner_text().strip().lower()).strip("-")
        tab.click()
        settle(page, 300)
        emit(f"settings-{name}")


def palette(page):
    page.keyboard.press("Control+k")
    page.get_by_role("dialog", name="Command palette").wait_for(timeout=3000)


def share(page):
    page.get_by_role("button", name="Share", exact=True).first.click()


def panes_menu(page):
    page.get_by_role("button", name="Panes").click()


def pane_options(page):
    page.get_by_role("button", name="Model summary pane options").click()


def tasks(page):
    page.get_by_role("button", name=re.compile(r"^Tasks")).click()


OVERLAYS = [
    ("user-menu", user_menu),
    ("command-palette", palette),
    ("share", share),
    ("panes-menu", panes_menu),
    ("pane-options", pane_options),
    ("task-center", tasks),
]


def walk(page, emit):
    page.goto(BASE_URL, wait_until="networkidle")
    page.locator("[role=treeitem]").first.wait_for(timeout=20000)
    settle(page, 800)
    emit("documents")
    expand_to_viewable(page).click()
    page.wait_for_url(re.compile(r"/model/"), timeout=15000)
    settle(page, 3000)
    emit("model")
    for name, action in OVERLAYS:
        try:
            action(page)
            settle(page)
            emit(name)
        except Exception as exc:
            print(f"SKIP {name}: {type(exc).__name__}", flush=True)
        dismiss(page)
    try:
        settings_sections(page, emit)
    except Exception as exc:
        print(f"SKIP settings: {type(exc).__name__}", flush=True)
    dismiss(page)


def each_case(browser, visit):
    for size, (width, height) in VIEWPORTS.items():
        for theme in THEMES:
            context = browser.new_context(viewport={"width": width, "height": height})
            context.add_init_script(
                f"if (!localStorage.getItem('{SETTINGS_KEY}')) localStorage.setItem('{SETTINGS_KEY}', {json.dumps(json.dumps({'theme': theme}))})"
            )
            page = context.new_page()
            page.set_default_timeout(STEP_TIMEOUT_MS)
            page.on("dialog", lambda dialog: dialog.accept())
            visit(page, f"{size}-{theme}")
            context.close()


def shoot(label):
    target = OUTPUT_DIR / "shots" / label
    target.mkdir(parents=True, exist_ok=True)

    def visit(page, case):
        walk(page, lambda name: page.screenshot(path=str(target / f"{case}-{name}.png")))

    with Camoufox(headless=HEADLESS, os=HOST_OS, main_world_eval=True) as browser:
        probe = browser.new_context()
        reachable = app_reachable(probe)
        probe.close()
        if not reachable:
            return 1
        each_case(browser, visit)
    print(f"{len(list(target.glob('*.png')))} screenshots in {target}", flush=True)
    return 0


def diff(before, after):
    from PIL import Image, ImageChops

    root = OUTPUT_DIR / "shots"
    names = sorted({path.name for path in (root / before).glob("*.png")} | {path.name for path in (root / after).glob("*.png")})
    over = 0
    for name in names:
        first, second = root / before / name, root / after / name
        if not first.exists() or not second.exists():
            print(f"MISSING {name}", flush=True)
            over += 1
            continue
        a, b = Image.open(first).convert("RGB"), Image.open(second).convert("RGB")
        if a.size != b.size:
            print(f"SIZE    {name} {a.size} vs {b.size}", flush=True)
            over += 1
            continue
        changed = sum(1 for pixel in ImageChops.difference(a, b).convert("L").getdata() if pixel > 8)
        percent = 100 * changed / (a.size[0] * a.size[1])
        over += percent > DIFF_LIMIT
        print(f"{percent:6.2f}% {name}", flush=True)
    print(f"{over} of {len(names)} above {DIFF_LIMIT}%", flush=True)
    return 0


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--diff":
        sys.exit(diff(sys.argv[2], sys.argv[3]))
    sys.exit(shoot(sys.argv[1] if len(sys.argv) > 1 else "after"))
