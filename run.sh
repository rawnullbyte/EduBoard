#!/bin/bash

VENV_PATH=$1

if [ -n "$VENV_PATH" ]; then
    if [ -f "$VENV_PATH/bin/activate" ]; then
        echo "🐍 Activating virtual environment from: $VENV_PATH"
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
git pull --rebase --autostash

echo "📥 Installing Python dependencies..."
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt

echo "🏗️  Building frontend..."
cd frontend

if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi

npm run build
cd ..

echo "✅ Starting EduBoard"
python3 main.py

if [ -n "$VENV_PATH" ]; then
    deactivate
fi