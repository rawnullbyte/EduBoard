#!/bin/bash

echo "--- Updating System and Installing Python ---"
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-full python3-pip git build-essential

TEMP_DIR="/tmp/eduboard_setup"
echo "--- Fetching Requirements and Misc to $TEMP_DIR ---"

mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR" || exit

git init
git remote add -f origin https://github.com/rawnullbyte/EduBoard.git
git config core.sparseCheckout true

echo "requirements.txt" >> .git/info/sparse-checkout
echo "misc/" >> .git/info/sparse-checkout

git pull origin main

echo "--- Creating Temporary Virtual Environment ---"
python3 -m venv "$TEMP_DIR/venv"

echo "--- Installing Requirements ---"
"$TEMP_DIR/venv/bin/pip" install --upgrade pip
"$TEMP_DIR/venv/bin/pip" install -r requirements.txt

echo "--- Launching Python Installer ---"
sudo "$TEMP_DIR/venv/bin/python3" misc/install.py