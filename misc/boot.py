#!/usr/bin/env python3
import subprocess
import os
import socket
from aengine import AnimationEngine
from logo import text as logo_ascii
import curses

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
    except Exception as e:
        engine.log(f"fastfetch error: {e}")

    engine.sleep(3)

    engine.set_ascii(logo_ascii)
    engine.animate_ascii_move(duration=3, direction="up")
    engine.sleep(1)
    engine.animate_ascii_move(duration=3, direction="out")

    subprocess.run(["sudo", "chvt", "2"])

    while True:
        pass

if __name__ == "__main__":
    curses.wrapper(main)