import asyncio
import copy
import logging
import os
import subprocess
import threading
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

import httpx
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

load_dotenv()

FRONTEND_DIST = Path(__file__).parent / "frontend" / "dist"

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("eduboard")


def utcnow_iso():
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class AppSettings(BaseModel):
    school_subdomain: str | None = None
    screen_id: str | None = None
    password: str | None = None
    display: str | None = os.getenv("DISPLAY", ":0")
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    request_timeout_seconds: float = 20.0
    session_ttl_seconds: int = 300
    cache_ttl_seconds: int = 45
    screen_loop_interval_seconds: int = 60

    @classmethod
    def from_env(cls):
        return cls.model_validate(
            {
                "school_subdomain": os.getenv("SCHOOL_SUBDOMAIN"),
                "screen_id": os.getenv("SCREEN_ID"),
                "password": os.getenv("PASSWORD"),
                "display": os.getenv("DISPLAY", ":0"),
                "backend_host": os.getenv("BACKEND_HOST", "0.0.0.0"),
                "backend_port": os.getenv("BACKEND_PORT", "8000"),
                "request_timeout_seconds": os.getenv("EDUBOARD_REQUEST_TIMEOUT", "20"),
                "session_ttl_seconds": os.getenv("EDUBOARD_SESSION_TTL", "300"),
                "cache_ttl_seconds": os.getenv("EDUBOARD_CACHE_TTL", "45"),
                "screen_loop_interval_seconds": os.getenv("EDUBOARD_SCREEN_LOOP_INTERVAL", "60"),
            }
        )

    @property
    def configured(self):
        return all((self.school_subdomain, self.screen_id, self.password))

    @property
    def configuration_error(self):
        if self.configured:
            return None
        return "Missing EduBoard configuration. Set SCHOOL_SUBDOMAIN, SCREEN_ID, and PASSWORD."


class ResponseMeta(BaseModel):
    configured: bool
    source: Literal["live", "cache", "empty"]
    stale: bool = False
    generated_at: str = Field(default_factory=utcnow_iso)
    last_success_at: str | None = None
    last_error: str | None = None
    cache_age_seconds: float | None = None


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    configured: bool
    frontend_built: bool
    display: str | None = None
    last_success_at: str | None = None
    last_error: str | None = None
    cache: dict[str, dict[str, object]]
    stats: dict[str, int]
    screen_manager: dict[str, object]


class EduBoardError(RuntimeError):
    """Raised when EduBoard cannot fetch or parse upstream data."""


@dataclass
class CacheEntry:
    payload: dict
    stored_monotonic: float
    stored_at_iso: str

    def age_seconds(self):
        return round(time.monotonic() - self.stored_monotonic, 2)


