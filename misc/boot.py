#!/usr/bin/env python3
import subprocess
import os
import socket
from aengine import AnimationEngine
from logo import text as logo_ascii
import curses

def get_ip_address():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "Unable to get IP"

def get_interface_info():
    interfaces = []
    try:
        result = subprocess.run(["ip", "-br", "addr"], capture_output=True, text=True)
        for line in result.stdout.split('\n')[1:]:
            if line.strip():
                parts = line.split()
                if len(parts) >= 3 and parts[1] == 'UP':
                    interfaces.append(f"{parts[0]}: {parts[2].split('/')[0]}")
        return interfaces
    except:
        return []

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

    result = subprocess.run(["systemctl", "is-active", "EduBoard.service"], capture_output=True, text=True)
    engine.log(f"Backend Service: {'running' if result.returncode == 0 else 'not running'}")

    result = subprocess.run(["systemctl", "is-active", "cage-kiosk.service"], capture_output=True, text=True)
    engine.log(f"Kiosk Service:   {'running' if result.returncode == 0 else 'starting...'}")

    result = subprocess.run(["date"], capture_output=True, text=True)
    engine.log(f"System Time: {result.stdout.strip()}")

    engine.sleep(3)

if __name__ == "__main__":
    curses.wrapper(main)