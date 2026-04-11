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
    
    directory = cwd if cwd else "."
    setup_env = "export TERM=xterm-256color DEBIAN_FRONTEND=noninteractive LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 && "
    
    if user:
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
    run_command(f"sudo mkdir -p {path.parent}")
    temp_path = f"/tmp/{path.name}.tmp"
    with open(temp_path, "w") as f:
        f.write(content)
    run_command(f"sudo mv {temp_path} {path}")
    if user:
        run_command(f"sudo chown {user}:{user} {path}")
    run_command(f"sudo chmod {mode:o} {path}")

def set_hostname(hostname, log_callback=None):
    try:
        run_command(f"sudo hostnamectl set-hostname {hostname}")
        write_file("/etc/hostname", f"{hostname}\n")
        run_command(f"sudo sed -i 's/127.0.1.1.*/127.0.1.1\t{hostname}/g' /etc/hosts")
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

    home_dir = f"/home/{username}"
    repo_dir = f"{home_dir}/EduBoard"
    venv_dir = f"{home_dir}/venv"

    # --- User Setup ---
    set_hostname(hostname, engine.log)
    try:
        pwd.getpwnam(username)
    except KeyError:
        run_command(f"sudo adduser --disabled-password --gecos '' {username}", log_callback=engine.log)
        run_command(f"echo '{username}:{password}' | sudo chpasswd")
    
    run_command(f"sudo usermod -aG video,audio,input,tty,render,sudo {username}", log_callback=engine.log)

    # --- Dependencies ---
    engine.log("Installing Dependencies...")
    run_command("curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -", log_callback=engine.log)
    run_command("sudo apt update", log_callback=engine.log)
    deps = ["curl", "git", "python3-full", "python3-venv", "nodejs", "kmscon", "fonts-symbola", "fonts-noto-core"]
    run_command(f"sudo apt install -y {' '.join(deps)}", log_callback=engine.log)

    # --- App Setup ---
    if not os.path.exists(repo_dir):
        run_command(f"sudo -u {username} git clone https://github.com/rawnullbyte/EduBoard.git {repo_dir}", log_callback=engine.log)
    
    write_file(f"{repo_dir}/.env", f"SCHOOL_SUBDOMAIN={subdomain}\nSCREEN_ID={screen_id}\nPASSWORD={password}\n", user=username)
    run_command(f"python3 -m venv {venv_dir}", user=username, log_callback=engine.log)
    run_command(f"{venv_dir}/bin/pip install -r requirements.txt", user=username, cwd=repo_dir, log_callback=engine.log)
    run_command("npm install && npm run build", user=username, cwd=f"{repo_dir}/frontend", log_callback=engine.log)

    # --- BASH PROFILE (Triggers Script) ---
    shell_content = f"""
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
# Catch physical TTY or VM pts/0
if [[ $(tty) == "/dev/tty1" || $(tty) == "/dev/pts/0" ]]; then
    exec {venv_dir}/bin/python {repo_dir}/misc/boot.py
fi
"""
    write_file(f"{home_dir}/.bash_profile", shell_content, user=username)
    write_file(f"{home_dir}/.bashrc", "[[ -f ~/.bash_profile ]] && . ~/.bash_profile\n", user=username)

    # --- KMSCON + AUTOLOGIN OVERRIDE ---
    # We use 'StandardOutput=tty' to ensure it takes over the physical screen
    kms_config = f"""[Service]
ExecStart=
ExecStart=-/usr/bin/kmscon --login --vt vt1 --allow-keyboard --font-size 14 --autologin {username} -- /bin/bash --login
StandardInput=tty
StandardOutput=tty
Environment=LANG=en_US.UTF-8
Environment=LC_ALL=en_US.UTF-8
"""
    # Override for standard TTY1
    os.makedirs("/etc/systemd/system/getty@tty1.service.d", exist_ok=True)
    write_file("/etc/systemd/system/getty@tty1.service.d/override.conf", kms_config)
    
    # Override for serial/VM console
    os.makedirs("/etc/systemd/system/serial-getty@ttyS0.service.d", exist_ok=True)
    write_file("/etc/systemd/system/serial-getty@ttyS0.service.d/override.conf", kms_config)

    engine.log("Setting boot target and finalizing...")
    run_command("sudo systemctl set-default multi-user.target", log_callback=engine.log)
    run_command("sudo systemctl daemon-reload")
    run_command("sleep 3 && sudo reboot")

if __name__ == "__main__":
    curses.wrapper(main)