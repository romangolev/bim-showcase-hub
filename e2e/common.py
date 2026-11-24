import json
import os
import re
import struct
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
GEOMETRY_EXPORT_NAME = re.compile(r"Export geometry", re.I)
IFC_EXPORT_NAME = re.compile(r"Export IFC", re.I)
XLSX_MAGIC = b"PK"
GLB_MAGIC = b"glTF"
GLB_JSON_CHUNK = 0x4E4F534A
GLB_BIN_CHUNK = 0x004E4942


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
    toolbar_button = page.locator(f"{ACTIVE_MODEL} [id^='export-xlsx-']:not([id$='-tooltip'])")
    button = toolbar_button if toolbar_button.count() else page.get_by_role("button", name=EXPORT_NAME).first
    with page.expect_download(timeout=60000) as download_info:
        button.click(timeout=8000)
    download_info.value.save_as(str(target))
    return target.stat().st_size, target.read_bytes()[:2]


def download_glb(page, target, timeout_ms=180000):
    toolbar_button = page.locator(f"{ACTIVE_MODEL} [id^='export-glb-']:not([id$='-tooltip'])")
    button = toolbar_button if toolbar_button.count() else page.get_by_role("button", name=GEOMETRY_EXPORT_NAME).first
    with page.expect_download(timeout=timeout_ms) as download_info:
        button.click(timeout=8000)
    download_info.value.save_as(str(target))
    return target.stat().st_size, target.read_bytes()[:4]


def download_ifc(page, target, timeout_ms=180000):
    toolbar_button = page.locator(f"{ACTIVE_MODEL} [id^='export-ifc-']:not([id$='-tooltip'])")
    button = toolbar_button if toolbar_button.count() else page.get_by_role("button", name=IFC_EXPORT_NAME).first
    with page.expect_download(timeout=timeout_ms) as download_info:
        button.click(timeout=8000)
        current = page.get_by_role("button", name="Export current model")
        try:
            current.wait_for(timeout=1500)
            current.click(timeout=8000)
        except Exception:
            pass
    download_info.value.save_as(str(target))
    return target.stat().st_size, target.read_bytes()[:13]


