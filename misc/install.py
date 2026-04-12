import subprocess
import os
from pathlib import Path
from aengine import AnimationEngine
from logo import text as logo_ascii
import curses
import pwd


def run_command(command, user=None, cwd=None, log_callback=None):
    custom_env = os.environ.copy()
    custom_env.update({
        "DEBIAN_FRONTEND": "noninteractive",
        "TERM": "xterm-256color",
        "LANG": "en_US.UTF-8",
        "LC_ALL": "en_US.UTF-8",
        "WAYLAND_DISPLAY": "wayland-0"
    })
    directory = cwd if cwd else "."
    
    if user:
        escaped_command = command.replace("'", "'\\''")
        full_command = f"sudo -u {user} -i cd {directory} && {escaped_command}"
    else:
        full_command = command

    process = subprocess.run(
        full_command, shell=True, executable="/bin/bash",
        env=custom_env, capture_output=True, text=True
    )
    
    if process.returncode != 0:
        error_msg = process.stderr.strip() if process.stderr else "Unknown error"
        if log_callback:
            log_callback(f"✗ Command failed: {error_msg}")
        raise subprocess.CalledProcessError(
            process.returncode, full_command,
            output=process.stdout, stderr=process.stderr
        )
    
    if log_callback and process.stdout:
        output = process.stdout.strip()
        if output and len(output) < 200:
            log_callback(f" {output}")
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
        if log_callback:
            log_callback(f"→ Setting hostname to '{hostname}'")
        run_command(f"sudo hostnamectl set-hostname {hostname}")
        write_file("/etc/hostname", f"{hostname}\n")
        run_command(f"sudo sed -i 's/127.0.1.1.*/127.0.1.1\t{hostname}/g' /etc/hosts")
        if log_callback:
            log_callback(f"✓ Hostname set successfully")
        return True
    except Exception as e:
        if log_callback:
            log_callback(f"✗ Failed to set hostname: {str(e)}")
        return False


def install_tailscale(auth_token, log_callback=None):
    """Install and authenticate Tailscale if an auth token is supplied"""
    if not auth_token or auth_token.strip() == "":
        if log_callback:
            log_callback("→ No Tailscale auth token provided. Skipping Tailscale installation.")
        return False

    try:
        log_callback("→ Installing Tailscale...")
        # Install Tailscale using official script
        run_command("curl -fsSL https://tailscale.com/install.sh | sh", log_callback=log_callback)
        
        # Enable and start the daemon
        run_command("sudo systemctl enable --now tailscaled", log_callback=log_callback)
        
        # Authenticate
        log_callback("→ Authenticating Tailscale with provided auth key...")
        run_command(
            f"sudo tailscale up --authkey={auth_token.strip()} "
            f"--accept-routes --accept-dns=false --advertise-exit-node=false",
            log_callback=log_callback
        )
        
        log_callback("✓ Tailscale installed and authenticated successfully!")
        return True
    except Exception as e:
        if log_callback:
            log_callback(f"✗ Tailscale setup failed: {str(e)}")
        return False


