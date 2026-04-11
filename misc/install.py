import subprocess
import os
import shutil
from pathlib import Path
from aengine import AnimationEngine
from logo import text as logo_ascii
import curses
import pwd

def run_command(command, user=None, cwd=None, env=None, log_callback=None):
    """Execute a shell command with optional user context and working directory."""
    custom_env = os.environ.copy()
    custom_env.update({
        "DEBIAN_FRONTEND": "noninteractive",
        "TERM": "xterm-256color",
        "LANG": "en_US.UTF-8",
        "LC_ALL": "en_US.UTF-8"
    })
    
    directory = cwd if cwd else "."
    setup_env = "export TERM=xterm-256color DEBIAN_FRONTEND=noninteractive LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 && "
    
    if user:
        escaped_command = command.replace("'", "'\\''")
        full_command = f"sudo -u {user} -i bash -c '{setup_env} cd {directory} && {escaped_command}'"
    else:
        full_command = f"bash -c '{setup_env} {command}'"

    if log_callback:
        log_callback(f"→ {command}")

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
        # Only log stdout if there's something meaningful and not too verbose
        output = process.stdout.strip()
        if output and len(output) < 200:
            log_callback(f"  {output}")
    
    return process

def write_file(path, content, user=None, mode=0o644):
    """Write content to a file with proper ownership and permissions."""
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
    """Set system hostname and update hosts file."""
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

def main(stdscr):
    # --- Animation Sequence ---
    engine = AnimationEngine(stdscr)
    engine.set_ascii(logo_ascii)
    engine.animate_ascii_move(duration=3, direction="up")
    engine.sleep(1)
    engine.animate_ascii_move(duration=3, direction="out")
    
    engine.log("╔══════════════════════════════════════╗")
    engine.log("║       EduBoard Setup Wizard          ║")
    engine.log("╚══════════════════════════════════════╝")
    engine.log("")
    
    # --- Configuration ---
    hostname = engine.ask("System Hostname", "tv1") or "tv1"
    username = engine.ask("Kiosk Username", "kiosk") or "kiosk"
    subdomain = engine.ask("School Subdomain", "school") or "school"
    screen_id = engine.ask("Screen Identifier", "1") or "1"
    password = engine.ask("Kiosk Password", "123456") or "123456"
    
    engine.log("")
    engine.log("Configuration Summary:")
    engine.log(f"  • Hostname:   {hostname}")
    engine.log(f"  • User:       {username}")
    engine.log(f"  • Subdomain:  {subdomain}")
    engine.log(f"  • Screen ID:  {screen_id}")
    engine.log("")

    home_dir = f"/home/{username}"
    repo_dir = f"{home_dir}/EduBoard"
    venv_dir = f"{home_dir}/venv"

    # --- User Account Setup ---
    engine.log("→ Setting up user account...")
    set_hostname(hostname, engine.log)
    
    try:
        pwd.getpwnam(username)
        engine.log(f"  User '{username}' already exists")
    except KeyError:
        run_command(f"sudo adduser --disabled-password --gecos '' {username}", log_callback=engine.log)
        run_command(f"echo '{username}:{password}' | sudo chpasswd")
        engine.log(f"✓ Created user '{username}'")
    
    run_command(
        f"sudo usermod -aG video,audio,input,tty,render,sudo {username}", 
        log_callback=engine.log
    )
    engine.log(f"✓ Added user to required groups")

    # --- Package Dependencies ---
    engine.log("")
    engine.log("→ Installing system dependencies...")
    run_command(
        "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -", 
        log_callback=engine.log
    )
    run_command("sudo apt update", log_callback=engine.log)
    
    packages = [
        "curl",
        "git", 
        "python3-full",
        "python3-venv",
        "nodejs",
        "kmscon",
        "fonts-symbola",
        "fonts-noto-core",
        "fonts-dejavu",
        "fonts-wqy-microhei"
    ]
    
    # Format package list like apt install output
    package_list = " ".join(packages)
    engine.log(f"  Installing: {package_list}")
    run_command(f"sudo apt install -y {package_list}", log_callback=engine.log)
    engine.log("✓ Dependencies installed")

    # --- Application Setup ---
    engine.log("")
    engine.log("→ Setting up EduBoard application...")
    
    if not os.path.exists(repo_dir):
        engine.log("  Cloning repository...")
        run_command(
            f"sudo -u {username} git clone https://github.com/rawnullbyte/EduBoard.git {repo_dir}", 
            log_callback=engine.log
        )
        engine.log("✓ Repository cloned")
    else:
        engine.log("  Repository already exists, skipping clone")
    
    # Write environment configuration
    env_content = f"""SCHOOL_SUBDOMAIN={subdomain}
SCREEN_ID={screen_id}
PASSWORD={password}
"""
    write_file(f"{repo_dir}/.env", env_content, user=username)
    engine.log("✓ Environment configuration written")
    
    # Python virtual environment
    engine.log("  Creating Python virtual environment...")
    run_command(
        f"python3 -m venv {venv_dir}", 
        user=username, 
        log_callback=engine.log
    )
    
    engine.log("  Installing Python dependencies...")
    run_command(
        f"{venv_dir}/bin/pip install -r requirements.txt", 
        user=username, 
        cwd=repo_dir, 
        log_callback=engine.log
    )
    engine.log("✓ Python dependencies installed")
    
    # Frontend build
    engine.log("  Building frontend assets...")
    run_command(
        "npm install && npm run build", 
        user=username, 
        cwd=f"{repo_dir}/frontend", 
        log_callback=engine.log
    )
    engine.log("✓ Frontend built successfully")

    # --- KMSCON Terminal Configuration ---
    engine.log("")
    engine.log("→ Configuring KMSCON terminal...")
    
    kmscon_conf_content = """font-name=DejaVu Sans Mono, WenQuanYi Micro Hei Mono
font-size=14
hwaccel
"""
    write_file("/etc/kmscon/kmscon.conf", kmscon_conf_content)
    engine.log("✓ KMSCON configuration written")

    # Systemd override for auto-login
    override_dir = "/etc/systemd/system/kmsconvt@tty1.service.d"
    override_content = f"""[Service]
ExecStart=
ExecStart=/usr/libexec/kmscon/kmscon --vt=%I --seats=seat0 --configdir /etc/kmscon --login -- /bin/login -f {username}
"""
    write_file(f"{override_dir}/override.conf", override_content)
    engine.log(f"✓ Auto-login configured for user '{username}'")

    # Disable conflicting services
    engine.log("  Disabling conflicting terminal services...")
    run_command("sudo systemctl mask getty@tty1.service")
    run_command("sudo systemctl mask serial-getty@ttyS0.service")
    run_command("sudo systemctl mask serial-getty@hvc0.service")
    
    # Enable KMSCON
    run_command("sudo systemctl enable kmsconvt@tty1.service", log_callback=engine.log)
    engine.log("✓ KMSCON service enabled")

    # --- Final Setup ---
    engine.log("")
    engine.log("→ Finalizing installation...")
    run_command("sudo systemctl set-default multi-user.target", log_callback=engine.log)
    run_command("sudo systemctl daemon-reload")
    
    engine.log("")
    engine.log("╔══════════════════════════════════════╗")
    engine.log("║       Installation Complete!          ║")
    engine.log("╚══════════════════════════════════════╝")
    engine.log("")
    engine.log("System will reboot in 3 seconds...")
    
    run_command("sleep 3 && sudo reboot")

if __name__ == "__main__":
    curses.wrapper(main)