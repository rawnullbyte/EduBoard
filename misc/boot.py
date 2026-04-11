#!/usr/bin/env python3
import subprocess
import os
import socket
import fcntl
import struct
from aengine import AnimationEngine
from logo import text as logo_ascii
import curses

def get_ip_address():
    """Get the IP address of the primary network interface."""
    try:
        # Try to get IP from socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "Unable to get IP"

def get_interface_info():
    """Get network interface information."""
    interfaces = []
    try:
        result = subprocess.run(["ip", "-br", "addr"], capture_output=True, text=True)
        for line in result.stdout.split('\n')[1:]:  # Skip header
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
    
    result = subprocess.run(["systemctl", "is-active", "eduboard.service"], capture_output=True, text=True)
    if result.returncode == 0:
        engine.log("Backend Service: running")
    else:
        engine.log("Backend Service: not running")
    
    # Show date and time
    result = subprocess.run(["date"], capture_output=True, text=True)
    engine.log(f"System Time: {result.stdout.strip()}")
    
    engine.sleep(3)

    engine.log("Launching graphical interface...")
    os.execvp("startx", ["startx"])

if __name__ == "__main__":
    curses.wrapper(main)