def download_ifc_batch(page, target, timeout_ms=180000):
    toolbar_button = page.locator(f"{ACTIVE_MODEL} [id^='export-ifc-']:not([id$='-tooltip'])")
    button = toolbar_button if toolbar_button.count() else page.get_by_role("button", name=IFC_EXPORT_NAME).first
    button.first.click(timeout=8000)
    page.get_by_role("button", name=re.compile("Batch export IFC", re.I)).first.click(timeout=8000)
    versions = page.locator("[role=treeitem][data-viewable=true]")
    versions.first.wait_for(timeout=8000)
    for index in range(min(2, versions.count())):
        versions.nth(index).click(modifiers=["Control"], timeout=8000)
    with page.expect_download(timeout=timeout_ms) as download_info:
        page.locator(".doc-tree__picks").get_by_role("button", name="Export IFC").click(timeout=8000)
    download_info.value.save_as(str(target))
    return target.stat().st_size, target.read_bytes()[:4]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def glb_summary(path):
    data = Path(path).read_bytes()
    if len(data) < 20:
        raise ValueError(f"GLB is only {len(data)} bytes")
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise ValueError("not a GLB: bad magic")
    if version != 2:
        raise ValueError(f"unsupported GLB version {version}")
    if length != len(data):
        raise ValueError(f"header length {length} != file length {len(data)}")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != GLB_JSON_CHUNK:
        raise ValueError("first chunk is not JSON")
    doc = json.loads(data[20 : 20 + json_length].decode("utf-8"))
    bin_length = 0
    bin_start = 20 + json_length
    if bin_start < len(data):
        bin_length, bin_type = struct.unpack_from("<II", data, bin_start)
        if bin_type != GLB_BIN_CHUNK:
            raise ValueError("second chunk is not BIN")
        if bin_start + 8 + bin_length > len(data):
            raise ValueError("BIN chunk runs past the file")
    if json_length % 4 or bin_length % 4:
        raise ValueError("chunk length is not 4-byte aligned")
    require(doc.get("asset", {}).get("version") == "2.0", "asset.version is not 2.0")
    buffers = doc.get("buffers") or []
    if buffers and buffers[0].get("byteLength", 0) > bin_length:
        raise ValueError("buffer byteLength exceeds the BIN chunk")
    views = doc.get("bufferViews") or []
    for view in views:
        require(view.get("buffer") == 0, "bufferView.buffer is not 0")
        require(view.get("byteOffset", 0) % 4 == 0, "bufferView is not 4-byte aligned")
        if view.get("byteOffset", 0) + view.get("byteLength", 0) > bin_length:
            raise ValueError("bufferView runs past the BIN chunk")
    accessors = doc.get("accessors") or []
    for accessor in accessors:
        require(accessor.get("bufferView", -1) in range(len(views)), "accessor.bufferView is out of range")
        require(accessor.get("count", 0) > 0, "accessor.count is not positive")
        require(accessor.get("componentType") in (5123, 5125, 5126), "accessor.componentType is not supported")
        require(accessor.get("type") in ("SCALAR", "VEC3"), "accessor.type is not supported")
    meshes = doc.get("meshes") or []
    materials = doc.get("materials") or []
    bin_data = data[bin_start + 8 : bin_start + 8 + bin_length] if bin_length else b""
    for mesh in meshes:
        require(mesh.get("primitives"), "mesh has no primitives")
        for primitive in mesh["primitives"]:
            position = primitive.get("attributes", {}).get("POSITION", -1)
            index = primitive.get("indices", -1)
            require(position in range(len(accessors)), "primitive.POSITION is out of range")
            require(index in range(len(accessors)), "primitive.indices is out of range")
            require(primitive.get("material", 0) in range(len(materials)), "primitive.material is out of range")
            require(primitive.get("mode") == 4, "primitive.mode is not TRIANGLES")
            vertices = accessors[position]
            require(vertices["type"] == "VEC3" and vertices["componentType"] == 5126, "POSITION is not float VEC3")
            require(len(vertices.get("min", [])) == 3 and len(vertices.get("max", [])) == 3, "POSITION has no min and max")
            triangles = accessors[index]
            require(triangles["type"] == "SCALAR" and triangles["componentType"] in (5123, 5125), "indices are not unsigned SCALAR")
            require(triangles["count"] % 3 == 0, "index count is not a multiple of 3")
            view = views[triangles["bufferView"]]
            code = "H" if triangles["componentType"] == 5123 else "I"
            start = view.get("byteOffset", 0)
            values = memoryview(bin_data)[start : start + triangles["count"] * (2 if code == "H" else 4)].cast(code)
            require(max(values) < vertices["count"], "an index points past its vertices")
    nodes = doc.get("nodes") or []
    for node in nodes:
        require(node.get("mesh", 0) in range(len(meshes)), "node.mesh is out of range")
    scenes = doc.get("scenes") or []
    require(scenes and doc.get("scene", 0) in range(len(scenes)), "scene is out of range")
    require(all(n in range(len(nodes)) for n in scenes[doc.get("scene", 0)].get("nodes", [])), "scene node is out of range")
    positions = [a for a in accessors if a.get("type") == "VEC3" and a.get("componentType") == 5126]
    index_accessors = [a for a in accessors if a.get("type") == "SCALAR" and a.get("componentType") in (5123, 5125)]
    triangles = sum(a.get("count", 0) // 3 for a in index_accessors)
    mins = [a.get("min") for a in positions if isinstance(a.get("min"), list)]
    maxs = [a.get("max") for a in positions if isinstance(a.get("max"), list)]
    bounds = None
    if mins and maxs:
        bounds = {
            "min": [min(v[i] for v in mins) for i in range(3)],
            "max": [max(v[i] for v in maxs) for i in range(3)],
        }
    return {
        "bytes": len(data),
        "version": version,
        "meshes": len(meshes),
        "nodes": len(nodes),
        "nodes_with_dbid": sum(1 for n in nodes if "dbId" in (n.get("extras") or {})),
        "materials": len(materials),
        "vertices": sum(a.get("count", 0) for a in positions),
        "triangles": triangles,
        "bounds": bounds,
    }


def glb_check(checks, path, label="GLB"):
    try:
        info = glb_summary(path)
    except Exception as exc:
        checks.add(f"{label} is valid glTF 2.0", False, f"{type(exc).__name__}: {exc}")
        return None
    checks.add(
        f"{label} is valid glTF 2.0",
        info["triangles"] > 0 and info["meshes"] > 0 and info["vertices"] > 0,
        f"{info['triangles']} triangles, {info['vertices']} vertices, {info['meshes']} meshes, {info['bytes']} bytes",
    )
    checks.add(
        f"{label} nodes carry element ids",
        info["nodes_with_dbid"] > 0,
        f"{info['nodes_with_dbid']} of {info['nodes']} nodes have extras.dbId",
    )
    if info["bounds"]:
        size = [round(info["bounds"]["max"][i] - info["bounds"]["min"][i], 3) for i in range(3)]
        checks.add(
            f"{label} has non-zero bounds",
            all(value > 0 for value in size),
            f"size {size}",
        )
    return info


STEP_LINE = re.compile(r"^#\d+=([A-Z0-9_]+)\((.*)\);$")
STEP_STRING = re.compile(r"'(?:[^']|'')*'")


def step_argument_count(text):
    text = STEP_STRING.sub("''", text)
    depth, count = 0, 1 if text else 0
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "," and depth == 0:
            count += 1
    return count


def ifc_attribute_mismatches(path, schema_name="IFC4", per_type=200):
    import ifcopenshell.ifcopenshell_wrapper as wrapper

    schema = wrapper.schema_by_name(schema_name)
    seen, mismatches = {}, []
    with open(path, encoding="utf-8", errors="replace") as handle:
        for line in handle:
            match = STEP_LINE.match(line.rstrip("\n"))
            if not match:
                continue
            name = match.group(1)
            if seen.get(name, 0) >= per_type:
                continue
            seen[name] = seen.get(name, 0) + 1
            try:
                expected = schema.declaration_by_name(name).as_entity().attribute_count()
            except Exception:
                mismatches.append(f"{name}: not an IFC4 entity")
                continue
            found = step_argument_count(match.group(2))
            if found != expected:
                mismatches.append(f"{name}: {found} attributes in the file, {expected} in IFC4")
    return sorted(set(mismatches))


def ifc_summary(path):
    import ifcopenshell
    import ifcopenshell.geom
    import ifcopenshell.validate

    model = ifcopenshell.open(str(path))
    elements = model.by_type("IfcElement")
    guids = [e.GlobalId for e in model.by_type("IfcRoot")]
    logger = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(model, logger)
    errors = [s["message"] for s in logger.statements if str(s.get("level", "")).lower() == "error"]
    errors += ifc_attribute_mismatches(path)
    with_geometry = [e for e in elements if e.Representation is not None]
    settings = ifcopenshell.geom.settings()
    settings.set("use-world-coords", True)
    step = max(1, len(with_geometry) // 200)
    sample = with_geometry[::step][:200]
    low, high, shaped = [None] * 3, [None] * 3, 0
    for element in sample:
        try:
            shape = ifcopenshell.geom.create_shape(settings, element)
        except Exception:
            continue
        verts = shape.geometry.verts
        if not verts:
            continue
        extents = [max(verts[axis::3]) - min(verts[axis::3]) for axis in range(3)]
        if max(extents) <= 0:
            continue
        shaped += 1
        for axis in range(3):
            values = verts[axis::3]
            lo, hi = min(values), max(values)
            low[axis] = lo if low[axis] is None else min(low[axis], lo)
            high[axis] = hi if high[axis] is None else max(high[axis], hi)
    assigned = sum(
        len(rel.RelatedElements)
        for storey in model.by_type("IfcBuildingStorey")
        if storey.Name != "Unassigned"
        for rel in storey.ContainsElements
    )
    return {
        "bytes": Path(path).stat().st_size,
        "schema": model.schema,
        "elements": len(elements),
        "storeys": len(model.by_type("IfcBuildingStorey")),
        "buildings": len(model.by_type("IfcBuilding")),
        "unique_guids": len(set(guids)) == len(guids) and all(len(g) == 22 for g in guids),
        "with_geometry": len(with_geometry),
        "in_real_storeys": assigned,
        "sampled": len(sample),
        "shaped": shaped,
        "size": [round(high[i] - low[i], 3) for i in range(3)] if shaped else None,
        "validation_errors": errors[:5],
        "validation_error_count": len(errors),
    }


def ifc_check(checks, path, label="IFC", expected_elements=None, min_storey_share=None):
    try:
        info = ifc_summary(path)
    except Exception as exc:
        checks.add(f"{label} parses with IfcOpenShell", False, f"{type(exc).__name__}: {str(exc)[:200]}")
        return None
    checks.add(f"{label} schema is IFC4", info["schema"] == "IFC4", info["schema"])
    checks.add(
        f"{label} has a building and storeys",
        info["buildings"] >= 1 and info["storeys"] >= 1,
        f"{info['buildings']} buildings, {info['storeys']} storeys",
    )
    checks.add(
        f"{label} GlobalIds are unique and 22 characters",
        info["unique_guids"],
        f"{info['elements']} elements",
    )
    checks.add(
        f"{label} elements carry geometry",
        info["elements"] > 0 and info["with_geometry"] >= 0.9 * info["elements"],
        f"{info['with_geometry']} of {info['elements']}",
    )
    checks.add(
        f"{label} sampled shapes tessellate with a bounding box",
        info["sampled"] > 0 and info["shaped"] >= 0.9 * info["sampled"],
        f"{info['shaped']} of {info['sampled']}",
    )
    if min_storey_share is not None:
        share = info["in_real_storeys"] / info["elements"] if info["elements"] else 0
        checks.add(
            f"{label} assigns elements to real storeys",
            share >= min_storey_share,
            f"{info['in_real_storeys']} of {info['elements']} ({share:.1%}), floor {min_storey_share:.0%}",
        )
    checks.add(
        f"{label} passes IfcOpenShell validation",
        info["validation_error_count"] == 0,
        info["validation_errors"] or "no errors",
    )
    if expected_elements is not None:
        drift = abs(info["elements"] - expected_elements) / expected_elements if expected_elements else 1
        checks.add(
            f"{label} element count matches the viewer",
            bool(expected_elements) and drift <= 0.01,
            f"{info['elements']} in the file, {expected_elements} in the viewer",
        )
    return info


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
