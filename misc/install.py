import subprocess
import os
import shutil
from pathlib import Path
from aengine import AnimationEngine
from logo import text as logo_ascii
import curses

def run_command(command, user=None, cwd=None, env=None, log_callback=None):
    """Utility to run shell commands with real-time logging."""
    if user:
        command = f"sudo -u {user} {command}"
    
    # Use Popen to start the process without blocking
    process = subprocess.Popen(
        command,
        shell=True,
        executable="/bin/bash",
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    if log_callback:
        for line in iter(process.stdout.readline, ''):
            if line:
                log_callback(line.strip())
    
    process.stdout.close()
    return_code = process.wait()

    if return_code != 0:
        if log_callback:
            log_callback(f"ERROR: Command failed with exit code {return_code}")
        raise subprocess.CalledProcessError(return_code, command)
    
    return process

def write_file(path, content, user=None, mode=0o644):
    """Writes content to a file and sets ownership/permissions."""
    path = Path(path)
    # Ensure directory exists
    path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(path, "w") as f:
        f.write(content)
    
    if user:
        shutil.chown(path, user=user, group=user)
    os.chmod(path, mode)

def set_hostname(hostname, log_callback=None):
    """Change the system hostname."""
    try:
        run_command(f"sudo hostnamectl set-hostname {hostname}")
        write_file("/etc/hostname", f"{hostname}\n")
        with open("/etc/hosts", "r") as f:
            hosts_content = f.read()
        
        lines = hosts_content.split('\n')
        new_lines = []
        for line in lines:
            if line.strip() and not line.startswith('#'):
                parts = line.split()
                if '127.0.1.1' in parts and len(parts) > 1:
                    parts[1] = hostname
                    new_lines.append(' '.join(parts))
                else:
                    new_lines.append(line)
            else:
                new_lines.append(line)
        
        if not any('127.0.1.1' in line for line in new_lines):
            new_lines.insert(1, f"127.0.1.1\t{hostname}")
        
        write_file("/etc/hosts", '\n'.join(new_lines))
        
        if log_callback:
            log_callback(f"Hostname changed to: {hostname}")
        
        return True
    except Exception as e:
        if log_callback:
            log_callback(f"Failed to set hostname: {str(e)}")
        return False

def main(stdscr):
    engine = AnimationEngine(stdscr)
    engine.set_ascii(logo_ascii)
    engine.animate_ascii_move(duration=3, direction="up")
    engine.sleep(1)
    engine.animate_ascii_move(duration=3, direction="out")
    engine.log("=== EduBoard Setup ===")
    

    # --- Configuration ---
    hostname = engine.ask("Hostname: ", placeholder="tv1")
    if not hostname:
        hostname = "tv1"
    
    username = engine.ask("Kiosk Username: ", placeholder="kiosk")
    if not username:
        username = "kiosk"
    
    subdomain = engine.ask("Subdomain: ", placeholder="schoolname")
    if not subdomain:
        subdomain = "schoolname"
    
    screen_id = engine.ask("Screen ID: ", placeholder="9")
    if not screen_id:
        screen_id = "1"
    
    password = engine.ask("Password: ", placeholder="123456")
    if not password:
        password = "123456"

    home_dir = f"/home/{username}"
    repo_dir = f"{home_dir}/EduBoard"
    venv_dir = f"{home_dir}/venv"

    # --- Set Hostname ---
    engine.log(f"Setting hostname to: {hostname}")
    if not set_hostname(hostname, engine.log):
        engine.log("WARNING: Failed to set hostname, continuing anyway...")

    # --- System & User ---
    try:
        subprocess.run(["id", username], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        run_command(f"sudo adduser --disabled-password --gecos '' {username}")
    
    run_command(f"sudo usermod -aG video,audio,input,tty,render {username}")

    # --- Dependencies ---
    engine.log("Updating system and installing dependencies...")
    run_command("sudo apt update && sudo apt upgrade -y")
    deps = [
        "curl", "git", "build-essential", "python3-full", "python3-venv", "nodejs",
        "xserver-xorg", "x11-xserver-utils", "xinit", "openbox", "firefox", 
        "unclutter", "dbus-x11", "fonts-freefont-ttf", "fonts-noto-core", "npm"
    ]
    run_command(f"sudo apt install -y {' '.join(deps)}")

    # --- App Setup ---
    if not os.path.exists(repo_dir):
        run_command(f"git clone https://github.com/rawnullbyte/EduBoard.git {repo_dir}", user=username)
    else:
        run_command("git pull", user=username, cwd=repo_dir)

    # Create .env
    env_content = f"""SCHOOL_SUBDOMAIN={subdomain}
SCREEN_ID={screen_id}
PASSWORD={password}
"""
    write_file(f"{repo_dir}/.env", env_content, user=username)

    # Python Venv & Requirements
    run_command(f"python3 -m venv {venv_dir}", user=username)
    run_command(f"{venv_dir}/bin/pip install --upgrade pip", user=username)
    if os.path.exists(f"{repo_dir}/requirements.txt"):
        run_command(f"{venv_dir}/bin/pip install -r requirements.txt", user=username, cwd=repo_dir)

    # Frontend Build
    frontend_dir = f"{repo_dir}/frontend"
    if os.path.exists(frontend_dir):
        run_command("npm ci --no-audit && npm run build", user=username, cwd=frontend_dir)

    # --- Config Files ---
    
    # .bash_profile
    bash_profile = f"""
if [[ -z $DISPLAY && $(tty) = /dev/tty1 ]]; then
    {venv_dir}/bin/python {repo_dir}/misc/boot.py
fi
"""
    write_file(f"{home_dir}/.bash_profile", bash_profile, user=username)

    # .xinitrc
    xinitrc = """
xset +dpms
xset dpms 0 0 0
xset s off
xset s noblank
unclutter -idle 1 &
exec openbox-session
"""
    write_file(f"{home_dir}/.xinitrc", xinitrc, user=username)

    # Openbox Autostart
    openbox_dir = f"{home_dir}/.config/openbox"
    autostart = "firefox --kiosk --no-remote http://localhost:8000\n"
    write_file(f"{openbox_dir}/autostart", autostart, user=username)

    # --- Systemd Overrides & Services ---
    # Getty Auto-login
    getty_dir = "/etc/systemd/system/getty@tty1.service.d"
    getty_conf = f"""[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin {username} --noclear %I $TERM
"""
    os.makedirs(getty_dir, exist_ok=True)
    write_file(f"{getty_dir}/override.conf", getty_conf)

    # Backend Service
    service_content = f"""[Unit]
Description=EduBoard Backend
After=network.target

[Service]
User={username}
WorkingDirectory={repo_dir}
ExecStart=/bin/bash {repo_dir}/run.sh {venv_dir}
Restart=always
EnvironmentFile={repo_dir}/.env

[Install]
WantedBy=multi-user.target
"""
    write_file("/etc/systemd/system/eduboard.service", service_content)

    # --- Finalize ---
    run_command("sudo systemctl daemon-reload")
    run_command("sudo systemctl enable eduboard.service")
    
    engine.log("Setup finished. Rebooting in 5 seconds...")
    engine.log(f"System will reboot with hostname: {hostname}")
    run_command("sleep 5 && sudo reboot")

if __name__ == "__main__":
    curses.wrapper(main)