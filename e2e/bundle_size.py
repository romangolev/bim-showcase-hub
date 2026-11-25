import gzip
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "dist" / "web" / "assets"
UI = ROOT / "src" / "web" / "ui"
LAYER_ORDER = ["properties", "theme", "base", "utilities", "effects"]
PROBE_UTILITY = ".min-h-hit{"
BUDGET = {
    "js raw": 1_830_000,
    "js gzip": 545_000,
    "css raw": 310_000,
    "css gzip": 37_000,
}


def measure(suffix):
    data = b"".join(path.read_bytes() for path in sorted(ASSETS.glob(f"*.{suffix}")))
    return len(data), len(gzip.compress(data, 9))


def layer_blocks(css, name):
    blocks = []
    marker = f"@layer {name}{{"
    start = css.find(marker)
    while start != -1:
        depth, index = 1, start + len(marker)
        while depth and index < len(css):
            depth += {"{": 1, "}": -1}.get(css[index], 0)
            index += 1
        blocks.append((start, index))
        start = css.find(marker, index)
    return blocks


def test_only_classes():
    def classes(paths):
        return set(re.findall(r"[\w:./-]+", " ".join(path.read_text() for path in paths)))

    tests = classes(UI.glob("*.test.tsx"))
    sources = classes(path for path in UI.glob("*.tsx") if ".test." not in path.name)
    return {name for name in tests - sources if re.fullmatch(r"(rounded|bg|text|border|p|m|gap)-[a-z0-9-]+", name)}


def check_cascade():
    sheets = {path.name: path.read_text() for path in sorted(ASSETS.glob("*.css"))}
    entry = next((css for name, css in sheets.items() if name.startswith("index-")), "")
    problems = []
    order = []
    for statement in re.findall(r"@layer ([a-z, ]+)[;{]", entry):
        order += [name.strip() for name in statement.split(",") if name.strip() not in order]
    if order != LAYER_ORDER:
        problems.append(f"layers resolve in the order {order}, expected {LAYER_ORDER}")
    utilities = layer_blocks(entry, "utilities")
    probe = entry.find(PROBE_UTILITY)
    if probe == -1 or not any(start < probe < end for start, end in utilities):
        problems.append("primitive utilities are not inside @layer utilities")
    base = layer_blocks(entry, "base")
    element_rule = entry.find("button,input,select,textarea{")
    if element_rule == -1 or not any(start < element_rule < end for start, end in base):
        problems.append("global element rules are not inside @layer base")
    for name, css in sheets.items():
        if css is not entry and (PROBE_UTILITY in css or "@layer" in css):
            problems.append(f"{name} carries utilities or a layer of its own")
        for leaked in sorted(test_only_classes()):
            if f".{leaked}{{" in css:
                problems.append(f"{name} ships the test-only class {leaked}")
    return problems


def main():
    if not ASSETS.is_dir():
        print("dist/web/assets is missing: run npm run build first", file=sys.stderr)
        return 1
    js_raw, js_gzip = measure("js")
    css_raw, css_gzip = measure("css")
    sizes = {"js raw": js_raw, "js gzip": js_gzip, "css raw": css_raw, "css gzip": css_gzip}
    failed = False
    for name, size in sizes.items():
        failed = failed or size > BUDGET[name]
        print(f"{'OVER' if size > BUDGET[name] else 'ok  '} {name:8} {size:>9,} B (budget {BUDGET[name]:,})")
    problems = check_cascade()
    for problem in problems:
        print(f"FAIL cascade: {problem}")
    if not problems:
        print("ok   cascade: order declared first, utilities layered above the base element rules, no test-only class")
    return 1 if failed or problems else 0


if __name__ == "__main__":
    sys.exit(main())
