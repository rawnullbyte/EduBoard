import argparse
import curses
import os
import pwd
import shlex
import subprocess
from datetime import datetime
from pathlib import Path

from aengine import AnimationEngine
from logo import text as logo_ascii


INSTALL_ARGS = None


def append_install_log(message):
    if INSTALL_ARGS is None:
        return

    log_path = Path(INSTALL_ARGS.log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(f"[{datetime.now().isoformat(timespec='seconds')}] {message}\n")


def emit_log(message, callback=None):
    append_install_log(message)
    if callback:
        callback(message)


def run_command(command, user=None, cwd=None, log_callback=None):
    custom_env = os.environ.copy()
    custom_env.update(
        {
            "DEBIAN_FRONTEND": "noninteractive",
            "TERM": "xterm-256color",
            "LANG": "en_US.UTF-8",
            "LC_ALL": "en_US.UTF-8",
        }
    )

    if user:
        parts = []
        if cwd:
            parts.append(f"cd {shlex.quote(str(cwd))}")
        parts.append(command)
        shell_command = " && ".join(parts)
        full_command = (
            f"sudo -H -u {shlex.quote(user)} bash -lc {shlex.quote(shell_command)}"
        )
    elif cwd:
        full_command = f"cd {shlex.quote(str(cwd))} && {command}"
    else:
        full_command = command

    append_install_log(f"RUN {full_command}")

    if INSTALL_ARGS and INSTALL_ARGS.dry_run:
        emit_log(f"↷ [dry-run] {command}", log_callback)
        return subprocess.CompletedProcess(full_command, 0, "", "")

    process = subprocess.run(
        full_command,
        shell=True,
        executable="/bin/bash",
        env=custom_env,
        capture_output=True,
        text=True,
    )

    if process.returncode != 0:
        error_msg = process.stderr.strip() if process.stderr else "Unknown error"
        append_install_log(f"FAIL {full_command}: {error_msg}")
        if log_callback:
            log_callback(f"✗ Command failed: {error_msg}")
        raise subprocess.CalledProcessError(
            process.returncode,
            full_command,
            output=process.stdout,
            stderr=process.stderr,
        )

    if log_callback and process.stdout:
        output = process.stdout.strip()
        if output and len(output) < 200:
            log_callback(f"  {output}")

    if process.stdout.strip():
        append_install_log(f"STDOUT {process.stdout.strip()}")

    return process


def write_file(path, content, user=None, mode=0o644):
    path = Path(path)
    append_install_log(f"WRITE {path}")

    if INSTALL_ARGS and INSTALL_ARGS.dry_run:
        return

    run_command(f"sudo mkdir -p {shlex.quote(str(path.parent))}")
    temp_path = f"/tmp/{path.name}.tmp"

    with open(temp_path, "w", encoding="utf-8") as handle:
        handle.write(content)

    run_command(f"sudo mv {shlex.quote(temp_path)} {shlex.quote(str(path))}")

    if user:
        run_command(f"sudo chown {shlex.quote(user)}:{shlex.quote(user)} {shlex.quote(str(path))}")

    run_command(f"sudo chmod {mode:o} {shlex.quote(str(path))}")


def set_hostname(hostname, log_callback=None):
    try:
        if log_callback:
            emit_log(f"→ Setting hostname to '{hostname}'", log_callback)

        run_command(f"sudo hostnamectl set-hostname {shlex.quote(hostname)}")
        write_file("/etc/hostname", f"{hostname}\n")
        run_command(
            f"sudo sed -i 's/127.0.1.1.*/127.0.1.1\t{hostname}/g' /etc/hosts"
        )

        if log_callback:
            emit_log("✓ Hostname set successfully", log_callback)
        return True
    except Exception as exc:
        if log_callback:
            emit_log(f"✗ Failed to set hostname: {exc}", log_callback)
        return False


def main(stdscr):
    engine = AnimationEngine(stdscr)
    engine.set_ascii(logo_ascii)
    engine.animate_ascii_move(duration=3, direction="up")
    engine.sleep(1)
    engine.animate_ascii_move(duration=3, direction="out")

    emit_log("╔══════════════════════════════════════╗", engine.log)
    emit_log("║       EduBoard Setup Wizard          ║", engine.log)
    emit_log("╚══════════════════════════════════════╝", engine.log)
    emit_log("", engine.log)

    hostname = engine.ask("System Hostname", "tv1") or "tv1"
    username = engine.ask("Kiosk Username", "kiosk") or "kiosk"
    subdomain = engine.ask("School Subdomain", "school") or "school"
    screen_id = engine.ask("Screen Identifier", "1") or "1"
    password = engine.ask("Kiosk Password", "123456") or "123456"

    emit_log("Configuration Summary:", engine.log)
    emit_log(f"  • Hostname:   {hostname}", engine.log)
    emit_log(f"  • User:       {username}", engine.log)
    emit_log(f"  • Subdomain:  {subdomain}", engine.log)
    emit_log(f"  • Screen ID:  {screen_id}", engine.log)
    emit_log("", engine.log)

    if Path("/etc/systemd/system/eduboard.service").exists():
        emit_log("ℹ Existing EduBoard installation detected; installer will update it in place.", engine.log)

    home_dir = f"/home/{username}"
    repo_dir = f"{home_dir}/EduBoard"
    frontend_dir = f"{repo_dir}/frontend"
    venv_dir = f"{home_dir}/venv"

    emit_log("→ Setting up user account...", engine.log)
    set_hostname(hostname, engine.log)

    try:
        pwd.getpwnam(username)
        emit_log(f"  User '{username}' already exists", engine.log)
    except KeyError:
        run_command(
            f"sudo adduser --disabled-password --gecos '' {shlex.quote(username)}",
            log_callback=engine.log,
        )
        run_command(f"echo '{username}:{password}' | sudo chpasswd")
        emit_log(f"✓ Created user '{username}'", engine.log)

    run_command(
        f"sudo usermod -aG video,audio,input,tty,render,sudo {shlex.quote(username)}",
        log_callback=engine.log,
    )
    emit_log("✓ Added user to required groups", engine.log)

    emit_log("", engine.log)
    emit_log("→ Installing system dependencies...", engine.log)
    run_command(
        "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -",
        log_callback=engine.log,
    )
    run_command("sudo apt update", log_callback=engine.log)

    packages = [
        "curl",
        "git",
        "python3-full",
        "python3-venv",
        "nodejs",
        "fonts-symbola",
        "fonts-noto-core",
        "fonts-dejavu",
        "fonts-wqy-microhei",
        "kmscon",
        "xorg",
        "openbox",
        "xinit",
        "x11-xserver-utils",
        "unclutter",
        "firefox",
    ]

    emit_log("  Installing dependencies... (This may take a while!)", engine.log)
    run_command(f"sudo apt install -y {' '.join(packages)}", log_callback=engine.log)
    emit_log("✓ Dependencies installed", engine.log)

    emit_log("", engine.log)
    emit_log("→ Disabling screensaver (DPMS remains enabled)...", engine.log)
    xorg_conf_content = """Section "ServerFlags"
    Option "BlankTime" "0"
    Option "StandbyTime" "0"
    Option "SuspendTime" "0"
    Option "OffTime" "0"
EndSection
"""
    write_file("/etc/X11/xorg.conf.d/10-disable-blanking.conf", xorg_conf_content)
    run_command(
        "sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target"
    )
    emit_log("✓ Screensaver disabled, DPMS remains active", engine.log)

    emit_log("", engine.log)
    emit_log("→ Setting up EduBoard application...", engine.log)

    if not os.path.exists(repo_dir):
        emit_log("  Cloning repository...", engine.log)
        run_command(
            f"git clone https://github.com/rawnullbyte/EduBoard.git {shlex.quote(repo_dir)}",
            user=username,
            log_callback=engine.log,
        )
        emit_log("✓ Repository cloned", engine.log)
    else:
        emit_log("  Repository already exists, skipping clone", engine.log)

    env_content = f"""SCHOOL_SUBDOMAIN={subdomain}
SCREEN_ID={screen_id}
    PASSWORD={password}
DISPLAY=:0
"""
    write_file(f"{repo_dir}/.env", env_content, user=username)
    emit_log("✓ Environment configuration written", engine.log)

    emit_log("  Creating Python virtual environment...", engine.log)
    run_command(f"python3 -m venv {shlex.quote(venv_dir)}", user=username, log_callback=engine.log)

    emit_log("  Installing Python dependencies...", engine.log)
    run_command(
        f"{venv_dir}/bin/python -m pip install --upgrade pip",
        user=username,
        cwd=repo_dir,
        log_callback=engine.log,
    )
    run_command(
        f"{venv_dir}/bin/python -m pip install -r requirements.txt",
        user=username,
        cwd=repo_dir,
        log_callback=engine.log,
    )

    emit_log("  Installing frontend dependencies...", engine.log)
    if os.path.exists(f"{frontend_dir}/package-lock.json"):
        run_command("npm ci", user=username, cwd=frontend_dir, log_callback=engine.log)
    else:
        run_command("npm install", user=username, cwd=frontend_dir, log_callback=engine.log)

    emit_log("  Building frontend...", engine.log)
    run_command("npm run build", user=username, cwd=frontend_dir, log_callback=engine.log)
    emit_log("✓ Application dependencies installed", engine.log)

    emit_log("", engine.log)
    emit_log("→ Configuring X11 permissions...", engine.log)
    xwrapper_content = """allowed_users=anybody
needs_root_rights=yes
"""
    write_file("/etc/X11/Xwrapper.config", xwrapper_content)
    emit_log("✓ X11 configuration written", engine.log)

    emit_log("→ Configuring auto-login...", engine.log)
    xinitrc_content = """#!/bin/bash
xset s off
exec openbox-session
"""
    write_file(f"{home_dir}/.xinitrc", xinitrc_content, user=username, mode=0o755)

    emit_log("", engine.log)
    emit_log("→ Configuring minimal OpenBox...", engine.log)
    openbox_autostart_content = """#!/bin/bash
xset s off
mkdir -p "$HOME/.local/state/eduboard"
exec >>"$HOME/.local/state/eduboard/openbox-autostart.log" 2>&1

unclutter -idle 1 -root &

timeout=60
until curl -fsS http://127.0.0.1:8000/health >/dev/null; do
    timeout=$((timeout - 1))
    if [ "$timeout" -le 0 ]; then
        echo "EduBoard backend did not become healthy within 60 seconds."
        exit 1
    fi
    sleep 1
done

firefox --kiosk http://127.0.0.1:8000 &
"""
    openbox_dir = f"{home_dir}/.config/openbox"
    run_command(f"sudo -u {shlex.quote(username)} mkdir -p {shlex.quote(openbox_dir)}")
    write_file(
        f"{openbox_dir}/autostart",
        openbox_autostart_content,
        user=username,
        mode=0o755,
    )
    emit_log("✓ OpenBox configured", engine.log)

    emit_log("", engine.log)
    emit_log("→ Configuring KMSCON terminal...", engine.log)
    kmscon_conf_content = """font-name=DejaVu Sans Mono, WenQuanYi Micro Hei Mono
font-size=14
term=xterm-256color
hwaccel
"""
    write_file("/etc/kmscon/kmscon.conf", kmscon_conf_content)
    emit_log("✓ KMSCON configuration written", engine.log)

    override_dir = "/etc/systemd/system/kmsconvt@tty1.service.d"
    override_content = f"""[Service]
ExecStart=
ExecStart=/usr/libexec/kmscon/kmscon --vt tty1 --seats seat0 --configdir /etc/kmscon --term xterm-256color --login -- /bin/su -l {username} -c "exec /usr/bin/python3 {repo_dir}/misc/boot.py"
"""
    write_file(f"{override_dir}/override.conf", override_content)
    emit_log(f"✓ Auto-login configured for user '{username}'", engine.log)

    emit_log("", engine.log)
    emit_log("→ Creating EduBoard backend service...", engine.log)
    eduboard_service_content = f"""[Unit]
Description=EduBoard backend service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User={username}
WorkingDirectory={repo_dir}
EnvironmentFile={repo_dir}/.env
Environment=DISPLAY=:0
Environment=XAUTHORITY={home_dir}/.Xauthority
ExecStart={venv_dir}/bin/python {repo_dir}/main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"""
    write_file("/etc/systemd/system/eduboard.service", eduboard_service_content)
    emit_log("✓ Backend service created", engine.log)

    emit_log("  Disabling conflicting terminal services...", engine.log)
    run_command("sudo systemctl mask getty@tty1.service")
    run_command("sudo systemctl mask serial-getty@ttyS0.service")
    run_command("sudo systemctl mask serial-getty@hvc0.service")

    emit_log("", engine.log)
    emit_log("→ Finalizing installation...", engine.log)
    run_command("sudo systemctl daemon-reload")
    run_command("sudo systemctl enable --now eduboard.service", log_callback=engine.log)
    run_command("sudo systemctl enable kmsconvt@tty1.service", log_callback=engine.log)
    emit_log("✓ Services enabled", engine.log)

    emit_log("", engine.log)
    emit_log("╔══════════════════════════════════════╗", engine.log)
    emit_log("║       Installation Complete!         ║", engine.log)
    emit_log("╚══════════════════════════════════════╝", engine.log)
    emit_log("", engine.log)

    if INSTALL_ARGS and (INSTALL_ARGS.skip_reboot or INSTALL_ARGS.dry_run):
        emit_log("Skipping automatic reboot.", engine.log)
    else:
        emit_log("System will reboot in 3 seconds...", engine.log)
        run_command("sleep 3 && sudo reboot")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EduBoard kiosk installer")
    parser.add_argument("--dry-run", action="store_true", help="Log intended changes without executing them.")
    parser.add_argument("--skip-reboot", action="store_true", help="Do not reboot at the end of the installation.")
    parser.add_argument(
        "--log-file",
        default="/var/log/eduboard-install.log",
        help="Path to the persistent installation log file.",
    )
    INSTALL_ARGS = parser.parse_args()
    append_install_log("=== EduBoard installer started ===")
    curses.wrapper(main)
