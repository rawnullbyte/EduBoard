import curses
import random
import time
import math
import threading
import textwrap

class AnimationEngine:
    CONFIG = {
        "FPS": 30,
        "CHARS": ".:*+@",
        "PARTICLE_CHANCE": 0.6,
        "COLORS": {"ascii": 6, "logs": 10, "border": 11},
        "GAP_PERCENT": 0.10 
    }

    def __init__(self, stdscr):
        self.stdscr = stdscr
        self.particles = []
        self.logs = []
        self.running = True
        self.input_active = False
        self.input_result = None
        
        self.art_lines = []
        self.art_y = -100.0 
        self.art_visible = False
        self.line_bounds = []

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
            curses.init_pair(10, curses.COLOR_GREEN, -1)
            curses.init_pair(11, 8, -1) 
        except curses.error: pass

    def log(self, text):
        self.logs.append(f"[{time.strftime('%H:%M:%S')}] {text}")
        if len(self.logs) > 500: self.logs.pop(0)

    def set_ascii(self, raw_text):
        self.art_lines = raw_text.splitlines()
        self.line_bounds = []
        blanks = (" ", "⠀")
        for line in self.art_lines:
            content = [i for i, c in enumerate(line) if c not in blanks]
            self.line_bounds.append((min(content), max(content)) if content else None)

    def animate_ascii_move(self, duration=3, direction="up"):
        self.art_visible = True
        self.h, self.w = self.stdscr.getmaxyx()
        center_y = (self.h - len(self.art_lines)) // 2
        start_time = time.time()

        while True:
            elapsed = time.time() - start_time
            if elapsed > duration: break
            p = elapsed / duration
            if direction == "up":
                self.art_y = self.h - ((1 - (1 - p)**3) * (self.h - center_y))
            else:
                self.art_y = center_y - ((p**2) * (center_y + len(self.art_lines)))
            time.sleep(0.01)
        
        if direction == "out":
            self.art_visible = False

    def sleep(self, duration):
        time.sleep(duration)

    def ask(self, question, placeholder=""):
        """Spawn an input window while keeping animation running."""
        self.input_active = True
        self.input_result = None
        
        # Input state
        user_input = list(placeholder)
        cursor_pos = len(user_input)
        
        # Calculate window dimensions - BIGGER
        min_width = max(len(question) + 12, 50)  # Wider minimum
        win_w = min(min_width, self.w - 6)
        win_h = 7  # Taller
        start_y = (self.h - win_h) // 2 - 1
        start_x = (self.w - win_w) // 2
        
        # Store input window info for render loop
        self.input_win_info = {
            'y': start_y, 'x': start_x,
            'w': win_w, 'h': win_h,
            'question': question,
            'input': user_input,
            'cursor': cursor_pos
        }
        
        # Wait for input result
        while self.input_result is None:
            time.sleep(0.01)
        
        result = self.input_result
        self.input_active = False
        
        if result:
            self.log(f"User input: {result}")
        return result

    def _get_win_coords(self):
        """Helper to get the current window boundaries."""
        gap_w = int(self.w * self.CONFIG["GAP_PERCENT"])
        gap_h = int(self.h * self.CONFIG["GAP_PERCENT"])
        win_w = max(self.w - (gap_w * 2), 10)
        win_h = max(self.h - (gap_h * 2), 5)
        return gap_h, gap_w, win_h, win_w

    def _draw_input_window(self):
        """Draw the input window in the same style as log window."""
        if not self.input_active or 'input_win_info' not in self.__dict__:
            return
        
        info = self.input_win_info
        y, x, w, h = info['y'], info['x'], info['w'], info['h']
        
        try:
            border_attr = curses.color_pair(11)
            # Top border
            self.stdscr.addstr(y, x, "┌" + "─"*(w-2) + "┐", border_attr)
            # Side borders
            for i in range(1, h - 1):
                self.stdscr.addstr(y + i, x, "│", border_attr)
                self.stdscr.addstr(y + i, x + w - 1, "│", border_attr)
            # Bottom border
            self.stdscr.addstr(y + h - 1, x, "└" + "─"*(w-2) + "┘", border_attr)
            
            # Clear interior
            for i in range(1, h - 1):
                self.stdscr.addstr(y + i, x + 1, " " * (w - 2))
            
            # Draw question (centered, wrap if too long)
            question = info['question']
            if len(question) > w - 6:
                # Wrap question to multiple lines if needed
                wrapped_q = textwrap.wrap(question, w - 6)
                for i, line in enumerate(wrapped_q[:2]):  # Max 2 lines for question
                    if y + 2 + i < y + h - 2:
                        q_x = x + (w - len(line)) // 2
                        self.stdscr.addstr(y + 2 + i, q_x, line, curses.color_pair(10) | curses.A_BOLD)
            else:
                question_x = x + (w - len(question)) // 2
                self.stdscr.addstr(y + 2, question_x, question, curses.color_pair(10) | curses.A_BOLD)
            
            # Draw input field with background
            input_field_y = y + h - 3
            input_field_x = x + 4  # More padding
            input_width = w - 8
            
            # Input field background
            self.stdscr.addstr(input_field_y, input_field_x, " " * input_width, curses.A_REVERSE)
            
            # Draw input text
            input_str = ''.join(info['input'])
            display_str = input_str[:input_width]
            self.stdscr.addstr(input_field_y, input_field_x, display_str, curses.A_REVERSE)
            
            # Draw cursor
            cursor_x = input_field_x + min(info['cursor'], input_width - 1)
            if 0 <= input_field_y < self.h and 0 <= cursor_x < self.w:
                char_at_cursor = info['input'][info['cursor']] if info['cursor'] < len(info['input']) else ' '
                self.stdscr.addch(input_field_y, cursor_x, char_at_cursor, curses.A_REVERSE | curses.A_STANDOUT)
            
        except curses.error:
            pass

    def _handle_input(self):
        """Handle keyboard input when input is active."""
        if not self.input_active:
            return
        
        ch = self.stdscr.getch()
        if ch == -1:
            return
        
        info = self.input_win_info
        
        if ch == 10 or ch == 13:  # Enter only
            self.input_result = ''.join(info['input'])
        elif ch == curses.KEY_BACKSPACE or ch == 127:
            if info['cursor'] > 0:
                info['input'].pop(info['cursor'] - 1)
                info['cursor'] -= 1
        elif ch == curses.KEY_LEFT:
            if info['cursor'] > 0:
                info['cursor'] -= 1
        elif ch == curses.KEY_RIGHT:
            if info['cursor'] < len(info['input']):
                info['cursor'] += 1
        elif ch == curses.KEY_HOME:
            info['cursor'] = 0
        elif ch == curses.KEY_END:
            info['cursor'] = len(info['input'])
        elif ch == curses.KEY_DC:  # Delete key
            if info['cursor'] < len(info['input']):
                info['input'].pop(info['cursor'])
        elif 32 <= ch <= 126:  # Printable chars
            if len(info['input']) < info['w'] - 9:
                info['input'].insert(info['cursor'], chr(ch))
                info['cursor'] += 1

    def _draw_logs(self):
        if self.art_visible:
            max_logs = 16
            wrap_width = max(20, self.w // 3)
            all_wrapped = []
            for msg in self.logs:
                all_wrapped.extend(textwrap.wrap(msg, wrap_width))
            
            display = all_wrapped[-max_logs:]
            start_y = self.h - len(display) - 1
            for i, line in enumerate(display):
                if 0 <= start_y + i < self.h:
                    try: self.stdscr.addstr(start_y + i, 2, line, curses.color_pair(10))
                    except: pass
        else:
            start_y, start_x, win_h, win_w = self._get_win_coords()
            
            try:
                border_attr = curses.color_pair(11)
                self.stdscr.addstr(start_y, start_x, "┌" + "─"*(win_w-2) + "┐", border_attr)
                for i in range(1, win_h - 1):
                    self.stdscr.addstr(start_y + i, start_x, "│", border_attr)
                    self.stdscr.addstr(start_y + i, start_x + win_w - 1, "│", border_attr)
                self.stdscr.addstr(start_y + win_h - 1, start_x, "└" + "─"*(win_w-2) + "┘", border_attr)
            except: pass

            max_lines = win_h - 2
            all_wrapped = []
            for msg in self.logs:
                all_wrapped.extend(textwrap.wrap(msg, win_w - 4))
            
            display = all_wrapped[-max_lines:]
            for i, line in enumerate(display):
                try: 
                    if i < max_lines:
                        #self.stdscr.addstr(start_y + 1 + i, start_x + 2, line[:win_w-4], curses.color_pair(10))
                        self.stdscr.addstr(start_y + 1 + i, start_x + 2, line, curses.color_pair(10))
                except: pass

    def _render_loop(self):
        while self.running:
            self.h, self.w = self.stdscr.getmaxyx()
            self.stdscr.erase()
            now = time.time()

            # Handle input if active
            if self.input_active:
                self._handle_input()
                
                # Update input window position if screen resized
                if 'input_win_info' in self.__dict__:
                    min_width = max(len(self.input_win_info['question']) + 12, 50)
                    win_w = min(min_width, self.w - 6)
                    win_h = 7
                    self.input_win_info['y'] = (self.h - win_h) // 2 - 1
                    self.input_win_info['x'] = (self.w - win_w) // 2
                    self.input_win_info['w'] = win_w
                    self.input_win_info['h'] = win_h

            # Particles logic
            if random.random() < self.CONFIG["PARTICLE_CHANCE"]:
                self.particles.append({
                    "x": random.randint(0, self.w - 1), "y": float(self.h - 1),
                    "speed": random.uniform(0.3, 0.8), "char": random.randint(0, 4),
                    "phase": random.uniform(0, 2 * math.pi)
                })

            new_particles = []
            wy, wx, wh, ww = self._get_win_coords()

            for p in self.particles:
                p["y"] -= p["speed"]
                y, x = int(p["y"]), p["x"]
                
                if y > 0:
                    is_hidden = False
                    
                    # Hide if inside Center Window (only if art is NOT visible)
                    if not self.art_visible:
                        if wy <= y < (wy + wh) and wx <= x < (wx + ww):
                            is_hidden = True

                    # Hide behind ASCII art (if art IS visible)
                    if not is_hidden and self.art_visible:
                        rel_y = y - int(self.art_y)
                        if 0 <= rel_y < len(self.line_bounds):
                            b = self.line_bounds[rel_y]
                            if b:
                                sx = (self.w - len(self.art_lines[rel_y])) // 2
                                if sx + b[0] <= x <= sx + b[1]: is_hidden = True
                    
                    # Hide behind input window (if input is active)
                    if not is_hidden and self.input_active and 'input_win_info' in self.__dict__:
                        iy, ix, iw, ih = self.input_win_info['y'], self.input_win_info['x'], self.input_win_info['w'], self.input_win_info['h']
                        if iy <= y < (iy + ih) and ix <= x < (ix + iw):
                            is_hidden = True

                    # Draw if not hidden and within screen
                    if not is_hidden and 0 <= y < self.h and 0 <= x < self.w:
                        pulse = (math.sin(now * 3.0 + p["phase"]) + 1) / 2
                        color = int(pulse * 5) + 1
                        try: self.stdscr.addch(y, x, self.CONFIG["CHARS"][p["char"]], curses.color_pair(color))
                        except: pass
                    new_particles.append(p)
            self.particles = new_particles

            # Draw ASCII Art (BEFORE input window so input draws on top)
            if self.art_visible:
                for i, line in enumerate(self.art_lines):
                    ty = int(self.art_y) + i
                    if 0 <= ty < self.h:
                        sx = max(0, (self.w - len(line)) // 2)
                        try: self.stdscr.addstr(ty, sx, line, curses.color_pair(6) | curses.A_BOLD)
                        except: pass

            # Draw Logs (if no input active)
            if not self.input_active:
                self._draw_logs()
            
            # Draw Input Window (ON TOP OF EVERYTHING)
            self._draw_input_window()

            self.stdscr.refresh()
            time.sleep(1/self.CONFIG["FPS"])

# --- RUNTIME ---
def main(stdscr):
    engine = AnimationEngine(stdscr)
    
    # Paste your ASCII logo here
    RAW_TEXT = """[PASTE YOUR ASCII ART HERE]"""
    
    engine.set_ascii(RAW_TEXT)
    engine.log("System boot initiated...")
    engine.animate_ascii_move(duration=2, direction="up")
    
    # Example usage
    name = engine.ask("What is your name?", placeholder="Guest")
    if name:
        engine.log(f"Welcome, {name}!")
    
    response = engine.ask("Enter a command:", placeholder="help")
    engine.log(f"Command received: {response}")
    
    engine.sleep(5)
    engine.animate_ascii_move(duration=1.5, direction="out")
    
    for i in range(100):
        engine.log(f"Monitoring background traffic... Frame {i}")
        time.sleep(0.05)

if __name__ == "__main__":
    curses.wrapper(main)