class EduBoard:
    LOOKUP_TABLE_IDS = ("teachers", "subjects", "classrooms", "classes")

    def __init__(self, settings: AppSettings, client: httpx.Client | None = None):
        self.settings = settings
        self.client = client or httpx.Client(
            follow_redirects=True,
            timeout=self.settings.request_timeout_seconds,
        )
        self.cookies: dict[str, str] = {}
        self.headers: dict[str, str] = {}
        self._session_valid_until = 0.0
        self._cache: dict[str, CacheEntry] = {}
        self._lock = threading.RLock()
        self.last_success_at: str | None = None
        self.last_error: str | None = self.settings.configuration_error
        self.stats = {
            "cache_hits": 0,
            "live_fetches": 0,
            "failed_fetches": 0,
        }

    def close(self):
        self.client.close()

    def is_configured(self):
        return self.settings.configured

    def _empty_lookup_table(self):
        return {"name": "", "item_name": "", "icon": "", "data": {}}

    def _empty_periods_table(self):
        return {"name": "", "item_name": "", "icon": "", "data": {}}

    def _empty_infoscreens_table(self):
        return {"name": "", "item_name": "", "icon": "", "data": []}

    def _empty_main_dbi(self, error=None):
        data = {
            "teachers": self._empty_lookup_table(),
            "subjects": self._empty_lookup_table(),
            "classrooms": self._empty_lookup_table(),
            "classes": self._empty_lookup_table(),
            "periods": self._empty_periods_table(),
            "infoscreens": self._empty_infoscreens_table(),
        }
        if error:
            data["error"] = error
        return data

    @staticmethod
    def _current_school_year():
        now = datetime.now()
        return now.year if now.month >= 9 else now.year - 1

    def _empty_schedule_payload(self, error=None):
        data = {
            "table": None,
            "day_name": None,
            "change_events": {},
            "classes": [],
        }
        if error:
            data["error"] = error
        return data

    def _response_meta(self, source, stale=False, cache_age=None, error=None):
        return ResponseMeta(
            configured=self.is_configured(),
            source=source,
            stale=stale,
            last_success_at=self.last_success_at,
            last_error=error or self.last_error,
            cache_age_seconds=cache_age,
        ).model_dump()

    def _decorate_payload(self, payload, source, stale=False, cache_age=None, error=None):
        hydrated = copy.deepcopy(payload)
        hydrated["meta"] = self._response_meta(
            source=source,
            stale=stale,
            cache_age=cache_age,
            error=error,
        )
        if error:
            hydrated["error"] = error
        return hydrated

    def _record_success(self):
        self.last_success_at = utcnow_iso()
        self.last_error = None
        self.stats["live_fetches"] += 1

    def _record_failure(self, error):
        self.last_error = error
        self.stats["failed_fetches"] += 1
        logger.warning("EduBoard fetch failed: %s", error)

    def _get_cache(self, key):
        with self._lock:
            return self._cache.get(key)

    def _set_cache(self, key, payload):
        with self._lock:
            self._cache[key] = CacheEntry(
                payload=copy.deepcopy(payload),
                stored_monotonic=time.monotonic(),
                stored_at_iso=utcnow_iso(),
            )

    def _fresh_cache(self, key):
        entry = self._get_cache(key)
        if not entry:
            return None
        if self.settings.cache_ttl_seconds <= 0:
            return None
        if entry.age_seconds() <= self.settings.cache_ttl_seconds:
            return entry
        return None

    def _ensure_configured(self):
        if self.is_configured():
            return
        raise EduBoardError(self.settings.configuration_error)

    def _authenticate(self, force=False):
        self._ensure_configured()

        with self._lock:
            if (
                not force
                and self.cookies.get("PHPSESSID")
                and self.cookies.get("nb_pwd_hash")
                and time.monotonic() < self._session_valid_until
            ):
                return

            base_url = f"https://{self.settings.school_subdomain}.edupage.org"
            referer = f"{base_url}/infoscreen/{self.settings.screen_id}"

            try:
                landing_response = self.client.get(referer)
                landing_response.raise_for_status()
                php_session = landing_response.cookies.get("PHPSESSID")
                if not php_session:
                    raise EduBoardError("EduPage did not return a PHP session cookie.")

                headers = {
                    "Referer": referer,
                    "Origin": base_url,
                }
                login_response = self.client.post(
                    f"{base_url}/infoscreen/server/infoscreens.js?__func=infoscreenLogin",
                    json={"__args": [None, self.settings.password], "__gsh": "00000000"},
                    cookies={"PHPSESSID": php_session},
                    headers=headers,
                )
                login_response.raise_for_status()
                login_data = login_response.json()
            except httpx.HTTPError as exc:
                raise EduBoardError(f"Unable to contact EduPage: {exc}") from exc
            except ValueError as exc:
                raise EduBoardError(f"EduPage returned invalid JSON during login: {exc}") from exc

            password_cookie = login_data.get("r", {}).get("cookie")
            if not password_cookie:
                raise EduBoardError("EduPage login failed. Check SCREEN_ID and PASSWORD.")

            self.cookies = {
                "PHPSESSID": php_session,
                "nb_pwd_hash": password_cookie,
            }
            self.headers = headers
            self._session_valid_until = time.monotonic() + self.settings.session_ttl_seconds

    def _post_json(self, path, payload):
        self._authenticate()
        url = f"https://{self.settings.school_subdomain}.edupage.org/{path}"

        try:
            response = self.client.post(
                url,
                json=payload,
                cookies=self.cookies,
                headers=self.headers,
            )
            if response.status_code in (401, 403):
                self._authenticate(force=True)
                response = self.client.post(
                    url,
                    json=payload,
                    cookies=self.cookies,
                    headers=self.headers,
                )

            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as exc:
            raise EduBoardError(f"EduPage request failed: {exc}") from exc
        except ValueError as exc:
            raise EduBoardError(f"EduPage returned invalid JSON: {exc}") from exc

    def _load_payload(self, cache_key, live_fetcher, empty_factory):
        fresh_cache = self._fresh_cache(cache_key)
        if fresh_cache:
            self.stats["cache_hits"] += 1
            return self._decorate_payload(
                fresh_cache.payload,
                source="cache",
                cache_age=fresh_cache.age_seconds(),
            )

        fallback_cache = self._get_cache(cache_key)
        try:
            live_payload = live_fetcher()
            self._record_success()
            self._set_cache(cache_key, live_payload)
            return self._decorate_payload(live_payload, source="live")
        except EduBoardError as exc:
            error = str(exc)
            self._record_failure(error)
            if fallback_cache:
                self.stats["cache_hits"] += 1
                return self._decorate_payload(
                    fallback_cache.payload,
                    source="cache",
                    stale=True,
                    cache_age=fallback_cache.age_seconds(),
                    error=error,
                )
            return self._decorate_payload(
                empty_factory(error=error),
                source="empty",
                stale=True,
                error=error,
            )

    def _fetch_main_dbi_live(self):
        data = self._empty_main_dbi()
        response_data = self._post_json(
            "rpr/server/maindbi.js?__func=mainDBIAccessor",
            {
                "__args": [
                    None,
                    self._current_school_year(),
                    {"vt_filter": {}},
                    {
                        "op": "fetch",
                        "needed_part": {
                            "infoscreens": [
                                "name",
                                "header",
                                "type",
                                "enabled",
                                "substitution",
                                "timetable",
                                "events",
                                "canteen_menu",
                                "html",
                                "image",
                                "photoalbum",
                                "pdf",
                                "iframe",
                                "combined",
                                "timed",
                                "cycled",
                                "multiday",
                            ],
                            "global_settings": ["infoscreens"],
                            "classes": ["short"],
                            "subjects": ["short"],
                            "teachers": ["short"],
                            "classrooms": ["short"],
                            "periods": [
                                "starttime",
                                "endtime",
                                "short",
                                "name",
                                "firstname",
                                "lastname",
                                "callname",
                                "subname",
                                "code",
                                "period",
                            ],
                        },
                        "needed_combos": {},
                    },
                ],
                "__gsh": "00000000",
            },
        )

        for table in response_data.get("r", {}).get("tables", []):
            table_id = table.get("id")
            definition = table.get("def") or {}
            rows = table.get("data_rows", [])

            if table_id in self.LOOKUP_TABLE_IDS:
                data[table_id] = {
                    "name": definition.get("name", ""),
                    "item_name": definition.get("item_name", ""),
                    "icon": definition.get("icon", ""),
                    "data": {
                        row.get("id"): row.get("short", "")
                        for row in rows
                        if row.get("id") is not None
                    },
                }
                continue

            if table_id == "periods":
                data["periods"] = {
                    "name": definition.get("name", ""),
                    "item_name": definition.get("item_name", ""),
                    "icon": definition.get("icon", ""),
                    "data": {
                        row.get("id"): {
                            "name": row.get("name"),
                            "short": row.get("short"),
                            "period": row.get("period"),
                            "start": row.get("starttime"),
                            "end": row.get("endtime"),
                        }
                        for row in rows
                        if row.get("id") is not None
                    },
                }
                continue

            if table_id == "infoscreens":
                infoscreens = []
                for row in rows:
                    infoscreen = {
                        "id": row.get("id"),
                        "enabled": row.get("enabled", False),
                        "name": row.get("name", ""),
                        "header": row.get("header", ""),
                        "type": row.get("type", ""),
                    }
                    for key in (
                        "iframe",
                        "html",
                        "image",
                        "photoalbum",
                        "pdf",
                        "timetable",
                        "substitution",
                        "events",
                        "canteen_menu",
                        "combined",
                        "timed",
                        "cycled",
                        "multiday",
                    ):
                        value = row.get(key)
                        if value is not None:
                            infoscreen[key] = value
                    infoscreens.append(infoscreen)

                data["infoscreens"] = {
                    "name": definition.get("name", ""),
                    "item_name": definition.get("item_name", ""),
                    "icon": definition.get("icon", ""),
                    "data": infoscreens,
                }

        return data

    def fetchMainDBI(self):
        return self._load_payload("main_dbi", self._fetch_main_dbi_live, self._empty_main_dbi)

    def _fetch_events_live(self):
        data = self._empty_schedule_payload()
        response_data = self._post_json(
            "infoscreen/server/infoscreens.js?__func=getInfoscreenEventsData",
            {
                "__args": [
                    None,
                    self.settings.screen_id,
                    {"date": datetime.now().strftime("%Y-%m-%d")},
                ],
                "__gsh": "00000000",
            },
        )

        body = response_data.get("r", {})
        data["table"] = body.get("table")
        data["day_name"] = body.get("day_name")
        data["change_events"] = body.get("_changeEvents", {})

        for row in body.get("rows", []):
            class_data = {"id": row.get("id"), "ttitems": []}
            for item in row.get("ttitems", []):
                tt_item = {
                    "type": item.get("type"),
                    "date": item.get("date"),
                    "uniperiod": item.get("uniperiod"),
                    "starttime": item.get("starttime"),
                    "endtime": item.get("endtime"),
                }
                for key in (
                    "name",
                    "subjectid",
                    "classids",
                    "groupnames",
                    "igroupid",
                    "teacherids",
                    "classroomids",
                    "colors",
                    "eventid",
                    "absentid",
                    "changed",
                    "removed",
                    "durationperiods",
                    "description",
                ):
                    if key in item:
                        tt_item[key] = item[key]
                class_data["ttitems"].append(tt_item)
            data["classes"].append(class_data)

        return data

    def fetchInfoscreenEventsData(self):
        return self._load_payload("events", self._fetch_events_live, self._empty_schedule_payload)

    def _fetch_timetable_live(self):
        data = self._empty_schedule_payload()
        response_data = self._post_json(
            "infoscreen/server/infoscreens.js?__func=getInfoscreenTimetableData",
            {
                "__args": [
                    None,
                    self.settings.screen_id,
                    {"date": datetime.now().strftime("%Y-%m-%d")},
                ],
                "__gsh": "00000000",
            },
        )

        body = response_data.get("r", {})
        data["table"] = body.get("table")
        data["day_name"] = body.get("day_name")
        data["change_events"] = body.get("_changeEvents", {})
        for row in body.get("rows", []):
            class_data = {"id": row.get("id"), "ttitems": []}
            for item in row.get("ttitems", []):
                class_data["ttitems"].append(dict(item))
            data["classes"].append(class_data)

        return data

    def fetchTimetableData(self):
        return self._load_payload("timetable", self._fetch_timetable_live, self._empty_schedule_payload)

    def health_summary(self, screen_manager):
        cache_summary = {}
        for key, entry in self._cache.items():
            cache_summary[key] = {
                "last_updated": entry.stored_at_iso,
                "age_seconds": entry.age_seconds(),
            }

        status = "ok"
        if not self.is_configured() or self.last_error:
            status = "degraded"

        return HealthResponse(
            status=status,
            configured=self.is_configured(),
            frontend_built=FRONTEND_DIST.exists(),
            display=self.settings.display,
            last_success_at=self.last_success_at,
            last_error=self.last_error,
            cache=cache_summary,
            stats=self.stats,
            screen_manager=screen_manager.summary(),
        ).model_dump()


