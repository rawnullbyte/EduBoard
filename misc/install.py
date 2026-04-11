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
    
    setup_env = "export DEBIAN_FRONTEND=noninteractive LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8"
    directory = cwd if cwd else "."
    
    if user:
        escaped_command = command.replace("'", "'\\''")
        full_command = f"sudo -u {user} -i bash -c '{setup_env} && cd {directory} && {escaped_command}'"
    else:
        full_command = f"bash -c '{setup_env} && {command}'"

    if log_callback:
        log_callback(f"Running: {command}")

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

def set_hostname(hostname):
    run_command(f"sudo hostnamectl set-hostname {hostname}")
    write_file("/etc/hostname", f"{hostname}\n")
    with open("/etc/hosts", "r") as f:
        lines = f.readlines()
    
    new_lines = [line if '127.0.1.1' not in line else f"127.0.1.1\t{hostname}\n" for line in lines]
    if not any('127.0.1.1' in line for line in new_lines):
        new_lines.insert(1, f"127.0.1.1\t{hostname}\n")
    
    write_file("/etc/hosts", "".join(new_lines))

def main(stdscr):
    engine = AnimationEngine(stdscr)
    engine.set_ascii(logo_ascii)
    engine.log("--- EduBoard KMS Installation ---")
    
    hostname = engine.ask("Hostname: ", "tv1") or "tv1"
    username = engine.ask("User: ", "kiosk") or "kiosk"
    subdomain = engine.ask("Subdomain: ", "school") or "school"
    screen_id = engine.ask("Screen ID: ", "1") or "1"
    password = engine.ask("Password: ", "123456") or "123456"

    home_dir = f"/home/{username}"
    repo_dir = f"{home_dir}/EduBoard"
    venv_dir = f"{home_dir}/venv"

    set_hostname(hostname)

    try:
        pwd.getpwnam(username)
    except KeyError:
        run_command(f"sudo adduser --disabled-password --gecos '' {username}")
    
    run_command(f"sudo usermod -aG video,audio,input,tty,render {username}")

    engine.log("Installing Dependencies & KMS Terminal...")
    run_command("curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -")
    run_command("sudo apt update")
    
    deps = [
        "curl", "git", "python3-full", "python3-venv", "nodejs",
        "kmscon", "fonts-symbola", "fonts-noto-core", "xserver-xorg", "xinit"
    ]
    run_command(f"sudo apt install -y {' '.join(deps)}")

    run_command("sudo locale-gen en_US.UTF-8")
    run_command("sudo update-locale LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8")

    if not os.path.exists(repo_dir):
        run_command(f"git clone https://github.com/rawnullbyte/EduBoard.git {repo_dir}", user=username)
    
    write_file(f"{repo_dir}/.env", f"SCHOOL_SUBDOMAIN={subdomain}\nSCREEN_ID={screen_id}\nPASSWORD={password}\n", user=username)

    run_command(f"python3 -m venv {venv_dir}", user=username)
    run_command(f"{venv_dir}/bin/pip install --upgrade pip", user=username)
    run_command(f"{venv_dir}/bin/pip install -r requirements.txt", user=username, cwd=repo_dir)

    run_command("npm install && npm run build", user=username, cwd=f"{repo_dir}/frontend")

    bash_profile = f"""
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
if [[ $(tty) == /dev/tty1 ]]; then
    {venv_dir}/bin/python {repo_dir}/misc/boot.py
fi
"""
    write_file(f"{home_dir}/.bash_profile", bash_profile, user=username)

    kms_override = f"""[Service]
ExecStart=
ExecStart=-/usr/bin/kmscon --login --vt vt1 --allow-keyboard --font-name "Monospace" --font-size 14 --autologin {username}
Environment=LANG=en_US.UTF-8
Environment=LC_ALL=en_US.UTF-8
"""
    os.makedirs("/etc/systemd/system/getty@tty1.service.d", exist_ok=True)
    write_file("/etc/systemd/system/getty@tty1.service.d/override.conf", kms_override)

    engine.log("Finalizing...")
    run_command("sudo systemctl daemon-reload")
    run_command("sleep 3 && sudo reboot")

if __name__ == "__main__":
    curses.wrapper(main)