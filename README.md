# EduBoard Platform

EduBoard is a kiosk-first school display platform for timetables, announcements, and event signage. This branch turns the project into a stronger product baseline with a cache-aware FastAPI backend, a richer React display experience, safer installer/dev tooling, frontend tests, backend tests, and CI.

## Architecture

```text
+-------------------+      +---------------------+      +----------------------+
| kmscon / boot.py  | ---> | Openbox + Firefox   | ---> | React signage app    |
| startx launcher   |      | kiosk session       |      | frontend/dist        |
+-------------------+      +---------------------+      +----------+-----------+
                                                                   |
                                                                   v
                                                        +----------------------+
                                                        | FastAPI backend      |
                                                        | main.py              |
                                                        | EduPage client/cache |
                                                        +----------+-----------+
                                                                   |
                                                                   v
                                                        +----------------------+
                                                        | EduPage infoscreens  |
                                                        +----------------------+
```

## Configuration

Required environment variables:

| Variable | Purpose |
| --- | --- |
| `SCHOOL_SUBDOMAIN` | EduPage tenant subdomain, without `.edupage.org` |
| `SCREEN_ID` | EduPage infoscreen identifier |
| `PASSWORD` | Infoscreen password |

Optional runtime tuning:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DISPLAY` | `:0` | X11 display used by DPMS control |
| `BACKEND_HOST` | `0.0.0.0` | FastAPI bind host |
| `BACKEND_PORT` | `8000` | FastAPI bind port |
| `EDUBOARD_REQUEST_TIMEOUT` | `20` | Upstream EduPage timeout in seconds |
| `EDUBOARD_SESSION_TTL` | `300` | Login session reuse window |
| `EDUBOARD_CACHE_TTL` | `45` | Fresh cache window for API responses |
| `EDUBOARD_SCREEN_LOOP_INTERVAL` | `60` | Screen control loop interval in seconds |

The sample file is in [.env.example](/workspaces/EduBoard/.env.example).

## Installation

Quick kiosk install:

```bash
export TERM=xterm-256color
sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/rawnullbyte/EduBoard/refs/heads/main/misc/install.sh)"
```

Advanced installer options are available if you run the Python installer directly:

```bash
sudo python3 misc/install.py --skip-reboot
sudo python3 misc/install.py --dry-run
```

The installer now:

- writes a persistent install log to `/var/log/eduboard-install.log`
- supports `--skip-reboot` and `--dry-run`
- builds the frontend before enabling the kiosk services
- waits for `/health` before launching Firefox from Openbox

## Local Development

Backend + frontend dev mode:

```bash
python3 -m venv .venv
source .venv/bin/activate
./run.sh --install --dev --venv .venv
```

Production-style local run:

```bash
./run.sh --install --venv .venv
```

Useful scripts:

- `./run.sh --dev` runs `uvicorn --reload` and the Vite dev server together
- `./run.sh --pull` pulls before startup
- `./run.sh --skip-python-deps` skips Python dependency installation
- `./run.sh --skip-frontend-deps` skips frontend dependency installation

## Verification

Backend checks:

```bash
python3 -m py_compile main.py misc/boot.py misc/install.py misc/aengine.py misc/logo.py
pytest -q
```

Frontend checks:

```bash
cd frontend
npm test
npm run lint
npm run build
```

## Operations

Health and cache summary:

- `GET /health` returns configuration state, cache ages, last backend error, and screen-manager state.

Useful logs:

- installer: `/var/log/eduboard-install.log`
- X startup: `~/.local/state/eduboard/startx.log`
- Openbox autostart: `~/.local/state/eduboard/openbox-autostart.log`

## Branch Notes

Current enterprise branch: `org-synapsegrid-aegis-vx-314159`

This branch focuses on turning EduBoard into a stronger foundation rather than a one-off kiosk script:

- cache-aware backend responses with explicit metadata
- health/status visibility for operators
- responsive signage-oriented frontend
- frontend and backend tests
- CI for Python and frontend validation
