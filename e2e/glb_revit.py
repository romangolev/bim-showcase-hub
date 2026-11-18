import base64
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from camoufox.sync_api import Camoufox

from common import (
    DESKTOP,
    EXIT_CHECK_FAILED,
    HOST_OS,
    HEADLESS,
    OUTPUT_DIR,
    Checks,
    glb_check,
    new_notes,
)

ROOT = Path(__file__).resolve().parent.parent
HARNESS = ROOT / "e2e" / "harness"
DEFAULT_URN = (
    "dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6YmltLXNob3djYXNlLXByb2JlLTIwMjYv"
    "cmFjX2FkdmFuY2VkX3NhbXBsZV9wcm9qZWN0LnJ2dA"
)
URN = os.environ.get("E2E_REVIT_URN", DEFAULT_URN).strip()
VIEWER_TIMEOUT_MS = 600_000
IGNORED_CONSOLE = ("mixpanel", "cdn.derivative.autodesk.com")


def load_env():
    env = {}
    path = ROOT / ".env"
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def aps_token(env, scope="data:read viewables:read"):
    client_id = env.get("APS_CLIENT_ID")
    secret = env.get("APS_CLIENT_SECRET")
    if not client_id or not secret:
        raise RuntimeError("APS_CLIENT_ID and APS_CLIENT_SECRET are not set")
    basic = base64.b64encode(f"{client_id}:{secret}".encode()).decode()
    body = urllib.parse.urlencode(
        {"grant_type": "client_credentials", "scope": scope}
    ).encode()
    request = urllib.request.Request(
        "https://developer.api.autodesk.com/authentication/v2/token",
        data=body,
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())


def manifest(token):
    request = urllib.request.Request(
        f"https://developer.api.autodesk.com/modelderivative/v2/designdata/{URN}/manifest",
        headers={"Authorization": f"Bearer {token}", "x-ads-region": "US"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.loads(error.read())
        except Exception:
            return error.code, {}


def bundle(entry="export_harness.ts", folder="glb-harness"):
    target = OUTPUT_DIR / folder / "bundle.js"
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            str(ROOT / "node_modules" / ".bin" / "esbuild"),
            str(HARNESS / entry),
            "--bundle",
            "--format=iife",
            "--platform=browser",
            f"--outfile={target}",
            "--log-level=warning",
        ],
        cwd=ROOT,
        check=True,
    )
    return target


class HarnessServer:
    def __init__(self, token_value, bundle_path):
        self.token_value = token_value
        self.bundle_path = bundle_path
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), self.handler())
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    @property
    def url(self):
        host, port = self.server.server_address
        return f"http://{host}:{port}/"

    def handler(self):
        harness = self
        html = (HARNESS / "index.html").read_bytes()
        bundle_bytes = self.bundle_path.read_bytes()

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def send(self, status, content_type, body):
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                path = urllib.parse.urlparse(self.path).path
                if path == "/token":
                    self.send(
                        200,
                        "application/json",
                        json.dumps(
                            {
                                "access_token": harness.token_value,
                                "expires_in": 3600,
                            }
                        ).encode(),
                    )
                elif path == "/bundle.js":
                    self.send(200, "text/javascript", bundle_bytes)
                elif path in ("/", "/index.html"):
                    self.send(200, "text/html; charset=utf-8", html)
                else:
                    self.send(404, "text/plain", b"not found")

        return Handler

    def close(self):
        self.server.shutdown()


