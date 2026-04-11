#!/usr/bin/env python3
import curses
from pathlib import Path
import socket
import subprocess
import time

from aengine import AnimationEngine
from logo import text as logo_ascii


def get_ip_address():
    """Get the IP address of the primary network interface."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip_address = sock.getsockname()[0]
        sock.close()
        return ip_address
    except Exception:
        return "Unable to get IP"


def get_interface_info():
    """Get network interface information."""
    interfaces = []
    try:
        result = subprocess.run(["ip", "-br", "addr"], capture_output=True, text=True)
        for line in result.stdout.splitlines():
            if not line.strip():
                continue

            parts = line.split()
            if len(parts) >= 3 and parts[1] == "UP":
                interfaces.append(f"{parts[0]}: {parts[2].split('/')[0]}")
    except Exception:
        return []

    return interfaces


def main(stdscr):
    engine = AnimationEngine(stdscr)
    engine.set_ascii(logo_ascii)
    engine.animate_ascii_move(duration=3, direction="up")
    engine.sleep(1)
    engine.animate_ascii_move(duration=3, direction="out")

    hostname = socket.gethostname()
    ip_address = get_ip_address()
    interfaces = get_interface_info()

    engine.log("=== System Debug Info ===")
    engine.log(f"Hostname: {hostname}")
    engine.log(f"IP Address: {ip_address}")

    if interfaces:
        engine.log("Network Interfaces:")
        for iface in interfaces:
            engine.log(f"  {iface}")

    result = subprocess.run(
        ["systemctl", "is-active", "eduboard.service"],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        engine.log("Backend Service: running")
    else:
        engine.log("Backend Service: not running")

    result = subprocess.run(["date"], capture_output=True, text=True)
    engine.log(f"System Time: {result.stdout.strip()}")

    engine.sleep(3)
    engine.log("Launching graphical interface...")

    state_dir = Path.home() / ".local" / "state" / "eduboard"
    state_dir.mkdir(parents=True, exist_ok=True)
    startx_log_path = state_dir / "startx.log"
    xorg_log_path = Path.home() / ".local" / "share" / "xorg" / "Xorg.0.log"
    if not xorg_log_path.exists():
        xorg_log_path = Path("/var/log/Xorg.0.log")

    tail_proc = None

    try:
        with startx_log_path.open("a", encoding="utf-8") as startx_log:
            x_process = subprocess.Popen(
                ["startx", "--", ":0", "vt2", "-keeptty"],
                stdout=startx_log,
                stderr=subprocess.STDOUT,
            )

            if xorg_log_path.exists():
                tail_proc = subprocess.Popen(
                    ["tail", "-f", str(xorg_log_path)],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                )

                for line in iter(tail_proc.stdout.readline, ""):
                    if line:
                        engine.log(line.strip())

                    if x_process.poll() is not None:
                        break
            else:
                engine.log(
                    f"Xorg log not found. startx output is being written to {startx_log_path}"
                )
                while x_process.poll() is None:
                    time.sleep(0.5)

            exit_code = x_process.wait()
            engine.log(f"X server exited with code {exit_code}.")
            engine.log(f"startx log: {startx_log_path}")
    except Exception as exc:
        engine.log(f"Error monitoring X11: {exc}")
        engine.sleep(5)
    finally:
        if tail_proc and tail_proc.poll() is None:
            tail_proc.terminate()
            try:
                tail_proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                tail_proc.kill()


if __name__ == "__main__":
    curses.wrapper(main)
