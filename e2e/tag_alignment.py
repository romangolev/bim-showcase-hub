import base64
import math
import re
import sys

from camoufox.sync_api import Camoufox
from common import (
    BASE_URL,
    DESKTOP,
    HEADLESS,
    HOST_OS,
    OUTPUT_DIR,
    Checks,
    app_reachable,
    expand_to_viewable,
    new_notes,
    watch,
)

COLORS = ("Red", "Orange", "Yellow", "Green", "Blue", "Purple")
TOLERANCE = 1.0

TAB_BOX = """(title) => {
    const tab = [...document.querySelectorAll('.bsh-dock .dv-tab')]
        .find((el) => el.querySelector('.dv-default-tab-content')?.textContent.trim().startsWith(title));
    if (!tab) return null;
    const content = tab.querySelector('.dv-default-tab-content');
    const group = tab.closest('.dv-groupview');
    const box = tab.getBoundingClientRect();
    const strip = tab.closest('.dv-tabs-and-actions-container').getBoundingClientRect();
    const vertical = getComputedStyle(content).writingMode.startsWith('vertical');
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let text = null;
    while (walker.nextNode()) {
        if (walker.currentNode.textContent.trim()) { text = walker.currentNode; break; }
    }
    range.selectNodeContents(text);
    const glyphs = range.getBoundingClientRect();
    const own = content.getBoundingClientRect();
    return {
        collapsed: group.dataset.collapsed || null,
        vertical,
        color: getComputedStyle(content, '::before').backgroundColor,
        tab: {x: box.x, y: box.y, w: box.width, h: box.height},
        strip: {x: strip.x, y: strip.y, w: strip.width, h: strip.height},
        content: {x: own.x, y: own.y, w: own.width, h: own.height},
        glyphs: {x: glyphs.x, y: glyphs.y, w: glyphs.width, h: glyphs.height},
    };
}"""

INK = """async ({png, color, vertical, scale, crop, area}) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + png;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const {data, width, height} = ctx.getImageData(0, 0, image.width, image.height);
    const want = color.match(/\\d+/g).slice(0, 3).map(Number);
    const px = (x, y) => { const i = (y * width + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
    const bg = px(0, 0);
    const span = [want[0] - bg[0], want[1] - bg[1], want[2] - bg[2]];
    const norm = span[0] ** 2 + span[1] ** 2 + span[2] ** 2;
    const ink = {minX: 1e9, maxX: -1, minY: 1e9, maxY: -1};
    const dot = {sum: 0, sx: 0, sy: 0};
    const within = (r, x, y) => x >= r.x * scale && x < (r.x + r.w) * scale && y >= r.y * scale && y < (r.y + r.h) * scale;
    const inCrop = (x, y) => x >= crop.x * scale && x < (crop.x + crop.w) * scale
        && y >= crop.y * scale && y < (crop.y + crop.h) * scale;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const p = px(x, y);
            const d = [p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]];
            const t = (d[0] * span[0] + d[1] * span[1] + d[2] * span[2]) / norm;
            const off = Math.hypot(d[0] - t * span[0], d[1] - t * span[1], d[2] - t * span[2]);
            if (t > 0.05 && off < 40 && within(area, x, y)) {
                dot.sum += Math.min(t, 1);
                dot.sx += Math.min(t, 1) * (x + 0.5);
                dot.sy += Math.min(t, 1) * (y + 0.5);
            } else if (Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]) > 100 && inCrop(x, y)) {
                ink.minX = Math.min(ink.minX, x);
                ink.maxX = Math.max(ink.maxX, x);
                ink.minY = Math.min(ink.minY, y);
                ink.maxY = Math.max(ink.maxY, y);
            }
        }
    }
    const inkMid = vertical ? (ink.minX + ink.maxX + 1) / 2 : (ink.minY + ink.maxY + 1) / 2;
    return {
        dot: dot.sum ? (vertical ? dot.sx : dot.sy) / dot.sum / scale : null,
        ink: ink.maxX < 0 ? null : inkMid / scale,
    };
}"""


def settle(page, ms=500):
    page.wait_for_timeout(ms)


def pane_menu(page, title, item):
    page.get_by_role("button", name=f"{title} pane options").click()
    page.get_by_role("menuitem", name=item).click()
    settle(page)


def collapse_pane(page, title):
    button = page.get_by_role("button", name=f"Collapse {title}")
    if button.count():
        button.first.click()
        settle(page)
    else:
        pane_menu(page, title, "Collapse")


def expand_pane(page, title):
    button = page.get_by_role("button", name=f"Expand {title}")
    if button.count():
        button.first.click()
        settle(page, 800)
    else:
        pane_menu(page, title, "Expand")


def set_tag(page, title, color):
    pane_menu(page, title, "Color tag…")
    page.get_by_role("dialog", name="Color tag").get_by_role("button", name=color, exact=True).click()
    page.keyboard.press("Escape")
    settle(page, 300)


