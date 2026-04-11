import subprocess
import os
import shutil
from pathlib import Path
import curses
import pwd
from aengine import AnimationEngine
from logo import text as logo_ascii

def run_command(command, user=None, cwd=None, env=None, log_callback=None):
    custom_env = os.environ.copy()
    custom_env["DEBIAN_FRONTEND"] = "noninteractive"
    
    # Environment variables to force UTF-8 during the setup process
    setup_env = "export DEBIAN_FRONTEND=noninteractive LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8"
    directory = cwd if cwd else "."
    
    if user:
        # Escaping internal single quotes to prevent the shell from breaking
        escaped_command = command.replace("'", "'\\''")
        full_command = f"sudo -u {user} -i bash -c '{setup_env} && cd {directory} && {escaped_command}'"
    else:
        # Standard root-level execution
        full_command = f"bash -c '{setup_env} && {command}'"

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
    # --- Animation Engine Sequence ---
    engine = AnimationEngine(stdscr)
    engine.set_ascii(logo_ascii)
    engine.animate_ascii_move(duration=3, direction="up")
    engine.sleep(1)
    engine.animate_ascii_move(duration=3, direction="out")
    engine.log("=== EduBoard KMS Unicode Setup ===")
    
    # --- Input Configuration ---
    hostname = engine.ask("Hostname: ", "tv1") or "tv1"
    username = engine.ask("User: ", "kiosk") or "kiosk"
    subdomain = engine.ask("Subdomain: ", "school") or "school"
    screen_id = engine.ask("Screen ID: ", "1") or "1"
    password = engine.ask("Password: ", "123456") or "123456"

    home_dir = f"/home/{username}"
    repo_dir = f"{home_dir}/EduBoard"
    venv_dir = f"{home_dir}/venv"

    # --- Initial System Setup ---
    set_hostname(hostname, engine.log)
    
    # Robust user check to avoid exit status 51
    try:
        pwd.getpwnam(username)
        engine.log(f"User '{username}' already exists. Skipping adduser.")
    except KeyError:
        # Using double-quotes for GECOS to survive bash-sudo-bash nesting
        run_command(f'sudo adduser --disabled-password --gecos "" {username}', log_callback=engine.log)
    
    run_command(f"sudo usermod -aG video,audio,input,tty,render {username}", log_callback=engine.log)

    # --- Dependencies & KMSCON ---
    engine.log("Installing Node 22, KMSCON & Unicode Fonts...")
    run_command("curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -", log_callback=engine.log)
    run_command("sudo apt update", log_callback=engine.log)
    
    # fonts-symbola handles the Braille patterns that standard fonts miss
    deps = [
        "curl", "git", "build-essential", "python3-full", "python3-venv", "nodejs",
        "kmscon", "fonts-symbola", "fonts-noto-core", "fonts-dejavu-core",
        "xserver-xorg", "xinit"
    ]
    run_command(f"sudo apt install -y {' '.join(deps)}", log_callback=engine.log)

    engine.log("Generating Locales...")
    run_command("sudo locale-gen en_US.UTF-8", log_callback=engine.log)
    run_command("sudo update-locale LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8", log_callback=engine.log)

    # --- Project Setup ---
    if not os.path.exists(repo_dir):
        run_command(f"git clone https://github.com/rawnullbyte/EduBoard.git {repo_dir}", user=username, log_callback=engine.log)
    
    write_file(f"{repo_dir}/.env", f"SCHOOL_SUBDOMAIN={subdomain}\nSCREEN_ID={screen_id}\nPASSWORD={password}\n", user=username)

    engine.log("Configuring Python Environment...")
    run_command(f"python3 -m venv {venv_dir}", user=username, log_callback=engine.log)
    run_command(f"{venv_dir}/bin/pip install --upgrade pip", user=username, log_callback=engine.log)
    run_command(f"{venv_dir}/bin/pip install -r requirements.txt", user=username, cwd=repo_dir, log_callback=engine.log)

    engine.log("Building Frontend Assets...")
    run_command("npm install && npm run build", user=username, cwd=f"{repo_dir}/frontend", log_callback=engine.log)

    # --- Shell Profile Hook ---
    # kmscon autologs in, launches bash, bash reads this file, and starts your script.
    bash_profile = f"""
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export LANGUAGE=en_US.UTF-8

if [[ $(tty) == /dev/tty1 ]]; then
    {venv_dir}/bin/python {repo_dir}/misc/boot.py
fi
"""
    write_file(f"{home_dir}/.bash_profile", bash_profile, user=username)

    # --- KMSCON Integration ---
    # This overrides the default tty1 getty to use a GPU-accelerated terminal
    kms_override = f"""[Service]
ExecStart=
ExecStart=-/usr/bin/kmscon --login --vt vt1 --allow-keyboard --font-name "Monospace" --font-size 14 --autologin {username}
Environment=LANG=en_US.UTF-8
Environment=LC_ALL=en_US.UTF-8
"""
    os.makedirs("/etc/systemd/system/getty@tty1.service.d", exist_ok=True)
    write_file("/etc/systemd/system/getty@tty1.service.d/override.conf", kms_override)

    engine.log("Finalizing Installation...")
    run_command("sudo systemctl daemon-reload", log_callback=engine.log)
    run_command("sleep 3 && sudo reboot", log_callback=engine.log)

if __name__ == "__main__":
    curses.wrapper(main)