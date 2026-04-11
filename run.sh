#!/bin/bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

MODE="prod"
INSTALL_DEPS=false
PULL_CHANGES=false
SKIP_PYTHON_DEPS=false
SKIP_FRONTEND_DEPS=false
VENV_PATH="${VENV_PATH:-}"

usage() {
    cat <<'EOF'
Usage: ./run.sh [options] [venv_path]

Options:
  --dev                    Run the FastAPI backend with reload and the Vite dev server together.
  --install                Force Python and frontend dependency installation.
  --pull                   Pull the latest git changes before starting.
  --skip-python-deps       Do not install Python dependencies.
  --skip-frontend-deps     Do not install frontend dependencies.
  --venv PATH              Activate the given virtual environment before running.
  --help                   Show this message.

Environment:
  BACKEND_HOST, BACKEND_PORT, FRONTEND_HOST, FRONTEND_PORT
EOF
}

while (($#)); do
    case "$1" in
        --dev)
            MODE="dev"
            ;;
        --install)
            INSTALL_DEPS=true
            ;;
        --pull)
            PULL_CHANGES=true
            ;;
        --skip-python-deps)
            SKIP_PYTHON_DEPS=true
            ;;
        --skip-frontend-deps)
            SKIP_FRONTEND_DEPS=true
            ;;
        --venv)
            shift
            VENV_PATH="${1:-}"
            if [ -z "$VENV_PATH" ]; then
                echo "❌ --venv requires a path"
                exit 1
            fi
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            if [[ "$1" == -* ]]; then
                echo "❌ Unknown option: $1"
                usage
                exit 1
            fi
            if [ -n "$VENV_PATH" ]; then
                echo "❌ Multiple virtual environment paths provided"
                exit 1
            fi
            VENV_PATH="$1"
            ;;
    esac
    shift
done

cd "$ROOT_DIR"

activate_venv() {
    if [ -z "$VENV_PATH" ]; then
        echo "🌐 No venv provided. Using system Python: $(which python3)"
        return
    fi

    if [ ! -f "$VENV_PATH/bin/activate" ]; then
        echo "❌ Error: Activation script not found in $VENV_PATH"
        exit 1
    fi

    echo "🐍 Activating virtual environment from: $VENV_PATH"
    # shellcheck disable=SC1090
    source "$VENV_PATH/bin/activate"
}

pull_changes() {
    if [ "$PULL_CHANGES" != true ]; then
        return
    fi

    echo "📥 Pulling latest changes from git..."
    if ! git pull --rebase --autostash; then
        echo "⚠️  git pull failed, continuing with the current checkout"
    fi
}

ensure_python_deps() {
    if [ "$SKIP_PYTHON_DEPS" = true ]; then
        return
    fi

    if [ "$INSTALL_DEPS" = true ] || ! python3 -c "import fastapi, uvicorn, httpx, dotenv" >/dev/null 2>&1; then
        echo "📥 Installing Python dependencies..."
        python3 -m pip install --upgrade pip
        python3 -m pip install -r requirements.txt
    else
        echo "✅ Python dependencies already available"
    fi
}

ensure_frontend_deps() {
    if [ "$SKIP_FRONTEND_DEPS" = true ]; then
        return
    fi

    if [ "$INSTALL_DEPS" = true ] || [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        echo "📦 Installing frontend dependencies..."
        if [ -f "$FRONTEND_DIR/package-lock.json" ]; then
            npm ci --prefix "$FRONTEND_DIR"
        else
            npm install --prefix "$FRONTEND_DIR"
        fi
    else
        echo "✅ Frontend dependencies already available"
    fi
}

cleanup() {
    local exit_code=$?
    if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
        kill "$BACKEND_PID" >/dev/null 2>&1 || true
    fi
    if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
        kill "$FRONTEND_PID" >/dev/null 2>&1 || true
    fi
    if [ -n "$VENV_PATH" ] && declare -F deactivate >/dev/null 2>&1; then
        deactivate || true
    fi
    exit "$exit_code"
}

run_production() {
    ensure_frontend_deps

    echo "🏗️  Building frontend..."
    npm run build --prefix "$FRONTEND_DIR"

    echo "✅ Starting EduBoard in production mode"
    python3 main.py
}

run_development() {
    ensure_frontend_deps

    echo "🧪 Starting EduBoard in development mode"
    echo "   Backend:  http://$BACKEND_HOST:$BACKEND_PORT"
    echo "   Frontend: http://$FRONTEND_HOST:$FRONTEND_PORT"

    trap cleanup EXIT INT TERM

    python3 -m uvicorn main:app --reload --host "$BACKEND_HOST" --port "$BACKEND_PORT" &
    BACKEND_PID=$!

    npm run dev --prefix "$FRONTEND_DIR" -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" &
    FRONTEND_PID=$!

    wait -n "$BACKEND_PID" "$FRONTEND_PID"
}

echo "🚀 Starting EduBoard..."
activate_venv
pull_changes
ensure_python_deps

if [ "$MODE" = "dev" ]; then
    run_development
else
    run_production
fi
