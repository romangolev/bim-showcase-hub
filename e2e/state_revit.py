import json
import sys
import time

from camoufox.sync_api import Camoufox

from common import (
    DESKTOP,
    HEADLESS,
    HOST_OS,
    OUTPUT_DIR,
    Checks,
    new_notes,
)
from glb_revit import (
    IGNORED_CONSOLE,
    READY,
    URN,
    VIEWER_TIMEOUT_MS,
    HarnessServer,
    aps_token,
    bundle,
    load_env,
    manifest,
)

REPORT = "state-revit-report.json"
CALL = "mw: (a) => window.__bshViewerState[a.name](...a.args)"
TOLERANCE = 1e-3


def near(a, b):
    return all(abs(x - y) <= TOLERANCE * max(1.0, abs(x), abs(y)) for x, y in zip(a, b))


def same_camera(a, b):
    return bool(a) and bool(b) and near(a["eye"], b["eye"]) and near(a["target"], b["target"]) and near(a["up"], b["up"]) and a["ortho"] == b["ortho"]


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    checks = Checks()
    notes = new_notes()
    try:
        auth = aps_token(load_env())
    except Exception as error:
        checks.add("APS two-legged token", False, f"{type(error).__name__}: {error}")
        return checks.finish(notes, REPORT)
    token = auth.get("access_token")
    checks.add("APS two-legged token", bool(token), f"expires in {auth.get('expires_in')}s")
    if not token:
        return checks.finish(notes, REPORT)

    status, body = manifest(token)
    derivative = body.get("status") if isinstance(body, dict) else None
    checks.add(
        "the Revit model has a completed translation",
        status == 200 and derivative == "success",
        f"HTTP {status}, status {derivative}. Set E2E_REVIT_URN to a translated Revit model your APS app can read.",
    )
    notes["urn"] = URN
    if status != 200 or derivative != "success":
        return checks.finish(notes, REPORT)

    bundle_path = bundle("state_harness.ts", "state-harness")
    checks.add("the state harness bundle builds", bundle_path.stat().st_size > 1000, f"{bundle_path.stat().st_size} bytes")
    server = HarnessServer(token, bundle_path)
    try:
        with Camoufox(headless=HEADLESS, os=HOST_OS, main_world_eval=True) as browser:
            page = browser.new_page(viewport={"width": DESKTOP[0], "height": DESKTOP[1]})
            page.on(
                "console",
                lambda message: message.type == "error"
                and not any(item in message.text for item in IGNORED_CONSOLE)
                and notes["console_errors"].append(message.text[:200]),
            )
            page.on("pageerror", lambda error: notes["page_errors"].append(str(error)[:200]))

            def call(name, *args):
                return page.evaluate(CALL, {"name": name, "args": list(args)})

            page.goto(f"{server.url}?urn={URN}", wait_until="load", timeout=60_000)
            started = time.time()
            metrics = None
            while time.time() - started < VIEWER_TIMEOUT_MS / 1000:
                metrics = page.evaluate(READY)
                if metrics:
                    break
                page.wait_for_timeout(1000)
            checks.add(
                "the Revit model opens in the viewer",
                bool(metrics) and (metrics.get("fragments") or 0) > 100,
                f"{round(time.time() - started, 1)}s, {metrics}",
            )
            if not metrics:
                return checks.finish(notes, REPORT)

            leaves = call("leaves")
            checks.add("the object tree has leaf elements", len(leaves) > 100, f"{len(leaves)} leaves")
            hidden_ids = sorted(leaves[10:15])
            isolated_ids = sorted(leaves[40:60])
            selected_ids = sorted(leaves[70:73])

            raw = call("rawState")
            checks.add(
                "viewer.getState with the filter returns only viewport and cutplanes",
                sorted(raw.keys()) == ["cutplanes", "viewport"],
                sorted(raw.keys()),
            )
            notes["filter"] = call("filter")

            base_camera = call("camera")
            checks.add("the camera reads back", bool(base_camera) and len(base_camera["eye"]) == 3, base_camera)

            call("hide", hidden_ids)
            nodes = call("nodes")
            checks.add("hide hides exactly those nodes", sorted(nodes["hidden"]) == hidden_ids, nodes["hidden"])
            call("select", selected_ids)
            call("fit", selected_ids)
            page.wait_for_timeout(500)
            fitted = call("camera")
            checks.add("fitting to items moves the camera", not same_camera(fitted, base_camera), fitted)
            shifted = {**fitted, "eye": [v + 7.0 for v in fitted["eye"]]}
            call("setCamera", shifted)
            page.wait_for_timeout(300)
            checks.add("setCamera moves the camera", not same_camera(call("camera"), fitted), call("camera"))
            call("setCamera", fitted)
            page.wait_for_timeout(300)
            moved = call("camera")

            state_a = call("capture")
            notes["state_a"] = {**state_a, "models": {k: {n: len(v) for n, v in m.items()} for k, m in state_a["models"].items()}}
            model_a = state_a["models"]["revit"]
            checks.add(
                "the captured state holds camera, hidden and selection",
                same_camera(state_a["camera"], moved)
                and sorted(model_a["hidden"]) == hidden_ids
                and sorted(model_a["selection"]) == selected_ids
                and model_a["isolated"] == [],
                {key: model_a[key][:6] for key in model_a},
            )

            call("showAll")
            call("select", [])
            call("fit")
            page.wait_for_timeout(500)
            nodes = call("nodes")
            checks.add(
                "showAll clears hidden and isolated nodes",
                nodes["hidden"] == [] and nodes["isolated"] == [],
                nodes,
            )
            checks.add("fit without items leaves the moved camera behind", not same_camera(call("camera"), moved), call("camera"))

            picked = call("restore", state_a)
            page.wait_for_timeout(500)
            nodes = call("nodes")
            checks.add("restoreState brings back the hidden nodes", sorted(nodes["hidden"]) == hidden_ids, nodes["hidden"])
            checks.add("restoreState brings back the selection", sorted(nodes["selection"]) == selected_ids, nodes["selection"])
            checks.add("restoreState brings back the camera", same_camera(call("camera"), moved), call("camera"))
            checks.add("restoreState reports the restored selection", len(picked) == len(selected_ids), picked)
            page.screenshot(path=str(OUTPUT_DIR / "state-01-restored-hidden.png"))

            call("showAll")
            call("isolate", isolated_ids)
            nodes = call("nodes")
            checks.add("isolate isolates exactly those nodes", sorted(nodes["isolated"]) == isolated_ids, nodes["isolated"])
            state_b = call("capture")
            checks.add(
                "the captured state holds the isolated nodes",
                sorted(state_b["models"]["revit"]["isolated"]) == isolated_ids,
                state_b["models"]["revit"]["isolated"],
            )
            call("showAll")
            call("restore", state_b)
            page.wait_for_timeout(300)
            nodes = call("nodes")
            checks.add("restoreState brings back the isolated nodes", sorted(nodes["isolated"]) == isolated_ids, nodes["isolated"])
            page.screenshot(path=str(OUTPUT_DIR / "state-02-restored-isolated.png"))

            call("showAll")
            call("restore", state_a)
            page.wait_for_timeout(300)
            point_a = json.loads(json.dumps(call("capture")))
            call("showAll")
            call("restore", state_b)
            page.wait_for_timeout(300)
            point_b = json.loads(json.dumps(call("capture")))
            call("showAll")
            call("restore", point_a)
            page.wait_for_timeout(300)
            at_a = (sorted(call("nodes")["hidden"]) == hidden_ids, same_camera(call("camera"), point_a["camera"]))
            call("restore", point_b)
            page.wait_for_timeout(300)
            at_b = (sorted(call("nodes")["isolated"]) == isolated_ids, same_camera(call("camera"), point_b["camera"]))
            call("restore", point_a)
            page.wait_for_timeout(300)
            back_a = (sorted(call("nodes")["hidden"]) == hidden_ids, same_camera(call("camera"), point_a["camera"]))
            checks.add(
                "two viewpoints stored as JSON restore in turn on the real viewer",
                all(at_a) and all(at_b) and all(back_a),
                {"a": at_a, "b": at_b, "back": back_a},
            )

            frame = call("frame")
            plain = call("screenshot", frame["width"], frame["height"])
            double = call("screenshot", frame["width"] * 2, frame["height"] * 2)
            notes["screenshot"] = {"frame": frame, "1x": plain, "2x": double}
            checks.add(
                "getScreenShot at the pane size returns that size",
                abs(plain["width"] - frame["width"]) <= 2 and abs(plain["height"] - frame["height"]) <= 2,
                notes["screenshot"],
            )
            checks.add(
                "getScreenShot at double the pane size returns a larger image",
                abs(double["width"] - frame["width"] * 2) <= 2 and abs(double["height"] - frame["height"] * 2) <= 2,
                notes["screenshot"],
            )

            hide_all = call("hideNodeId")
            call("showAll")
            call("isolate", [hide_all])
            state_c = call("capture")
            call("showAll")
            call("restore", state_c)
            nodes = call("nodes")
            notes["hide_all_sentinel"] = {"captured": state_c["models"]["revit"]["isolated"], "restored": nodes["isolated"]}
            checks.add(
                "the hide-everything isolation survives a round trip",
                state_c["models"]["revit"]["isolated"] == nodes["isolated"] == [hide_all],
                notes["hide_all_sentinel"],
            )

            call("showAll")
            bogus = {
                "version": 1,
                "camera": None,
                "cutplanes": [],
                "models": {
                    "revit": {"isolated": [987654321], "hidden": [987654322], "selection": [987654323]},
                    "other-model": {"isolated": [1], "hidden": [2], "selection": [3]},
                },
            }
            try:
                call("restore", bogus)
                call("restore", None)
                call("restore", {"version": 2})
                call("restore", {"version": 1, "camera": {"eye": ["x"]}, "cutplanes": "no", "models": {"revit": {"isolated": "no"}}})
                survived = True
            except Exception as error:
                survived = False
                notes["restore_error"] = str(error)[:200]
            nodes = call("nodes")
            checks.add("restoreState skips unknown ids and models and never throws", survived, notes.get("restore_error"))
            checks.add(
                "unknown ids leave the model fully visible",
                nodes["isolated"] == [] and nodes["hidden"] == [] and nodes["selection"] == [],
                nodes,
            )

            plane = [0.0, 0.0, 1.0, -1000.0]
            call("restore", {"version": 1, "camera": None, "cutplanes": [plane], "models": {}})
            planes = call("cutplanes")
            checks.add("cutplanes round trip through restoreState", len(planes) == 1 and near(planes[0], plane), planes)
            captured = call("capture")["cutplanes"]
            checks.add("capture reads the cutplanes", len(captured) == 1 and near(captured[0], plane), captured)
            call("restore", {"version": 1, "camera": None, "cutplanes": [], "models": {}})
            checks.add("restoring no cutplanes clears them", call("cutplanes") == [], call("cutplanes"))

            checks.add("no uncaught page errors", not notes["page_errors"], notes["page_errors"][:2])
            checks.add("no console errors from the app", not notes["console_errors"], notes["console_errors"][:2])
    finally:
        server.close()
    return checks.finish(notes, REPORT)


if __name__ == "__main__":
    sys.exit(main())
