import curses
import random
import time
import math
import threading
import textwrap

class AnimationEngine:
    CONFIG = {
        "FPS": 30,
        "CHARS": ".:*+@#",
        "PARTICLE_CHANCE": 0.65,
        "COLORS": {"ascii": 6, "logs": 10, "border": 11},
        "GAP_PERCENT": 0.10
    }

    def __init__(self, stdscr):
        self.stdscr = stdscr
        self.particles = []
        self.logs = []
        self.running = True
        self.render_error = None
        self.input_active = False
        self.input_result = None
        self.art_lines = []
        self.line_bounds = []
        self.art_y = -100.0
        self.art_visible = False
        self.input_win_info = None

        self._setup_curses()
        self.h, self.w = stdscr.getmaxyx()

        self.thread = threading.Thread(target=self._render_loop, daemon=True)
        self.thread.start()

    def _setup_curses(self):
        curses.curs_set(0)
        self.stdscr.nodelay(True)
        curses.start_color()
        curses.use_default_colors()
        try:
            for i in range(1, 7):
                curses.init_pair(i, 231 + (i * 4), -1)
            curses.init_pair(10, curses.COLOR_WHITE, -1)
            curses.init_pair(11, 8, -1)
        except curses.error:
            pass

    def clear_logs(self):
        self.logs = []

    def log(self, text):
        self.logs.append(f"[{time.strftime('%H:%M:%S')}] {text}")
        if len(self.logs) > 500:
            self.logs.pop(0)

    def set_ascii(self, raw_text):
        self.art_lines = raw_text.splitlines()
        self.line_bounds = []
        blanks = (" ", "⠀")
        for line in self.art_lines:
            content = [i for i, c in enumerate(line) if c not in blanks]
            self.line_bounds.append((min(content), max(content)) if content else None)

    def ensure_healthy(self):
        if self.render_error is not None:
            raise RuntimeError("Animation renderer stopped unexpectedly") from self.render_error

    def animate_ascii_move(self, duration=3, direction="up"):
        self.ensure_healthy()
        self.art_visible = True
        self.h, self.w = self.stdscr.getmaxyx()
        center_y = (self.h - len(self.art_lines)) // 2
        start_time = time.time()

        while True:
            self.ensure_healthy()
            elapsed = time.time() - start_time
            if elapsed > duration:
                break
            p = elapsed / duration
            if direction == "up":
                self.art_y = self.h - ((1 - (1 - p)**3) * (self.h - center_y))
            else:
                self.art_y = center_y - ((p**2) * (center_y + len(self.art_lines)))
            time.sleep(0.01)

        if direction == "out":
            self.art_visible = False

    def sleep(self, duration):
        end_time = time.time() + duration
        while time.time() < end_time:
            self.ensure_healthy()
            time.sleep(min(0.05, end_time - time.time()))

    def ask(self, question, placeholder="", max_length=2048):
        self.ensure_healthy()
        self.input_active = True
        self.input_result = None

        user_input = list(placeholder)
        cursor_pos = len(user_input)

        min_width = max(len(question) + 20, 75)
        win_w = min(min_width, self.w - 10)
        win_h = 10  # more compact

        start_y = (self.h - win_h) // 2 - 1
        start_x = (self.w - win_w) // 2

        self.input_win_info = {
            'y': start_y,
            'x': start_x,
            'w': win_w,
            'h': win_h,
            'question': question,
            'input': user_input,
            'cursor': cursor_pos,
            'max_length': max_length,
            'scroll_offset': 0,
            'input_width': win_w - 10
        }

        while self.input_result is None:
            self.ensure_healthy()
            time.sleep(0.01)

        result = self.input_result
        self.input_active = False
        self.input_win_info = None
        return result

    def _get_win_coords(self):
        gap_w = int(self.w * self.CONFIG["GAP_PERCENT"])
        gap_h = int(self.h * self.CONFIG["GAP_PERCENT"])
        win_w = max(self.w - (gap_w * 2), 10)
        win_h = max(self.h - (gap_h * 2), 5)
        return gap_h, gap_w, win_h, win_w

    def _draw_input_window(self):
        if not self.input_active or not self.input_win_info:
            return

        info = self.input_win_info
        y, x, w, h = info['y'], info['x'], info['w'], info['h']
        input_width = info['input_width']

        try:
            border_attr = curses.color_pair(11)
            text_attr = curses.color_pair(10) | curses.A_BOLD

            # Border
            self.stdscr.addstr(y, x, "┌" + "─" * (w - 2) + "┐", border_attr)
            for i in range(1, h - 1):
                self.stdscr.addstr(y + i, x, "│", border_attr)
                self.stdscr.addstr(y + i, x + w - 1, "│", border_attr)
            self.stdscr.addstr(y + h - 1, x, "└" + "─" * (w - 2) + "┘", border_attr)

            # Clear interior
            for i in range(1, h - 1):
                self.stdscr.addstr(y + i, x + 1, " " * (w - 2))

            # Question (compact)
            q_lines = [info['question'][i:i + w - 8] for i in range(0, len(info['question']), w - 8)]
            for i, line in enumerate(q_lines[:3]):
                qy = y + 2 + i
                if qy < y + h - 5:
                    qx = x + (w - len(line)) // 2
                    self.stdscr.addstr(qy, qx, line, text_attr)

            # Input area - tighter spacing
            input_start_y = y + len(q_lines) + 3
            visible_lines_count = h - len(q_lines) - 6

            full_text = ''.join(info['input'])
            lines = [full_text[i:i + input_width] for i in range(0, len(full_text), input_width)]
            if not lines:
                lines = ['']

            scroll = info.get('scroll_offset', 0)
            visible_lines = lines[scroll:scroll + visible_lines_count]

            for i, line in enumerate(visible_lines):
                iy = input_start_y + i
                if iy >= y + h - 2:
                    break
                self.stdscr.addstr(iy, x + 5, " " * input_width, curses.A_REVERSE)
                for j, char in enumerate(line):
                    self.stdscr.addch(iy, x + 5 + j, char, curses.A_REVERSE)

            # Cursor
            cursor_idx = info['cursor']
            cursor_line = cursor_idx // input_width
            cursor_col = cursor_idx % input_width

            visible_line = cursor_line - scroll
            if 0 <= visible_line < visible_lines_count:
                cursor_y = input_start_y + visible_line
                cursor_x = x + 5 + cursor_col
                if 0 <= cursor_y < self.h and 0 <= cursor_x < self.w:
                    blink = '█' if time.time() % 1 < 0.5 else '_'
                    self.stdscr.addch(cursor_y, cursor_x, blink, curses.A_REVERSE | curses.A_STANDOUT)

            # Counter (moved closer)
            count_text = f"{len(info['input'])}/{info['max_length']}"
            self.stdscr.addstr(y + h - 2, x + w - len(count_text) - 3, count_text, curses.color_pair(10))

        except curses.error:
            pass

    def _handle_input(self):
        if not self.input_active or not self.input_win_info:
            return

        ch = self.stdscr.getch()
        if ch == -1:
            return

        info = self.input_win_info
        input_list = info['input']
        max_len = info['max_length']
        width = info['input_width']

        if ch in (10, 13, curses.KEY_ENTER):
            self.input_result = ''.join(input_list)

        elif ch in (curses.KEY_BACKSPACE, 127, 8):
            if info['cursor'] > 0:
                input_list.pop(info['cursor'] - 1)
                info['cursor'] -= 1

        elif ch == curses.KEY_DC:
            if info['cursor'] < len(input_list):
                input_list.pop(info['cursor'])

        elif ch == curses.KEY_LEFT:
            if info['cursor'] > 0:
                info['cursor'] -= 1
        elif ch == curses.KEY_RIGHT:
            if info['cursor'] < len(input_list):
                info['cursor'] += 1

        elif ch == curses.KEY_UP:
            if info['cursor'] >= width:
                info['cursor'] -= width
            else:
                info['cursor'] = 0

        elif ch == curses.KEY_DOWN:
            if info['cursor'] + width <= len(input_list):
                info['cursor'] += width
            else:
                info['cursor'] = len(input_list)

        elif ch == curses.KEY_HOME:
            info['cursor'] = 0
        elif ch == curses.KEY_END:
            info['cursor'] = len(input_list)

        elif 32 <= ch <= 126:
            if len(input_list) < max_len:
                input_list.insert(info['cursor'], chr(ch))
                info['cursor'] += 1

        # Auto-scroll
        cursor_line = info['cursor'] // width
        visible_lines = info['h'] - 7

        if cursor_line < info.get('scroll_offset', 0):
            info['scroll_offset'] = cursor_line
        elif cursor_line >= info.get('scroll_offset', 0) + visible_lines - 1:
            info['scroll_offset'] = cursor_line - visible_lines + 2

        # Dynamic height (much tighter now)
        needed_h = 8 + (len(input_list) // width) + 3
        new_h = min(max(needed_h, 10), self.h - 8)
        if new_h != info.get('h'):
            info['h'] = new_h
            info['y'] = (self.h - new_h) // 2 - 1

    def _draw_logs(self):
        if self.art_visible:
            max_logs = 12
            all_wrapped = []
            for msg in self.logs:
                all_wrapped.extend(textwrap.wrap(msg, max(30, self.w // 3)))
            display = all_wrapped[-max_logs:]
            start_y = self.h - len(display) - 2
            for i, line in enumerate(display):
                if 0 <= start_y + i < self.h:
                    try:
                        self.stdscr.addstr(start_y + i, 2, line, curses.color_pair(10))
                    except:
                        pass
            return

        start_y, start_x, win_h, win_w = self._get_win_coords()
        try:
            border_attr = curses.color_pair(11)
            self.stdscr.addstr(start_y, start_x, "┌" + "─" * (win_w - 2) + "┐", border_attr)
            for i in range(1, win_h - 1):
                self.stdscr.addstr(start_y + i, start_x, "│", border_attr)
                self.stdscr.addstr(start_y + i, start_x + win_w - 1, "│", border_attr)
            self.stdscr.addstr(start_y + win_h - 1, start_x, "└" + "─" * (win_w - 2) + "┘", border_attr)
        except:
            pass

        max_lines = win_h - 2
        all_wrapped = []
        for msg in self.logs:
            all_wrapped.extend(textwrap.wrap(msg, win_w - 4))
        display = all_wrapped[-max_lines:]

        for i, line in enumerate(display):
            try:
                self.stdscr.addstr(start_y + 1 + i, start_x + 2, line[:win_w-4], curses.color_pair(10))
            except:
                pass

    def _render_loop(self):
        while self.running:
            try:
                self.h, self.w = self.stdscr.getmaxyx()
                self.stdscr.erase()
                now = time.time()

                if self.input_active:
                    self._handle_input()

                if self.input_active and self.input_win_info:
                    min_width = max(len(self.input_win_info['question']) + 20, 75)
                    self.input_win_info['w'] = min(min_width, self.w - 10)
                    self.input_win_info['input_width'] = self.input_win_info['w'] - 10

                # Particles
                if random.random() < self.CONFIG["PARTICLE_CHANCE"]:
                    self.particles.append({
                        "x": random.randint(0, self.w - 1),
                        "y": float(self.h - 1),
                        "speed": random.uniform(0.3, 0.9),
                        "char": random.randint(0, 5),
                        "phase": random.uniform(0, 2 * math.pi)
                    })

                new_particles = []
                wy, wx, wh, ww = self._get_win_coords()

                for p in self.particles:
                    p["y"] -= p["speed"]
                    y, x = int(p["y"]), p["x"]
                    if y <= 0:
                        continue

                    is_hidden = False

                    if not self.art_visible and not self.input_active:
                        if wy <= y < wy + wh and wx <= x < wx + ww:
                            is_hidden = True

                    if not is_hidden and self.art_visible:
                        rel_y = y - int(self.art_y)
                        if 0 <= rel_y < len(self.line_bounds):
                            b = self.line_bounds[rel_y]
                            if b:
                                sx = (self.w - len(self.art_lines[rel_y])) // 2
                                if sx + b[0] <= x <= sx + b[1]:
                                    is_hidden = True

                    if not is_hidden and self.input_active and self.input_win_info:
                        iy = self.input_win_info['y']
                        ix = self.input_win_info['x']
                        iw = self.input_win_info['w']
                        ih = self.input_win_info['h']
                        if iy <= y < iy + ih and ix <= x < ix + iw:
                            is_hidden = True

                    if not is_hidden and 0 <= y < self.h and 0 <= x < self.w:
                        pulse = (math.sin(now * 3.0 + p["phase"]) + 1) / 2
                        color = int(pulse * 5) + 1
                        try:
                            self.stdscr.addch(y, x, self.CONFIG["CHARS"][p["char"]], curses.color_pair(color))
                        except:
                            pass
                        new_particles.append(p)

                self.particles = new_particles

                if self.art_visible:
                    for i, line in enumerate(self.art_lines):
                        ty = int(self.art_y) + i
                        if 0 <= ty < self.h:
                            sx = max(0, (self.w - len(line)) // 2)
                            try:
                                self.stdscr.addstr(ty, sx, line, curses.color_pair(6) | curses.A_BOLD)
                            except:
                                pass

                if not self.input_active:
                    self._draw_logs()

                self._draw_input_window()

                self.stdscr.refresh()
                time.sleep(1 / self.CONFIG["FPS"])
            except Exception as exc:
                self.render_error = exc
                self.running = False
                break

    def stop(self):
        self.running = False
        if self.thread.is_alive() and threading.current_thread() is not self.thread:
            self.thread.join(timeout=0.2)


# ====================== EXAMPLE ======================
def main(stdscr):
    engine = AnimationEngine(stdscr)

    RAW_TEXT = r"""
   _____ _    _ ______ 
  / ____| |  | |  ____|
 | |  __| |__| | |__   
 | | |_ |  __  |  __|  
 | |__| | |  | | |____ 
  \_____|_|  |_|______|
    """
    engine.set_ascii(RAW_TEXT)

    engine.log("System initialized.")
    engine.animate_ascii_move(duration=2.5, direction="up")

    user_text = engine.ask(
        "Type a message with spaces (input box is now tighter):",
        placeholder="This should look much better with less empty space below...",
        max_length=2048
    )

    engine.log(f"Received {len(user_text)} characters.")
    engine.log(f"Preview: {user_text[:100]}{'...' if len(user_text) > 100 else ''}")

    engine.sleep(2)
    engine.animate_ascii_move(duration=2, direction="out")


if __name__ == "__main__":
    try:
        curses.wrapper(main)
    except KeyboardInterrupt:
        pass
