import sys

from camoufox.sync_api import Camoufox
from common import HEADLESS, HOST_OS, OUTPUT_DIR, app_reachable
from visual_shots import each_case, walk

TOP_LAYER = "dialog[open]"


def snapshot(page):
    dialogs = page.locator(TOP_LAYER)
    scope = dialogs.last if dialogs.count() else page.locator("body")
    return scope.aria_snapshot()


def dump(label):
    target = OUTPUT_DIR / "names"
    target.mkdir(parents=True, exist_ok=True)
    lines = []

    def visit(page, case):
        if not case.endswith("-dark"):
            return
        walk(page, lambda name: lines.append(f"## {case} {name}\n{snapshot(page)}\n"))

    with Camoufox(headless=HEADLESS, os=HOST_OS, main_world_eval=True) as browser:
        probe = browser.new_context()
        reachable = app_reachable(probe)
        probe.close()
        if not reachable:
            return 1
        each_case(browser, visit)
    path = target / f"{label}.txt"
    path.write_text("\n".join(lines))
    print(f"{len(lines)} screens in {path}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(dump(sys.argv[1] if len(sys.argv) > 1 else "after"))