def main(stdscr):
    # --- Animation Sequence ---
    engine = AnimationEngine(stdscr)
    engine.set_ascii(logo_ascii)
    engine.animate_ascii_move(duration=3, direction="up")
    engine.sleep(1)
    engine.animate_ascii_move(duration=3, direction="out")

    engine.log("╔══════════════════════════════════════╗")
    engine.log("║         EduBoard Setup Wizard        ║")
    engine.log("╚══════════════════════════════════════╝")
    engine.log("")

    # --- Configuration ---
    hostname = engine.ask("System Hostname", "tv1") or "tv1"
    username = engine.ask("Kiosk Username", "kiosk") or "kiosk"
    subdomain = engine.ask("School Subdomain", "school") or "school"
    screen_id = engine.ask("Screen Identifier", "1") or "1"
    password = engine.ask("Kiosk Password", "123456") or "123456"
    
    # Tailscale option
    tailscale_token = engine.ask(
        "Tailscale Auth Token (optional)", 
        ""
    ) or ""

    engine.log("Configuration Summary:")
    engine.log(f" • Hostname: {hostname}")
    engine.log(f" • User: {username}")
    engine.log(f" • Subdomain: {subdomain}")
    engine.log(f" • Screen ID: {screen_id}")
    if tailscale_token.strip():
        engine.log(f" • Tailscale: Will be installed and authenticated")
    else:
        engine.log(f" • Tailscale: Skipped")
    engine.log("")

    home_dir = f"/home/{username}"
    repo_dir = f"{home_dir}/EduBoard"
    venv_dir = f"{home_dir}/venv"

    # --- User Account Setup ---
    engine.log("→ Setting up user account...")
    set_hostname(hostname, engine.log)

    try:
        pwd.getpwnam(username)
        engine.log(f" User '{username}' already exists")
    except KeyError:
        run_command(f"sudo adduser --disabled-password --gecos '' {username}", log_callback=engine.log)
        run_command(f"echo '{username} ALL=(ALL) NOPASSWD: /usr/bin/chvt' | sudo tee /etc/sudoers.d/kiosk-chvt")
        engine.log(f"✓ Created user '{username}'")

    # --- Package Dependencies ---
    engine.log("")
    engine.log("→ Installing system dependencies...")
    run_command("curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -", log_callback=engine.log)
    run_command("sudo add-apt-repository -y ppa:mozillateam/ppa", log_callback=engine.log)
    run_command("sudo apt update", log_callback=engine.log)

    packages = [
        "curl", "git", "python3-full", "python3-venv", "nodejs",
        "fonts-symbola", "fonts-noto-core", "fonts-dejavu", "fonts-wqy-microhei",
        "kmscon", "sway", "firefox-esr", "wlr-randr", "seatd", "swaybg", "ufw"
    ]
    package_list = " ".join(packages)
    engine.log(f" Installing dependencies... (This may take a while!)")
    run_command(f"sudo apt install -y {package_list}", log_callback=engine.log)
    engine.log("✓ Dependencies installed")

    run_command("sudo groupadd -r seat 2>/dev/null || true", log_callback=engine.log)
    run_command(
        f"sudo usermod -aG video,audio,input,tty,render,sudo,seat {username}",
        log_callback=engine.log
    )
    engine.log(f"✓ Added user to required groups")

    # --- Fastfetch ---
    engine.log("→ Installing fastfetch...")
    run_command("wget https://github.com/fastfetch-cli/fastfetch/releases/latest/download/fastfetch-linux-amd64.deb -O /tmp/fastfetch.deb", log_callback=engine.log)
    run_command("sudo dpkg -i /tmp/fastfetch.deb", log_callback=engine.log)
    engine.log("✓ Fastfetch installed")

    # Firefox policies
    firefox_policies = """{
  "policies": {
    "DisableAppUpdate": true,
    "DontCheckDefaultBrowser": true,
    "NoDefaultBookmarks": true,
    "OverrideFirstRunPage": "",
    "OverridePostUpdatePage": ""
  }
}
"""
    write_file("/usr/lib/firefox-esr/distribution/policies.json", firefox_policies)
    engine.log("✓ Firefox policies written")

    # --- Application Setup ---
    engine.log("")
    engine.log("→ Setting up EduBoard application...")
    if not os.path.exists(repo_dir):
        engine.log(" Cloning repository...")
        run_command(
            f"sudo -u {username} git clone https://github.com/rawnullbyte/EduBoard.git {repo_dir}",
            log_callback=engine.log
        )
        engine.log("✓ Repository cloned")
    else:
        engine.log(" Repository already exists, skipping clone")

    env_content = f"""SCHOOL_SUBDOMAIN={subdomain}
SCREEN_ID={screen_id}
PASSWORD={password}
WAYLAND_DISPLAY=wayland-0
"""
    write_file(f"{repo_dir}/.env", env_content, user=username)
    engine.log("✓ Environment configuration written")

    engine.log(" Creating Python virtual environment...")
    run_command(f"python3 -m venv {venv_dir}", user=username, log_callback=engine.log)
    run_command(f"sudo chown -R {username}:{username} {venv_dir}")

    # --- Systemd Service ---
    engine.log("")
    engine.log("→ Creating EduBoard systemd service...")
    service_content = f"""[Unit]
Description=EduBoard Background Service
After=network.target

[Service]
Type=simple
User={username}
Group={username}
WorkingDirectory={repo_dir}
ExecStart=/bin/bash -c "source {venv_dir}/bin/activate && {repo_dir}/run.sh"
Restart=always
RestartSec=3
Environment="PATH={venv_dir}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment=PYTHONUNBUFFERED=1
Environment=WAYLAND_DISPLAY=wayland-0
Environment=XDG_RUNTIME_DIR=/run/user/%U

[Install]
WantedBy=multi-user.target
"""
    write_file("/etc/systemd/system/EduBoard.service", service_content)
    engine.log("✓ EduBoard service created!")

    # --- KMSCON & Sway Configuration ---
    engine.log("")
    engine.log("→ Configuring KMSCON terminal...")
    kmscon_conf_content = """font-name=DejaVu Sans Mono, WenQuanYi Micro Hei Mono
font-size=14
term=xterm-256color
hwaccel
"""
    write_file("/etc/kmscon/kmscon.conf", kmscon_conf_content)
    engine.log("✓ KMSCON configuration written")

    sway_config_content = f"""
default_border none
default_floating_border none
hide_edge_borders both
gaps inner 0
bar {{
    swaybar_command :
}}
exec firefox-esr --kiosk http://localhost:8000
for_window [app_id="firefox"] fullscreen global
bindsym Mod4+Shift+q kill
bindsym Ctrl+Alt+Delete exec swaymsg exit # emergency exit to tty
"""
    write_file(f"{home_dir}/.config/sway/config", sway_config_content, user=username)
    engine.log("✓ Sway kiosk config written")

    override_dir = "/etc/systemd/system/kmsconvt@tty1.service.d"
    override_content = f"""[Service]
ExecStart=
ExecStart=/usr/libexec/kmscon/kmscon --vt tty1 --seats seat0 --configdir /etc/kmscon --term xterm-256color --login -- /bin/su -l {username} -c "exec {venv_dir}/bin/python {repo_dir}/misc/boot.py"
"""
    write_file(f"{override_dir}/override.conf", override_content)
    engine.log(f"✓ KMSCON configured for user '{username}' on tty1")

    # --- Tailscale Installation ---
    tailscale_installed = install_tailscale(tailscale_token, engine.log)

    # --- UFW Firewall ---
    engine.log("")
    engine.log("→ Configuring UFW firewall...")
    run_command("sudo ufw default deny incoming", log_callback=engine.log)
    run_command("sudo ufw default allow outgoing", log_callback=engine.log)
    run_command("sudo ufw allow 22/tcp comment 'SSH'", log_callback=engine.log)
    
    if tailscale_installed:
        run_command("sudo ufw allow 41641/udp comment 'Tailscale'", log_callback=engine.log)
    
    run_command("echo 'y' | sudo ufw enable", log_callback=engine.log)
    run_command("sudo ufw reload", log_callback=engine.log)
    engine.log("✓ UFW firewall configured and enabled")

    # Disable conflicting services
    engine.log(" Disabling conflicting terminal services...")
    run_command("sudo systemctl mask getty@tty1.service")
    run_command("sudo systemctl mask serial-getty@ttyS0.service")
    run_command("sudo systemctl mask serial-getty@hvc0.service")

    # Enable services
    run_command("sudo systemctl enable kmsconvt@tty1.service", log_callback=engine.log)
    engine.log("✓ Services enabled")

    # --- Final Setup ---
    engine.log("")
    engine.log("→ Finalizing installation...")
    run_command("sudo systemctl daemon-reload")
    run_command("sudo systemctl enable EduBoard", log_callback=engine.log)
    run_command("sudo systemctl enable seatd", log_callback=engine.log)
    run_command(f"sudo loginctl enable-linger {username}", log_callback=engine.log)

    engine.log("")
    engine.log("╔══════════════════════════════════════╗")
    engine.log("║         Installation Complete!       ║")
    engine.log("╚══════════════════════════════════════╝")
    engine.log("")
    engine.log("System will reboot in 3 seconds...")
    run_command("sleep 3 && sudo reboot")


if __name__ == "__main__":
    curses.wrapper(main)