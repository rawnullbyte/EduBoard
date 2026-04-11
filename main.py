import asyncio
import os
import subprocess
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import httpx
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

FRONTEND_DIST = Path(__file__).parent / "frontend" / "dist"


class EduBoardError(RuntimeError):
    """Raised when EduBoard cannot fetch or parse upstream data."""


class EduBoard:
    SESSION_TTL_SECONDS = 300
    REQUEST_TIMEOUT = 20.0
    LOOKUP_TABLE_IDS = ("teachers", "subjects", "classrooms", "classes")

    def __init__(self):
        self.school_subdomain = os.getenv("SCHOOL_SUBDOMAIN")
        self.screen_id = os.getenv("SCREEN_ID")
        self.password = os.getenv("PASSWORD")
        self.cookies = {}
        self.headers = {}
        self._session_valid_until = 0.0

    def is_configured(self):
        return all((self.school_subdomain, self.screen_id, self.password))

    @staticmethod
    def _empty_lookup_table():
        return {"name": "", "item_name": "", "icon": "", "data": {}}

    @staticmethod
    def _empty_periods_table():
        return {"name": "", "item_name": "", "icon": "", "data": {}}

    @staticmethod
    def _empty_infoscreens_table():
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

    @staticmethod
    def _empty_schedule_payload(error=None):
        data = {
            "table": None,
            "day_name": None,
            "change_events": {},
            "classes": [],
        }
        if error:
            data["error"] = error
        return data

    def _ensure_configured(self):
        if self.is_configured():
            return

        raise EduBoardError(
            "Missing EduBoard configuration. Set SCHOOL_SUBDOMAIN, SCREEN_ID, and PASSWORD."
        )

    def _authenticate(self, force=False):
        self._ensure_configured()

        if (
            not force
            and self.cookies.get("PHPSESSID")
            and self.cookies.get("nb_pwd_hash")
            and time.monotonic() < self._session_valid_until
        ):
            return

        base_url = f"https://{self.school_subdomain}.edupage.org"
        referer = f"{base_url}/infoscreen/{self.screen_id}"

        try:
            landing_response = httpx.get(
                referer,
                follow_redirects=True,
                timeout=self.REQUEST_TIMEOUT,
            )
            landing_response.raise_for_status()
            php_session = landing_response.cookies.get("PHPSESSID")
            if not php_session:
                raise EduBoardError("EduPage did not return a PHP session cookie.")

            headers = {
                "Referer": referer,
                "Origin": base_url,
            }
            login_response = httpx.post(
                f"{base_url}/infoscreen/server/infoscreens.js?__func=infoscreenLogin",
                json={"__args": [None, self.password], "__gsh": "00000000"},
                cookies={"PHPSESSID": php_session},
                headers=headers,
                timeout=self.REQUEST_TIMEOUT,
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
        self._session_valid_until = time.monotonic() + self.SESSION_TTL_SECONDS

    def _post_json(self, path, payload):
        self._authenticate()
        url = f"https://{self.school_subdomain}.edupage.org/{path}"

        try:
            response = httpx.post(
                url,
                json=payload,
                cookies=self.cookies,
                headers=self.headers,
                timeout=self.REQUEST_TIMEOUT,
            )

            if response.status_code in (401, 403):
                self._authenticate(force=True)
                response = httpx.post(
                    url,
                    json=payload,
                    cookies=self.cookies,
                    headers=self.headers,
                    timeout=self.REQUEST_TIMEOUT,
                )

            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as exc:
            raise EduBoardError(f"EduPage request failed: {exc}") from exc
        except ValueError as exc:
            raise EduBoardError(f"EduPage returned invalid JSON: {exc}") from exc

    def fetchMainDBI(self):
        data = self._empty_main_dbi()

        try:
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
        except EduBoardError as exc:
            data["error"] = str(exc)
            return data

        for table in response_data.get("r", {}).get("tables", []):
            table_id = table.get("id")
            definition = table.get("def") or {}
            rows = table.get("data_rows", [])

            if table_id in self.LOOKUP_TABLE_IDS:
                table_data = {}
                for row in rows:
                    row_id = row.get("id")
                    if row_id is not None:
                        table_data[row_id] = row.get("short", "")

                data[table_id] = {
                    "name": definition.get("name", ""),
                    "item_name": definition.get("item_name", ""),
                    "icon": definition.get("icon", ""),
                    "data": table_data,
                }
                continue

            if table_id == "periods":
                periods = {}
                for row in rows:
                    row_id = row.get("id")
                    if row_id is None:
                        continue

                    periods[row_id] = {
                        "name": row.get("name"),
                        "short": row.get("short"),
                        "period": row.get("period"),
                        "start": row.get("starttime"),
                        "end": row.get("endtime"),
                    }

                data["periods"] = {
                    "name": definition.get("name", ""),
                    "item_name": definition.get("item_name", ""),
                    "icon": definition.get("icon", ""),
                    "data": periods,
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

    def fetchInfoscreenEventsData(self):
        data = self._empty_schedule_payload()

        try:
            response_data = self._post_json(
                "infoscreen/server/infoscreens.js?__func=getInfoscreenEventsData",
                {
                    "__args": [
                        None,
                        self.screen_id,
                        {"date": datetime.now().strftime("%Y-%m-%d")},
                    ],
                    "__gsh": "00000000",
                },
            )
        except EduBoardError as exc:
            data["error"] = str(exc)
            return data

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
                ):
                    if key in item:
                        tt_item[key] = item[key]

                class_data["ttitems"].append(tt_item)

            data["classes"].append(class_data)

        return data

    def fetchTimetableData(self):
        data = self._empty_schedule_payload()

        try:
            response_data = self._post_json(
                "infoscreen/server/infoscreens.js?__func=getInfoscreenTimetableData",
                {
                    "__args": [
                        None,
                        self.screen_id,
                        {"date": datetime.now().strftime("%Y-%m-%d")},
                    ],
                    "__gsh": "00000000",
                },
            )
        except EduBoardError as exc:
            data["error"] = str(exc)
            return data

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


class ScreenManager:
    def __init__(self, edub_instance):
        self.edub = edub_instance

    def set_screen(self, state: bool):
        if not os.getenv("DISPLAY"):
            print("Skipping screen control because DISPLAY is not set.")
            return

        cmd = "on" if state else "off"
        try:
            subprocess.run(["xset", "dpms", "force", cmd], check=True)
            print(f"[{datetime.now().strftime('%H:%M:%S')}] xset dpms force {cmd}")
        except Exception as exc:
            print(f"Error controlling screen: {exc}")

    async def screen_timer_loop(self):
        while True:
            try:
                timetable = self.edub.fetchTimetableData()
                if timetable.get("error"):
                    print(f"Timer Loop Error: {timetable['error']}")
                else:
                    all_items = []
                    for row in timetable.get("classes", []):
                        for item in row.get("ttitems", []):
                            if item.get("starttime") and item.get("endtime"):
                                all_items.append(item)

                    if not all_items:
                        self.set_screen(False)
                    else:
                        now_str = datetime.now().strftime("%H:%M")
                        is_in_class = any(
                            item["starttime"] <= now_str < item["endtime"]
                            for item in all_items
                        )
                        school_start = min(item["starttime"] for item in all_items)
                        school_end = max(item["endtime"] for item in all_items)
                        self.set_screen(
                            (school_start <= now_str < school_end) and not is_in_class
                        )
            except Exception as exc:
                print(f"Timer Loop Error: {exc}")

            await asyncio.sleep(60)


edub = EduBoard()
screenmgr = ScreenManager(edub)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(screenmgr.screen_timer_loop())
    print("Screen manager background task started.")

    yield

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        print("Screen manager background task stopped.")


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "configured": edub.is_configured(),
        "frontend_built": FRONTEND_DIST.exists(),
    }


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


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
