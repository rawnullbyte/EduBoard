import subprocess
import os
import shutil
from pathlib import Path
from aengine import AnimationEngine
from logo import text as logo_ascii
import curses

def run_command(command, user=None, cwd=None, env=None, log_callback=None):
    custom_env = os.environ.copy()
    custom_env["DEBIAN_FRONTEND"] = "noninteractive"
    custom_env["TERM"] = "xterm-256color" 
    if env:
        custom_env.update(env)

    directory = cwd if cwd else "."
    setup_env = "export TERM=xterm-256color DEBIAN_FRONTEND=noninteractive && "
    
    if user:
        full_command = f"sudo -u {user} -i bash -c '{setup_env} cd {directory} && {command}'"
    else:
        full_command = f"bash -c '{setup_env} {command}'"

    if log_callback:
        log_callback(f"Executing: {command}...")

    process = subprocess.run(
        full_command, shell=True, executable="/bin/bash",
        env=custom_env, capture_output=True, text=True
    )

    if process.returncode != 0:
        if log_callback:
            log_callback(f"ERROR: {process.stderr}")
        raise subprocess.CalledProcessError(process.returncode, full_command, output=process.stdout, stderr=process.stderr)
    
    return process

def write_file(path, content, user=None, mode=0o644):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    if user:
        shutil.chown(path, user=user, group=user)
    os.chmod(path, mode)

def set_hostname(hostname, log_callback=None):
    try:
        run_command(f"sudo hostnamectl set-hostname {hostname}")
        write_file("/etc/hostname", f"{hostname}\n")
        with open("/etc/hosts", "r") as f:
            hosts_content = f.read()
        
        lines = hosts_content.split('\n')
        new_lines = [line if '127.0.1.1' not in line else f"127.0.1.1\t{hostname}" for line in lines]
        if not any('127.0.1.1' in line for line in new_lines):
            new_lines.insert(1, f"127.0.1.1\t{hostname}")
        
        write_file("/etc/hosts", '\n'.join(new_lines))
        return True
    except Exception as e:
        if log_callback: log_callback(f"Failed hostname: {str(e)}")
        return False

def main(stdscr):
    engine = AnimationEngine(stdscr)
    engine.set_ascii(logo_ascii)
    engine.animate_ascii_move(duration=2, direction="up")
    engine.log("=== EduBoard Setup ===")
    
    # --- Config ---
    hostname = engine.ask("Hostname: ", "tv1") or "tv1"
    username = engine.ask("User: ", "kiosk") or "kiosk"
    subdomain = engine.ask("Subdomain: ", "school") or "school"
    screen_id = engine.ask("Screen ID: ", "1") or "1"
    password = engine.ask("Password: ", "123456") or "123456"

    home_dir, repo_dir, venv_dir = f"/home/{username}", f"/home/{username}/EduBoard", f"/home/{username}/venv"

    # --- System Setup ---
    set_hostname(hostname, engine.log)
    try:
        subprocess.run(["id", username], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        run_command(f"sudo adduser --disabled-password --gecos '' {username}")
    
    run_command(f"sudo usermod -aG video,audio,input,tty,render {username}")

    # --- Dependencies & Node 22 ---
    engine.log("Installing Node 22 and Dependencies...")
    run_command("curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -")
    run_command("sudo apt update")
    deps = [
        "curl", "git", "build-essential", "python3-full", "python3-venv", "nodejs",
        "xserver-xorg", "xinit", "openbox", "firefox", "fbterm", "fonts-terminus"
    ]
    run_command(f"sudo apt install -y {' '.join(deps)}")

    engine.log("Granting fbterm TTY permissions...")
    run_command("sudo setcap 'cap_sys_tty_config+ep' /usr/bin/fbterm")

    # --- App Setup ---
    if not os.path.exists(repo_dir):
        run_command(f"git clone https://github.com/rawnullbyte/EduBoard.git {repo_dir}", user=username)
    
    write_file(f"{repo_dir}/.env", f"SCHOOL_SUBDOMAIN={subdomain}\nSCREEN_ID={screen_id}\nPASSWORD={password}\n", user=username)

    engine.log("Setting up Python Venv...")
    run_command(f"python3 -m venv {venv_dir}", user=username)
    run_command(f"{venv_dir}/bin/pip install --upgrade pip", user=username)
    run_command(f"{venv_dir}/bin/pip install -r requirements.txt", user=username, cwd=repo_dir)

    engine.log("Building Frontend...")
    run_command("npm install && npm run build", user=username, cwd=f"{repo_dir}/frontend")

    # --- Config Files ---
    bash_profile = f"""
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

if [[ $(tty) == /dev/tty1 && -z "$FBTERM_TTY" ]]; then
    exec fbterm -- {venv_dir}/bin/python {repo_dir}/misc/boot.py
fi
"""
    write_file(f"{home_dir}/.bash_profile", bash_profile, user=username)

    # Autostart / Xinit
    write_file(f"{home_dir}/.xinitrc", "exec openbox-session\n", user=username)
    os.makedirs(f"{home_dir}/.config/openbox", exist_ok=True)
    write_file(f"{home_dir}/.config/openbox/autostart", "firefox --kiosk http://localhost:8000\n", user=username)

    # --- Services ---
    write_file("/etc/systemd/system/getty@tty1.service.d/override.conf", f"[Service]\nExecStart=\nExecStart=-/sbin/agetty --autologin {username} --noclear %I xterm-256color\n")
    
    service = f"""[Unit]
Description=EduBoard
After=network.target
[Service]
User={username}
WorkingDirectory={repo_dir}
ExecStart=/bin/bash {repo_dir}/run.sh {venv_dir}
Restart=always
Environment=TERM=xterm-256color
EnvironmentFile={repo_dir}/.env
[Install]
WantedBy=multi-user.target"""
    write_file("/etc/systemd/system/eduboard.service", service)

    engine.log("Finalizing...")
    run_command("sudo systemctl daemon-reload && sudo systemctl enable eduboard.service")
    run_command("sleep 3 && sudo reboot")

if __name__ == "__main__":
    curses.wrapper(main)