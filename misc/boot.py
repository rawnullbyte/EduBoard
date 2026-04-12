#!/usr/bin/env python3
import subprocess
import os
import time
import curses
import httpx
from aengine import AnimationEngine
from logo import text as logo_ascii


def main(stdscr):
    engine = AnimationEngine(stdscr)

    try:
        result = subprocess.run(
            ["fastfetch", "--logo", "none", "--structure-disabled", "colors"],
            capture_output=True, text=True
        )
        for line in result.stdout.splitlines():
            if line.strip():
                engine.log(line)
    except Exception:
        pass

    engine.sleep(3)
    engine.clear_logs()
    engine.set_ascii(logo_ascii)
    engine.animate_ascii_move(duration=3, direction="up")
    engine.sleep(1)
    engine.animate_ascii_move(duration=3, direction="out")

    engine.log("→ Waiting for http://localhost:8000 to be ready...")
    start_time = time.time()
    timeout = 60
    ready = False

    while time.time() - start_time < timeout:
        try:
            resp = httpx.get("http://localhost:8000", timeout=2)
            if resp.status_code < 400:
                engine.log(f"✓ localhost:8000 is ready (status {resp.status_code})")
                ready = True
                break
        except (httpx.exceptions.RequestException, ConnectionError):
            pass

        time.sleep(0.5)

    if not ready:
        engine.log("✗ Timeout waiting for localhost:8000 (continuing anyway)")

    engine.log("→ Switching to tty2...")
    subprocess.run(["sudo", "chvt", "2"])

    env = os.environ.copy()
    env.update({
        "WLR_BACKENDS": "drm",
        "XDG_RUNTIME_DIR": f"/run/user/{os.getuid()}",
        "WAYLAND_DISPLAY": "wayland-0",
        "LIBSEAT_BACKEND": "seatd",
        "WLR_LIBINPUT_NO_DEVICES": "1",
        "WLR_NO_HARDWARE_CURSORS": "1",
        "XDG_SESSION_TYPE": "wayland",
        "XDG_CURRENT_DESKTOP": "sway",
    })

    # Start Sway
    engine.log("→ Launching Sway...")
    try:
        subprocess.run(["sway"], env=env, check=True)
    except Exception as e:
        engine.log(f"✗ Failed to start Sway: {e}")
        time.sleep(10)


if __name__ == "__main__":
    curses.wrapper(main)