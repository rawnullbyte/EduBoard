#!/bin/bash
set -euo pipefail

VENV_PATH=${1:-}

if [ -n "$VENV_PATH" ]; then
    if [ -f "$VENV_PATH/bin/activate" ]; then
        echo "🐍 Activating virtual environment from: $VENV_PATH"
        # shellcheck disable=SC1090
        source "$VENV_PATH/bin/activate"
    else
        echo "❌ Error: Activation script not found in $VENV_PATH"
        exit 1
    fi
else
    echo "🌐 No venv provided. Using system Python: $(which python3)"
fi

echo "🚀 Starting EduBoard..."

echo "📥 Pulling latest changes from git..."
if ! git pull --rebase --autostash; then
    echo "⚠️  git pull failed, continuing with the current checkout"
fi

echo "📥 Installing Python dependencies..."
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt

echo "🏗️  Building frontend..."
cd frontend

if [ -f "package-lock.json" ]; then
    echo "📦 Installing frontend dependencies with npm ci..."
    npm ci
else
    echo "📦 Installing frontend dependencies with npm install..."
    npm install
fi

npm run build
cd ..

echo "✅ Starting EduBoard"
python3 main.py

if [ -n "$VENV_PATH" ]; then
    deactivate
fi