READY = """mw: () => {
    const viewer = window.viewer;
    const model = viewer && viewer.model;
    if (!window.__bshViewerReady || !model) return null;
    const fragments = model.getFragmentList();
    const count = fragments.getCount();
    let geometry = 0;
    for (let i = 0; i < count; i += 1) {
        try { if (fragments.getGeometry(i)) geometry += 1; } catch (error) {}
    }
    const box = model.getBoundingBox ? model.getBoundingBox() : null;
    return {
        fragments: count,
        withGeometry: geometry,
        isLoadDone: model.isLoadDone ? model.isLoadDone() : null,
        unit: model.getUnitString ? model.getUnitString() : null,
        unitScale: model.getUnitScale ? model.getUnitScale() : null,
        box: box ? { min: box.min, max: box.max } : null,
    };
}"""


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    checks = Checks()
    notes = new_notes()
    env = load_env()
    try:
        auth = aps_token(env)
    except Exception as error:
        checks.add("APS two-legged token", False, f"{type(error).__name__}: {error}")
        return checks.finish(notes, "glb-revit-report.json")
    token = auth.get("access_token")
    checks.add("APS two-legged token", bool(token), f"expires in {auth.get('expires_in')}s")
    if not token:
        return checks.finish(notes, "glb-revit-report.json")

    status, body = manifest(token)
    derivative = body.get("status") if isinstance(body, dict) else None
    checks.add(
        "the Revit model has a completed translation",
        status == 200 and derivative == "success",
        f"HTTP {status}, status {derivative}. The default model lives in the maintainer's APS bucket: set E2E_REVIT_URN to a translated Revit model your APS app can read.",
    )
    if status != 200 or derivative != "success":
        notes["urn"] = URN
        return checks.finish(notes, "glb-revit-report.json")

    bundle_path = bundle()
    checks.add("the exporter bundle builds", bundle_path.stat().st_size > 1000, f"{bundle_path.stat().st_size} bytes")
    server = HarnessServer(token, bundle_path)
    try:
        with Camoufox(
            headless=HEADLESS,
            os=HOST_OS,
            main_world_eval=True,
        ) as browser:
            page = browser.new_page(viewport={"width": DESKTOP[0], "height": DESKTOP[1]})
            console = []

            def on_console(message):
                console.append((message.type, message.text[:300]))
                if message.type == "error" and not any(
                    token in message.text for token in IGNORED_CONSOLE
                ):
                    notes["console_errors"].append(message.text[:200])

            page.on("console", on_console)
            page.on("pageerror", lambda error: notes["page_errors"].append(str(error)[:200]))
            page.goto(f"{server.url}?urn={URN}", wait_until="load", timeout=60_000)
            started = time.time()
            metrics = None
            while time.time() - started < VIEWER_TIMEOUT_MS / 1000:
                metrics = page.evaluate(READY)
                if metrics:
                    break
                page.wait_for_timeout(1000)
            elapsed = round(time.time() - started, 1)
            checks.add(
                "the Revit model opens in the viewer",
                bool(metrics) and (metrics.get("fragments") or 0) > 100,
                f"{elapsed}s, {metrics}",
            )
            page.screenshot(path=str(OUTPUT_DIR / "revit-01-loaded.png"))
            if not metrics:
                notes["urn"] = URN
                return checks.finish(notes, "glb-revit-report.json")
            notes["model"] = metrics
            checks.add(
                "every fragment has geometry",
                metrics["withGeometry"] == metrics["fragments"],
                f"{metrics['withGeometry']}/{metrics['fragments']}",
            )
            box = metrics.get("box") or {}
            low, high = box.get("min") or {}, box.get("max") or {}
            size = [round(high.get(axis, 0) - low.get(axis, 0), 2) for axis in ("x", "y", "z")]
            checks.add(
                "the model has real bounds",
                all(value > 0 for value in size),
                f"size {size} {metrics.get('unit')}",
            )
            glb_path = OUTPUT_DIR / "revit.glb"
            try:
                with page.expect_download(timeout=180_000) as download_info:
                    page.locator("#export").click(timeout=8_000)
                download_info.value.save_as(str(glb_path))
                size, magic = glb_path.stat().st_size, glb_path.read_bytes()[:4]
                checks.add("the exporter downloads a GLB", size > 1_000_000 and magic == b"glTF", f"{size} bytes")
                info = glb_check(checks, glb_path, "Revit GLB")
                if info:
                    notes["glb"] = info
                    checks.add(
                        "the GLB carries the whole model",
                        info["triangles"] > 100_000 and info["meshes"] >= 3,
                        f"{info['triangles']} triangles in {info['meshes']} meshes",
                    )
                    checks.add(
                        "most nodes carry a Revit element id",
                        info["nodes_with_dbid"] >= 0.9 * info["nodes"],
                        f"{info['nodes_with_dbid']} of {info['nodes']}",
                    )
            except Exception as error:
                checks.add(
                    "the exporter downloads a GLB",
                    False,
                    f"{type(error).__name__}: {str(error)[:200]}",
                )
            page.screenshot(path=str(OUTPUT_DIR / "revit-02-exported.png"))
            notes["console"] = console[-20:]
            checks.add("no uncaught page errors", not notes["page_errors"], notes["page_errors"][:2])
            checks.add(
                "no console errors from the app",
                not notes["console_errors"],
                notes["console_errors"][:2],
            )
    finally:
        server.close()
    notes["urn"] = URN
    return checks.finish(notes, "glb-revit-report.json")


if __name__ == "__main__":
    sys.exit(main())
