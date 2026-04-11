import subprocess
import os
import shutil
from pathlib import Path
from aengine import AnimationEngine
from logo import text as logo_ascii
import curses

def run_command(command, user=None, cwd=None, env=None, log_callback=None):
    # Setup the Python-side environment variables
    custom_env = os.environ.copy()
    custom_env["DEBIAN_FRONTEND"] = "noninteractive"
    custom_env["TERM"] = "xterm-256color" 
    if env:
        custom_env.update(env)

    directory = cwd if cwd else "."

    # Build the shell command
    # We inject the exports here so that even when switching users via sudo, the environment persists.
    setup_env = "export TERM=xterm-256color DEBIAN_FRONTEND=noninteractive && "
    
    if user:
        full_command = f"sudo -u {user} -i bash -c '{setup_env} cd {directory} && {command}'"
    else:
        full_command = f"bash -c '{setup_env} {command}'"

    if log_callback:
        log_callback(f"Executing: {command}...")

    process = subprocess.run(
        full_command,
        shell=True,
        executable="/bin/bash",
        env=custom_env,
        capture_output=True,
        text=True
    )

    if process.returncode != 0:
        if log_callback:
            log_callback(f"ERROR: {process.stderr}")
        raise subprocess.CalledProcessError(
            process.returncode, 
            full_command, 
            output=process.stdout, 
            stderr=process.stderr
        )
    
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
    hostname = engine.ask("Hostname: ", placeholder="tv1") or "tv1"
    username = engine.ask("Kiosk Username: ", placeholder="kiosk") or "kiosk"
    subdomain = engine.ask("Subdomain: ", placeholder="schoolname") or "schoolname"
    screen_id = engine.ask("Screen ID: ", placeholder="9") or "1"
    password = engine.ask("Password: ", placeholder="123456") or "123456"

    home_dir = f"/home/{username}"
    repo_dir = f"{home_dir}/EduBoard"
    venv_dir = f"{home_dir}/venv"

    # --- Set Hostname ---
    engine.log(f"Setting hostname to: {hostname}")
    set_hostname(hostname, engine.log)

    # --- User Setup ---
    try:
        subprocess.run(["id", username], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        engine.log(f"Creating user {username}...")
        run_command(f"sudo adduser --disabled-password --gecos '' {username}")
    
    run_command(f"sudo usermod -aG video,audio,input,tty,render {username}")

    # --- Node.js 22 Upgrade ---
    engine.log("Configuring NodeSource for Node.js 22 (LTS)...")
    run_command("curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -")

    # --- Dependencies ---
    engine.log("Updating system and installing dependencies...")
    run_command("sudo apt update")
    deps = [
        "curl", "git", "build-essential", "python3-full", "python3-venv", "nodejs",
        "xserver-xorg", "x11-xserver-utils", "xinit", "openbox", "firefox", 
        "unclutter", "dbus-x11", "fonts-freefont-ttf", "fonts-noto-core"
    ]
    run_command(f"sudo apt install -y {' '.join(deps)}")

    # --- App Setup ---
    if not os.path.exists(repo_dir):
        engine.log("Cloning EduBoard repository...")
        run_command(f"git clone https://github.com/rawnullbyte/EduBoard.git {repo_dir}", user=username)
    else:
        engine.log("Updating EduBoard repository...")
        run_command("git pull", user=username, cwd=repo_dir)

    # Create .env
    engine.log("Writing configuration to .env...")
    env_content = f"SCHOOL_SUBDOMAIN={subdomain}\nSCREEN_ID={screen_id}\nPASSWORD={password}\n"
    write_file(f"{repo_dir}/.env", env_content, user=username)

    # Python Venv & Requirements
    engine.log("Setting up Python virtual environment...")
    run_command(f"python3 -m venv {venv_dir}", user=username)
    run_command(f"{venv_dir}/bin/pip install --upgrade pip", user=username)
    if os.path.exists(f"{repo_dir}/requirements.txt"):
        engine.log("Installing Python requirements...")
        run_command(f"{venv_dir}/bin/pip install -r requirements.txt", user=username, cwd=repo_dir)

    # Frontend Build
    frontend_dir = f"{repo_dir}/frontend"
    if os.path.exists(frontend_dir):
        engine.log("Installing NPM dependencies...")
        run_command("npm install", user=username, cwd=frontend_dir)
        
        engine.log("Building frontend production assets...")
        run_command("npm run build", user=username, cwd=frontend_dir)

    # --- Config Files ---
    engine.log("Configuring boot environment...")
    
    bash_profile = f"""
export TERM=xterm-256color
if [[ -z $DISPLAY && $(tty) = /dev/tty1 ]]; then
    {venv_dir}/bin/python {repo_dir}/misc/boot.py
fi
"""
    write_file(f"{home_dir}/.bash_profile", bash_profile, user=username)

    xinitrc = "xset +dpms\nxset dpms 0 0 0\nxset s off\nxset s noblank\nunclutter -idle 1 &\nexec openbox-session\n"
    write_file(f"{home_dir}/.xinitrc", xinitrc, user=username)

    openbox_dir = f"{home_dir}/.config/openbox"
    autostart = "firefox --kiosk --no-remote http://localhost:8000\n"
    write_file(f"{openbox_dir}/autostart", autostart, user=username)

    # --- Systemd Overrides & Services ---
    engine.log("Setting up system services...")
    getty_dir = "/etc/systemd/system/getty@tty1.service.d"
    getty_conf = f"""[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin {username} --noclear %I xterm-256color
"""
    os.makedirs(getty_dir, exist_ok=True)
    write_file(f"{getty_dir}/override.conf", getty_conf)

    service_content = f"""[Unit]
Description=EduBoard Backend
After=network.target

[Service]
User={username}
WorkingDirectory={repo_dir}
ExecStart=/bin/bash {repo_dir}/run.sh {venv_dir}
Restart=always
Environment=TERM=xterm-256color
EnvironmentFile={repo_dir}/.env

[Install]
WantedBy=multi-user.target
"""
    write_file("/etc/systemd/system/eduboard.service", service_content)

    # --- Finalize ---
    engine.log("Enabling services and finalizing...")
    run_command("sudo systemctl daemon-reload")
    run_command("sudo systemctl enable eduboard.service")
    
    engine.log("Setup finished. Rebooting in 5 seconds...")
    run_command("sleep 5 && sudo reboot")

if __name__ == "__main__":
    curses.wrapper(main)