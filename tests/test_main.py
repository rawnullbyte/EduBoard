from collections import deque

import httpx
from fastapi.testclient import TestClient

from main import AppSettings, EduBoard, ScreenManager, create_app


class FakeResponse:
    def __init__(self, json_data=None, cookies=None, status_code=200):
        self._json_data = json_data
        self.cookies = cookies or {}
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            request = httpx.Request("POST", "https://example.com")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError("error", request=request, response=response)

    def json(self):
        return self._json_data


class FakeClient:
    def __init__(self, get_responses=None, post_responses=None):
        self.get_responses = deque(get_responses or [])
        self.post_responses = deque(post_responses or [])

    def get(self, url):
        response = self.get_responses.popleft()
        if isinstance(response, Exception):
            raise response
        return response

    def post(self, url, json=None, cookies=None, headers=None):
        response = self.post_responses.popleft()
        if isinstance(response, Exception):
            raise response
        return response

    def close(self):
        return None


def make_settings(**overrides):
    defaults = {
        "school_subdomain": "demo",
        "screen_id": "42",
        "password": "secret",
        "cache_ttl_seconds": 30,
        "session_ttl_seconds": 300,
        "screen_loop_interval_seconds": 1,
    }
    defaults.update(overrides)
    return AppSettings(
        **defaults,
    )


def test_fetch_main_dbi_maps_lookup_tables_and_meta():
    client = FakeClient(
        get_responses=[FakeResponse(cookies={"PHPSESSID": "abc"})],
        post_responses=[
            FakeResponse(json_data={"r": {"cookie": "hash"}}),
            FakeResponse(
                json_data={
                    "r": {
                        "tables": [
                            {
                                "id": "classes",
                                "def": {"name": "Classes", "item_name": "Class", "icon": "school"},
                                "data_rows": [{"id": 1, "short": "1A"}],
                            },
                            {
                                "id": "periods",
                                "def": {"name": "Periods", "item_name": "Period", "icon": "clock"},
                                "data_rows": [
                                    {
                                        "id": 11,
                                        "name": "First",
                                        "short": "1",
                                        "period": 1,
                                        "starttime": "08:00",
                                        "endtime": "08:45",
                                    }
                                ],
                            },
                            {
                                "id": "infoscreens",
                                "def": {"name": "Infoscreens", "item_name": "Infoscreen", "icon": "tv"},
                                "data_rows": [{"id": 9, "name": "Hall", "header": "Main", "type": "events"}],
                            },
                        ]
                    }
                }
            ),
        ],
    )
    service = EduBoard(make_settings(), client=client)

    payload = service.fetchMainDBI()

    assert payload["classes"]["data"][1] == "1A"
    assert payload["periods"]["data"][11]["start"] == "08:00"
    assert payload["infoscreens"]["data"][0]["name"] == "Hall"
    assert payload["meta"]["source"] == "live"
    assert payload["meta"]["configured"] is True


def test_fetch_timetable_returns_stale_cache_when_live_fetch_fails():
    client = FakeClient(
        get_responses=[FakeResponse(cookies={"PHPSESSID": "abc"})],
        post_responses=[
            FakeResponse(json_data={"r": {"cookie": "hash"}}),
            FakeResponse(
                json_data={
                    "r": {
                        "rows": [
                            {
                                "id": 1,
                                "ttitems": [
                                    {"uniperiod": 1, "starttime": "08:00", "endtime": "08:45"}
                                ],
                            }
                        ],
                        "table": "demo",
                        "day_name": "Monday",
                        "_changeEvents": {},
                    }
                }
            ),
            httpx.ConnectError("offline"),
        ],
    )
    service = EduBoard(make_settings(cache_ttl_seconds=0), client=client)

    first = service.fetchTimetableData()
    second = service.fetchTimetableData()

    assert first["meta"]["source"] == "live"
    assert second["meta"]["source"] == "cache"
    assert second["meta"]["stale"] is True
    assert second["classes"][0]["ttitems"][0]["uniperiod"] == 1
    assert "error" in second


def test_screen_manager_preserves_control_decision_logic():
    service = EduBoard(make_settings(), client=FakeClient())
    manager = ScreenManager(service, make_settings())

    should_be_on, reason = manager.evaluate_screen_state(
        {
            "classes": [
                {
                    "ttitems": [
                        {"starttime": "08:00", "endtime": "08:45"},
                        {"starttime": "09:00", "endtime": "09:45"},
                    ]
                }
            ]
        },
        now_str="08:50",
    )

    assert should_be_on is True
    assert reason == "between_classes"


def test_health_endpoint_reports_configuration_and_frontend_state():
    app = create_app(settings=AppSettings())

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["configured"] is False
    assert payload["status"] == "degraded"
