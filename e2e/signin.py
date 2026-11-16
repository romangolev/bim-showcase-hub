import sys
import time

from camoufox.sync_api import Camoufox
from common import (
    BASE_URL,
    DESKTOP,
    EXIT_CHECK_FAILED,
    EXIT_PASS,
    PROFILE_DIR,
    api_get,
)

WAIT_SECONDS = 15 * 60
POLL_SECONDS = 2


def main():
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    deadline = time.time() + WAIT_SECONDS
    with Camoufox(
        headless=False,
        persistent_context=True,
        user_data_dir=str(PROFILE_DIR),
        window=DESKTOP,
    ) as context:
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(BASE_URL, wait_until="domcontentloaded")
        print(f"Window open on {BASE_URL}. Sign in to Autodesk in that window.", flush=True)
        while time.time() < deadline:
            try:
                status, body = api_get(context, "/api/session", timeout=10000)
            except Exception as exc:
                print(f"Session check failed: {type(exc).__name__}", flush=True)
                status, body = None, None
            if status == 200:
                print(f"Signed in as {(body or {}).get('name', 'unknown')}. Profile saved to {PROFILE_DIR}", flush=True)
                time.sleep(3)
                return EXIT_PASS
            time.sleep(POLL_SECONDS)
    print(f"Timed out after {WAIT_SECONDS // 60} minutes without a signed-in session.", file=sys.stderr)
    return EXIT_CHECK_FAILED


if __name__ == "__main__":
    sys.exit(main())