def measure(page, title, label, shot=False):
    info = page.evaluate(TAB_BOX, title)
    if not info:
        return None
    tab = info["tab"]
    left, top = math.floor(tab["x"]), math.floor(tab["y"])
    clip = {"x": left, "y": top, "width": math.ceil(tab["x"] + tab["w"]) - left, "height": math.ceil(tab["y"] + tab["h"]) - top}
    png = page.screenshot(clip=clip, scale="device")
    if shot:
        (OUTPUT_DIR / f"{label}.png").write_bytes(png)
    glyphs = info["glyphs"]
    crop = {"x": glyphs["x"] - left, "y": glyphs["y"] - top, "w": glyphs["w"], "h": glyphs["h"]}
    own = info["content"]
    area = {"x": own["x"] - left, "y": own["y"] - top, "w": own["w"], "h": own["h"]}
    axis = "x" if info["vertical"] else "y"
    size = "w" if info["vertical"] else "h"
    got = page.evaluate(
        INK,
        {"png": base64.b64encode(png).decode(), "color": info["color"], "vertical": info["vertical"], "scale": int.from_bytes(png[16:20], "big") / clip["width"], "crop": crop, "area": area},
    )
    if got["dot"] is None or got["ink"] is None:
        return None
    origin = left if info["vertical"] else top
    glyph = info["glyphs"][axis] + info["glyphs"][size] / 2 - origin
    strip = info["strip"][axis] + info["strip"][size] / 2 - origin
    return {
        "collapsed": info["collapsed"],
        "dot": got["dot"],
        "ink": got["ink"],
        "glyph_box": glyph,
        "strip": strip,
        "dot_vs_ink": got["dot"] - got["ink"],
        "dot_vs_glyph": got["dot"] - glyph,
        "dot_vs_strip": got["dot"] - strip,
    }


def viewer_title(page):
    return page.evaluate(
        """() => document.querySelector("[data-active='true'] .model-viewer")
            ?.closest('.dv-groupview')?.querySelector('.dv-tab.dv-active-tab .dv-default-tab-content')
            ?.textContent.trim() || ''"""
    )


def check_pane(page, checks, title, collapse, tag):
    state = "collapsed" if collapse else "expanded"
    if collapse:
        settle(page, 1500)
    for color in COLORS:
        set_tag(page, title, color)
        label = f"tag-{tag}-{state}-{color.lower()}"
        found = measure(page, title, label, shot=True)
        if not found:
            checks.add(f"{title} {state} {color} tag is measurable", False, found)
            continue
        offset = found["dot_vs_glyph"]
        print(f"  {title} {state} {color}: " + " ".join(f"{k}={v:+.2f}" if isinstance(v, float) else f"{k}={v}" for k, v in found.items() if k.startswith("dot_vs")), flush=True)
        checks.add(
            f"{title} {state} {color} tag is centred on the text line within {TOLERANCE}px",
            abs(offset) <= TOLERANCE,
            f"offset {offset:+.2f}px",
        )


def run(context, checks, notes):
    page = context.new_page()
    watch(page, notes)
    page.set_viewport_size({"width": DESKTOP[0], "height": DESKTOP[1]})
    page.goto(BASE_URL, wait_until="networkidle")
    expand_to_viewable(page).click()
    page.wait_for_url(re.compile(r"/model/"), timeout=15000)
    settle(page, 2500)
    expand = page.get_by_role("button", name="Expand Dashboard")
    if expand.count():
        expand.first.click()
        settle(page, 800)
    panes = [("Documents", "documents"), ("Model summary", "summary"), ("Dashboard", "dashboard"), (viewer_title(page), "viewer")]
    for title, tag in panes:
        if not title:
            checks.add("viewer tab title is found", False)
            continue
        check_pane(page, checks, title, False, tag)
    for title, tag in panes:
        if not title:
            continue
        try:
            collapse_pane(page, title)
        except Exception as exc:
            checks.add(f"{title} can be collapsed", False, type(exc).__name__)
            continue
        check_pane(page, checks, title, True, tag)
        expand_pane(page, title)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    checks = Checks()
    notes = new_notes()
    with Camoufox(headless=HEADLESS, os=HOST_OS, main_world_eval=True) as browser:
        context = browser.new_context(viewport={"width": DESKTOP[0], "height": DESKTOP[1]}, device_scale_factor=4)
        if not app_reachable(context):
            checks.add("app is reachable", False, f"{BASE_URL}/api/health did not return 200; start npm run dev:mock")
            return checks.finish(notes, "tag-report.json")
        run(context, checks, notes)
        context.close()
    return checks.finish(notes, "tag-report.json")


if __name__ == "__main__":
    sys.exit(main())
