import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:5173").rstrip("/")
PROFILE_DIR = Path(os.environ.get("E2E_PROFILE_DIR", ROOT / ".profile"))
OUTPUT_DIR = Path(os.environ.get("E2E_OUTPUT_DIR", ROOT / "output"))
DESKTOP = (1440, 900)
MOBILE = (390, 844)
HOST_OS = {"darwin": "macos", "win32": "windows"}.get(sys.platform, "linux")
HEADLESS = os.environ.get("E2E_HEADLESS", "1").strip().lower() not in ("0", "false", "no", "off")
ACTIVE_MODEL = "[data-active='true']"

EXIT_PASS = 0
EXIT_CHECK_FAILED = 1
EXIT_NOT_SIGNED_IN = 2

IGNORED_FAILURES = ("favicon", "cdn.derivative.autodesk.com")

EXPORT_NAME = re.compile(r"Export", re.I)
XLSX_MAGIC = b"PK"


class Checks:
    def __init__(self):
        self.results = []

    def add(self, name, ok, detail=""):
        ok = bool(ok)
        self.results.append({"name": name, "ok": ok, "detail": str(detail)[:240]})
        suffix = f" - {detail}" if detail and not ok else ""
        print(f"{'PASS' if ok else 'FAIL'} {name}{suffix}", flush=True)
        return ok

    @property
    def failed(self):
        return [r for r in self.results if not r["ok"]]

    def finish(self, notes, report_name="report.json"):
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        report = {"base_url": BASE_URL, "checks": self.results, "notes": notes}
        (OUTPUT_DIR / report_name).write_text(json.dumps(report, indent=2))
        total = len(self.results)
        print(f"\n{total - len(self.failed)}/{total} checks passed", flush=True)
        return EXIT_CHECK_FAILED if self.failed else EXIT_PASS


def new_notes():
    return {"console_errors": [], "page_errors": [], "failed_requests": []}


def watch(page, notes):
    def on_console(message):
        if message.type == "error":
            notes["console_errors"].append(message.text[:200])

    def on_page_error(error):
        notes["page_errors"].append(str(error)[:200])

    def on_response(response):
        if response.status >= 400 and not any(
            token in response.url for token in IGNORED_FAILURES
        ):
            notes["failed_requests"].append(f"{response.status} {response.url[:140]}")

    page.on("console", on_console)
    page.on("pageerror", on_page_error)
    page.on("response", on_response)


def api_get(context, path, timeout=30000):
    response = context.request.get(f"{BASE_URL}{path}", timeout=timeout)
    try:
        body = response.json()
    except Exception:
        body = None
    return response.status, body


def app_reachable(context):
    try:
        status, _ = api_get(context, "/api/health", timeout=10000)
    except Exception as exc:
        print(f"Cannot reach {BASE_URL}: {type(exc).__name__}. Start the app or set E2E_BASE_URL.", file=sys.stderr)
        return False
    return status == 200


WRAPPED_CELLS_SCRIPT = """() => [...document.querySelectorAll('table tbody tr td:last-child')]
    .filter(td => {
        const tops = [];
        const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const range = document.createRange();
            range.selectNodeContents(walker.currentNode);
            for (const rect of range.getClientRects()) {
                if (rect.width > 0) tops.push(rect.top);
            }
        }
        tops.sort((a, b) => a - b);
        const lines = tops.filter((top, index) => index === 0 || top - tops[index - 1] > 4).length;
        return lines > 1 || td.scrollWidth > td.clientWidth;
    })
    .length"""


def wrapped_count_cells(page):
    return page.evaluate(WRAPPED_CELLS_SCRIPT)


def horizontal_overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - window.innerWidth")


def main_canvas_width(page):
    return page.evaluate(
        """() => {
            const widths = [...document.querySelectorAll("[data-active='true'] .adsk-viewing-viewer canvas")]
                .map((c) => c.getBoundingClientRect().width);
            return widths.length ? Math.max(...widths) : 0;
        }"""
    )


def wait_for_canvas_width(page, predicate, timeout_ms=5000):
    deadline = timeout_ms // 100
    width = main_canvas_width(page)
    for _ in range(deadline):
        if predicate(width):
            break
        page.wait_for_timeout(100)
        width = main_canvas_width(page)
    return width


def download_export(page, target):
    toolbar_button = page.locator(f"{ACTIVE_MODEL} #export-xlsx")
    button = toolbar_button if toolbar_button.count() else page.get_by_role("button", name=EXPORT_NAME).first
    with page.expect_download(timeout=60000) as download_info:
        button.click(timeout=8000)
    download_info.value.save_as(str(target))
    return target.stat().st_size, target.read_bytes()[:2]


def expand_to_viewable(page, max_depth=8, per_level=4):
    viewable = page.locator("[role=treeitem][data-viewable=true]")
    for depth in range(1, max_depth + 1):
        if viewable.count():
            break
        level = page.locator(f"[role=treeitem][aria-level='{depth}']")
        level.first.wait_for(timeout=15000)
        for _ in range(per_level):
            collapsed = level.locator("xpath=self::*[@aria-expanded='false']")
            if collapsed.count() == 0 or viewable.count():
                break
            collapsed.first.click()
            page.keyboard.press("ArrowRight")
            page.wait_for_timeout(800)
    viewable.first.wait_for(timeout=15000)
    return viewable.first
