#!/bin/bash

echo "🚀 Starting EduBoard..."

echo "📥 Pulling latest changes from git..."
git pull --rebase --autostash

echo "📥 Installing Python dependencies..."
pip3 install --upgrade pip
pip3 install -r requirements.txt

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