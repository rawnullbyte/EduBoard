#!/bin/bash
set -e

echo "=== EduBoard Setup ==="

# --- Configuration Prompts ---
read -p "Enter new hostname ($(hostname)): " NEW_HOSTNAME
read -p "Enter kiosk username (kiosk): " USERNAME
USERNAME=${USERNAME:-kiosk}

read -p "School Subdomain (schoolname): " SUBDOMAIN
SUBDOMAIN=${SUBDOMAIN:-schoolname}
read -p "Screen ID (1): " SCREEN_ID
SCREEN_ID=${SCREEN_ID:-1}
read -p "Password (123456): " PASS
PASS=${PASS:-123456}

read -p "Tailscale Auth Key (leave blank to skip): " TS_KEY

# --- System & User Setup ---
[ -n "$NEW_HOSTNAME" ] && sudo hostnamectl set-hostname "$NEW_HOSTNAME"

if ! id "$USERNAME" &>/dev/null; then
    sudo adduser --disabled-password --gecos "" "$USERNAME"
fi
sudo usermod -aG video,audio,input "$USERNAME"

# --- Dependencies & Font Support ---
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y curl git build-essential python3-full python3-venv nodejs \
    xserver-xorg x11-xserver-utils xinit openbox firefox unclutter dbus-x11 \
    fonts-freefont-ttf fonts-noto-core fbterm

# Refresh font cache and allow fbterm to access the TTY
sudo fc-cache -fv
sudo setcap 'cap_sys_tty_config+ep' /usr/bin/fbterm

# --- Tailscale ---
if [ -n "$TS_KEY" ]; then
    curl -fsSL https://tailscale.com/install.sh | sh
    sudo tailscale up --authkey="$TS_KEY" --hostname="${NEW_HOSTNAME:-$(hostname)}"
fi

# --- Project Setup ---
sudo -u "$USERNAME" bash << INNER_SCRIPT
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

cd frontend
npm ci --no-audit
npm run build
INNER_SCRIPT

# --- Kiosk Execution Scripts ---
K_START="/home/$USERNAME/start-kiosk.sh"
sudo -u "$USERNAME" tee "$K_START" > /dev/null <<EOF
#!/bin/bash
xset -dpms s off noblank
unclutter -idle 1 &
openbox-session &
sleep 2
firefox --kiosk --no-remote http://localhost:8000
EOF
sudo chmod +x "$K_START"

sudo -u "$USERNAME" tee /home/"$USERNAME"/.xinitrc > /dev/null <<EOF
exec /home/$USERNAME/start-kiosk.sh
EOF

# --- Boot Logic & Auto-Login ---
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d
sudo tee /etc/systemd/system/getty@tty1.service.d/override.conf > /dev/null <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $USERNAME --noclear %I \$TERM
EOF

sudo -u "$USERNAME" tee /home/"$USERNAME"/.bash_profile > /dev/null <<EOF
if [[ -z \$DISPLAY && \$(tty) = /dev/tty1 ]]; then
    # fbterm enables UTF-8 font rendering in the console
    fbterm -- /home/$USERNAME/venv/bin/python /home/$USERNAME/EduBoard/misc/boot.py
    exec startx
fi
EOF

# --- Systemd Backend Service ---
sudo tee /etc/systemd/system/eduboard.service > /dev/null <<EOF
[Unit]
Description=EduBoard Backend
After=network.target

[Service]
User=$USERNAME
WorkingDirectory=/home/$USERNAME/EduBoard
ExecStart=/home/$USERNAME/venv/bin/python /home/$USERNAME/EduBoard/main.py
Restart=always
EnvironmentFile=/home/$USERNAME/EduBoard/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable eduboard.service

echo "Installation completed! Rebooting..."
sleep 2
sudo reboot