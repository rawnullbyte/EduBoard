#!/bin/bash
set -e

echo "=== EduBoard Kiosk Setup ==="

# --- Hostname and User Configuration ---
read -p "Enter new hostname (current: $(hostname)): " NEW_HOSTNAME
if [ -n "$NEW_HOSTNAME" ]; then
    echo "$NEW_HOSTNAME" | sudo tee /etc/hostname >/dev/null
    sudo sed -i "s/127.0.1.1.*/127.0.1.1\t$NEW_HOSTNAME/" /etc/hosts
fi

read -p "Enter kiosk username (default: kiosk): " USERNAME
USERNAME=${USERNAME:-kiosk}

if ! id "$USERNAME" &>/dev/null; then
    sudo adduser --disabled-password --gecos "" "$USERNAME"
fi
sudo usermod -aG video,audio,input "$USERNAME"

# --- .env Configuration (User Input) ---
echo "--- Environment Configuration ---"
read -p "School Subdomain (default: schoolname): " SUBDOMAIN
SUBDOMAIN=${SUBDOMAIN:-schoolname}

read -p "Screen ID (default: 1): " SCREEN_ID
SCREEN_ID=${SCREEN_ID:-1}

read -p "Password (default: 123456): " PASS
PASS=${PASS:-123456}

# --- Dependencies ---
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y curl git build-essential python3 python3-pip python3-venv \
    python3-xdg xserver-xorg x11-xserver-utils xinit openbox firefox nodejs \
    unclutter dbus-x11

# --- Project Setup ---
sudo -u "$USERNAME" bash << INNER_SCRIPT
set -e
PROJECT_DIR="\$HOME/EduBoard"
VENV_DIR="\$HOME/venv"

if [ ! -d "\$PROJECT_DIR" ]; then
    git clone https://github.com/rawnullbyte/EduBoard.git "\$PROJECT_DIR"
else
    git -C "\$PROJECT_DIR" pull
fi

cd "\$PROJECT_DIR"
cat > .env << EOF
SCHOOL_SUBDOMAIN=$SUBDOMAIN
SCREEN_ID=$SCREEN_ID
PASSWORD=$PASS
EOF
chmod +x run.sh

python3 -m venv "\$VENV_DIR"
"\$VENV_DIR/bin/pip" install --upgrade pip
[ -f requirements.txt ] && "\$VENV_DIR/bin/pip" install -r requirements.txt

cd frontend
npm ci --no-audit --prefer-offline
npm run build

# --- 5. Kiosk Execution Script ---
cat > "\$HOME/start-kiosk.sh" << 'EOF'
#!/bin/bash
VENV_PYTHON="/home/$USERNAME/venv/bin/python"
BOOT_SCRIPT="/home/$USERNAME/EduBoard/misc/boot.py"

# Run boot.py before X11
if [ -f "\$BOOT_SCRIPT" ]; then
    "\$VENV_PYTHON" "\$BOOT_SCRIPT"
fi

# Start X11 environment
xset -dpms
xset s off
xset s noblank
unclutter -idle 1 &

exec openbox-session &
sleep 2
firefox --kiosk --no-remote http://localhost:8000
EOF
chmod +x "\$HOME/start-kiosk.sh"
INNER_SCRIPT

# --- System Configuration ---
# Auto-login on TTY1
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d
sudo tee /etc/systemd/system/getty@tty1.service.d/override.conf > /dev/null <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $USERNAME --noclear %I \$TERM
EOF

# Launch X11 on login
sudo -u "$USERNAME" tee /home/"$USERNAME"/.bash_profile > /dev/null <<EOF
if [[ -z \$DISPLAY ]] && [[ \$(tty) = /dev/tty1 ]]; then
    startx /home/$USERNAME/start-kiosk.sh
fi
EOF

# Systemd Backend Service
sudo tee /etc/systemd/system/eduboard.service > /dev/null <<EOF
[Unit]
Description=EduBoard Backend
After=network.target

[Service]
Type=simple
User=$USERNAME
WorkingDirectory=/home/$USERNAME/EduBoard
ExecStart=/home/$USERNAME/venv/bin/python /home/$USERNAME/EduBoard/run.sh
Restart=always
EnvironmentFile=/home/$USERNAME/EduBoard/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable eduboard.service
echo "Setup complete. Reboot to launch kiosk."