class ScreenManager:
    def __init__(self, edub_instance: EduBoard, settings: AppSettings):
        self.edub = edub_instance
        self.settings = settings
        self.last_state: bool | None = None
        self.last_reason = "not_started"
        self.last_error: str | None = None
        self.loop_iterations = 0

    def set_screen(self, state: bool, reason=""):
        if not self.settings.display:
            logger.info("Skipping screen control because DISPLAY is not set.")
            return

        env = os.environ.copy()
        env["DISPLAY"] = self.settings.display
        cmd = "on" if state else "off"
        try:
            subprocess.run(["xset", "dpms", "force", cmd], check=True, env=env)
            self.last_state = state
            self.last_reason = reason or f"dpms_{cmd}"
            logger.info("xset dpms force %s (%s)", cmd, self.last_reason)
        except Exception as exc:
            self.last_error = str(exc)
            logger.warning("Error controlling screen: %s", exc)

    def evaluate_screen_state(self, timetable_payload, now_str=None):
        if timetable_payload.get("error") and not timetable_payload.get("classes"):
            return None, "payload_error"

        all_items = []
        for row in timetable_payload.get("classes", []):
            for item in row.get("ttitems", []):
                if item.get("starttime") and item.get("endtime"):
                    all_items.append(item)

        if not all_items:
            return False, "no_scheduled_items"

        current_time = now_str or datetime.now().strftime("%H:%M")
        is_in_class = any(
            item["starttime"] <= current_time < item["endtime"] for item in all_items
        )
        school_start = min(item["starttime"] for item in all_items)
        school_end = max(item["endtime"] for item in all_items)
        should_be_on = (school_start <= current_time < school_end) and not is_in_class
        return should_be_on, "between_classes" if should_be_on else "outside_display_window"

    async def screen_timer_loop(self):
        while True:
            self.loop_iterations += 1
            try:
                timetable = self.edub.fetchTimetableData()
                next_state, reason = self.evaluate_screen_state(timetable)
                if next_state is None:
                    self.last_error = timetable.get("error")
                    logger.warning(
                        "Skipping screen state change because timetable is unavailable: %s",
                        self.last_error,
                    )
                elif next_state != self.last_state:
                    self.set_screen(next_state, reason=reason)
                else:
                    self.last_reason = reason
            except Exception as exc:
                self.last_error = str(exc)
                logger.exception("Timer Loop Error: %s", exc)

            await asyncio.sleep(self.settings.screen_loop_interval_seconds)

    def summary(self):
        return {
            "last_state": self.last_state,
            "last_reason": self.last_reason,
            "last_error": self.last_error,
            "loop_iterations": self.loop_iterations,
        }


