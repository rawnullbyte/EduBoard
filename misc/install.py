import subprocess
import os
import shutil
from pathlib import Path
from aengine import AnimationEngine
from logo import text as logo_ascii
import curses
import pwd

def run_command(command, user=None, cwd=None, env=None, log_callback=None):
    custom_env = os.environ.copy()
    custom_env["DEBIAN_FRONTEND"] = "noninteractive"
    custom_env["TERM"] = "xterm-256color" 
    if env:
        custom_env.update(env)

    directory = cwd if cwd else "."
    setup_env = "export TERM=xterm-256color DEBIAN_FRONTEND=noninteractive LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 && "
    
    if user:
        # Escaping for deep shell nesting
        escaped_command = command.replace("'", "'\\''")
        full_command = f"sudo -u {user} -i bash -c '{setup_env} cd {directory} && {escaped_command}'"
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
        pw = pwd.getpwnam(user)
        os.chown(path, pw.pw_uid, pw.pw_gid)
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
    # --- ANIMATIONS RESTORED ---
    engine = AnimationEngine(stdscr)
    engine.set_ascii(logo_ascii)
    engine.animate_ascii_move(duration=3, direction="up")
    engine.sleep(1)
    engine.animate_ascii_move(duration=3, direction="out")
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
        pwd.getpwnam(username)
        engine.log(f"User {username} exists.")
    except KeyError:
        run_command(f"sudo adduser --disabled-password --gecos '' {username}", log_callback=engine.log)
    
    run_command(f"sudo usermod -aG video,audio,input,tty,render {username}", log_callback=engine.log)

    # --- Dependencies & KMSCON ---
    engine.log("Installing Node 22 and Unicode Terminal...")
    run_command("curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -", log_callback=engine.log)
    run_command("sudo apt update", log_callback=engine.log)
    deps = [
        "curl", "git", "build-essential", "python3-full", "python3-venv", "nodejs",
        "xserver-xorg", "xinit", "openbox", "firefox", "kmscon", 
        "fonts-symbola", "fonts-noto-core", "fonts-dejavu-core"
    ]
    run_command(f"sudo apt install -y {' '.join(deps)}", log_callback=engine.log)

    engine.log("Generating Locales...")
    run_command("sudo locale-gen en_US.UTF-8", log_callback=engine.log)
    run_command("sudo update-locale LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8", log_callback=engine.log)

    # --- App Setup ---
    if not os.path.exists(repo_dir):
        run_command(f"git clone https://github.com/rawnullbyte/EduBoard.git {repo_dir}", user=username, log_callback=engine.log)
    
    write_file(f"{repo_dir}/.env", f"SCHOOL_SUBDOMAIN={subdomain}\nSCREEN_ID={screen_id}\nPASSWORD={password}\n", user=username)

    engine.log("Setting up Python Venv...")
    run_command(f"python3 -m venv {venv_dir}", user=username, log_callback=engine.log)
    run_command(f"{venv_dir}/bin/pip install --upgrade pip", user=username, log_callback=engine.log)
    run_command(f"{venv_dir}/bin/pip install -r requirements.txt", user=username, cwd=repo_dir, log_callback=engine.log)

    engine.log("Building Frontend...")
    run_command("npm install && npm run build", user=username, cwd=f"{repo_dir}/frontend", log_callback=engine.log)

    # --- Shell Logic ---
    bash_profile = f"""
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export LANGUAGE=en_US.UTF-8

if [[ $(tty) == /dev/tty1 ]]; then
    exec {venv_dir}/bin/python {repo_dir}/misc/boot.py
fi
"""
    write_file(f"{home_dir}/.bash_profile", bash_profile, user=username)
    write_file(f"{home_dir}/.bashrc", "[[ -f ~/.bash_profile ]] && . ~/.bash_profile\n", user=username)

    # --- KMSCON Service (The "Real Shell" Fix) ---
    kms_override = f"""[Service]
ExecStart=
ExecStart=-/usr/bin/kmscon --login --vt vt1 --allow-keyboard --font-name "Monospace" --font-size 14 --autologin {username} -- /bin/bash --login
Environment=LANG=en_US.UTF-8
Environment=LC_ALL=en_US.UTF-8
"""
    os.makedirs("/etc/systemd/system/getty@tty1.service.d", exist_ok=True)
    write_file("/etc/systemd/system/getty@tty1.service.d/override.conf", kms_override)

    # Ensure we don't boot into a GUI login screen
    engine.log("Disabling graphical login manager...")
    run_command("sudo systemctl set-default multi-user.target", log_callback=engine.log)

    engine.log("Finalizing...")
    run_command("sudo systemctl daemon-reload", log_callback=engine.log)
    run_command("sleep 3 && sudo reboot", log_callback=engine.log)

if __name__ == "__main__":
    curses.wrapper(main)