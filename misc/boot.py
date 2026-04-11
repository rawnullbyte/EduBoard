#!/usr/bin/env python3
import subprocess
import os
import socket
from aengine import AnimationEngine
from logo import text as logo_ascii
import curses

def main(stdscr):
    engine = AnimationEngine(stdscr)
    engine.set_ascii(logo_ascii)
    engine.animate_ascii_move(duration=3, direction="up")
    engine.sleep(1)
    engine.animate_ascii_move(duration=3, direction="out")
    subprocess.run(["chvt", "2"])

    while True:
        pass

if __name__ == "__main__":
    curses.wrapper(main)