def create_app(settings: AppSettings | None = None, client: httpx.Client | None = None):
    app_settings = settings or AppSettings.from_env()
    edub = EduBoard(app_settings, client=client)
    screenmgr = ScreenManager(edub, app_settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = asyncio.create_task(screenmgr.screen_timer_loop())
        logger.info("Screen manager background task started.")
        yield
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            logger.info("Screen manager background task stopped.")
        edub.close()

    app = FastAPI(lifespan=lifespan)
    app.state.settings = app_settings
    app.state.eduboard = edub
    app.state.screen_manager = screenmgr

    @app.get("/health")
    def health():
        return edub.health_summary(screenmgr)

    @app.get("/api/data")
    def get_all_data():
        return edub.fetchMainDBI()

    @app.get("/api/events")
    def get_events():
        return edub.fetchInfoscreenEventsData()

    @app.get("/api/timetable")
    def get_timetable():
        return edub.fetchTimetableData()

    if FRONTEND_DIST.exists():
        app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
    else:
        @app.get("/")
        def frontend_not_built():
            return PlainTextResponse(
                "Frontend build not found. Run `npm install` and `npm run build` in `frontend/`.",
                status_code=503,
            )

    return app


app = create_app()


if __name__ == "__main__":
    active_settings = AppSettings.from_env()
    uvicorn.run(app, host=active_settings.backend_host, port=active_settings.backend_port)
