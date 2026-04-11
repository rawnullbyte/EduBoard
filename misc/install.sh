#!/bin/bash
set -e

echo "=== EduBoard Setup ==="

# --- Configuration ---
read -p "Kiosk Username (kiosk): " USERNAME
USERNAME=${USERNAME:-kiosk}
read -p "Subdomain (schoolname): " SUBDOMAIN
SUBDOMAIN=${SUBDOMAIN:-schoolname}
read -p "Screen ID (1): " SCREEN_ID
SCREEN_ID=${SCREEN_ID:-1}
read -p "Password (123456): " PASS
PASS=${PASS:-123456}

# --- System & User ---
if ! id "$USERNAME" &>/dev/null; then
    sudo adduser --disabled-password --gecos "" "$USERNAME"
fi
sudo usermod -aG video,audio,input,tty,render "$USERNAME"

# --- Dependencies ---
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential python3-full python3-venv nodejs \
    xserver-xorg x11-xserver-utils xinit openbox firefox unclutter dbus-x11 \
    fonts-freefont-ttf fonts-noto-core

# --- App Setup ---
sudo -u "$USERNAME" bash << INNER
set -e
cd \$HOME
[ ! -d "EduBoard" ] && git clone https://github.com/rawnullbyte/EduBoard.git
cd EduBoard && git pull
cat > .env << EOF
SCHOOL_SUBDOMAIN=$SUBDOMAIN
SCREEN_ID=$SCREEN_ID
PASSWORD=$PASS
EOF
python3 -m venv \$HOME/venv
\$HOME/venv/bin/pip install --upgrade pip
[ -f requirements.txt ] && \$HOME/venv/bin/pip install -r requirements.txt
cd frontend && npm ci --no-audit && npm run build
INNER

# --- Auto start ---
sudo -u "$USERNAME" tee /home/"$USERNAME"/.bash_profile > /dev/null <<EOF
if [[ -z \$DISPLAY && \$(tty) = /dev/tty1 ]]; then
    /home/$USERNAME/venv/bin/python /home/$USERNAME/EduBoard/misc/boot.py
    exec startx
fi
EOF

# --- X11 Config ---
sudo -u "$USERNAME" tee /home/"$USERNAME"/.xinitrc > /dev/null <<EOF
# Disable screen blanking
xset -dpms s off noblank
unclutter -idle 1 &

# Start Openbox
exec openbox-session
EOF

# --- Openbox Config ---
sudo -u "$USERNAME" mkdir -p /home/"$USERNAME"/.config/openbox
sudo -u "$USERNAME" tee /home/"$USERNAME"/.config/openbox/autostart > /dev/null <<EOF
firefox --kiosk --no-remote http://localhost:8000
EOF

# --- System Auto-Login ---
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d
sudo tee /etc/systemd/system/getty@tty1.service.d/override.conf > /dev/null <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $USERNAME --noclear %I \$TERM
EOF

# --- Backend Service ---
sudo tee /etc/systemd/system/eduboard.service > /dev/null <<EOF
[Unit]
Description=EduBoard Backend
After=network.target

[Service]
User=$USERNAME
WorkingDirectory=/home/$USERNAME/EduBoard
ExecStart=/bin/bash /home/$USERNAME/EduBoard/run.sh /home/$USERNAME/venv
Restart=always
EnvironmentFile=/home/$USERNAME/EduBoard/.env

[Install]
WantedBy=multi-user.target
EOF

# --- Finalize ---
sudo systemctl daemon-reload
sudo systemctl enable eduboard.service
echo "Setup finished. Rebooting..."
sudo reboot