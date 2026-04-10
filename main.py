from dotenv import load_dotenv
from datetime import datetime
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
import uvicorn
import httpx
import os

load_dotenv()

app = FastAPI()

class EduBoard:
    def __init__(self):
        self.SCHOOL_SUBDOMAIN = os.getenv('SCHOOL_SUBDOMAIN')
        self.SCREEN_ID = os.getenv('SCREEN_ID')
        self.PASSWORD = os.getenv('PASSWORD')

        r = httpx.get(f"https://{self.SCHOOL_SUBDOMAIN}.edupage.org/infoscreen/{self.SCREEN_ID}")

        self.cookies = {"PHPSESSID": r.cookies.get("PHPSESSID")}
        self.headers = {
            "Referer": f"https://{self.SCHOOL_SUBDOMAIN}.edupage.org/infoscreen/{self.SCREEN_ID}",
            "Origin": f"https://{self.SCHOOL_SUBDOMAIN}.edupage.org"
        }

        r = httpx.post(
            f"https://{self.SCHOOL_SUBDOMAIN}.edupage.org/infoscreen/server/infoscreens.js?__func=infoscreenLogin",
            json={"__args":[None,self.PASSWORD],"__gsh":"00000000"},
            cookies=self.cookies,
            headers=self.headers
        )

        self.cookies["nb_pwd_hash"] = r.json().get("r").get("cookie")
        self.fetchMainDBI()
    
    def fetchMainDBI(self):
        data={}

        r = httpx.post(
            f"https://{self.SCHOOL_SUBDOMAIN}.edupage.org/rpr/server/maindbi.js?__func=mainDBIAccessor",
            # No idea what are all the required arguments, copy pasted from devtools.
            json={"__args":[None,2025,{"vt_filter":{}},{"op":"fetch","needed_part":{"infoscreens":["name","header","type","enabled","substitution","timetable","events","canteen_menu","html","image","photoalbum","pdf","iframe","combined","timed","cycled","multiday"],"global_settings":["infoscreens"],"classes":["short"],"subjects":["short"],"teachers":["short"],"classrooms":["short"],"periods":["starttime","endtime","short","name","firstname","lastname","callname","subname","code","period"]},"needed_combos":{}}],"__gsh":"00000000"},
            cookies=self.cookies,
            headers=self.headers
        )

        for table in r.json().get("r", {}).get("tables", []):
            if table.get("id") in ["teachers", "subjects", "classrooms", "classes"]:
                data[table.get("id")] = {
                    "name": table.get("def").get("name"),
                    "item_name": table.get("def").get("item_name"),
                    "icon": table.get("def").get("icon"),
                    "data": {row["id"]: row["short"] for row in table.get("data_rows", [])}
                }
          
            if table.get("id") == "periods":
                data["periods"] = {
                    "name": table.get("def").get("name"),
                    "item_name": table.get("def").get("item_name"),
                    "icon": table.get("def").get("icon"),
                    "data": {
                        row["id"]: {
                            "name": row.get("name"),
                            "short": row.get("short"),
                            "period": row.get("period"),
                            "start": row.get("starttime"),
                            "end": row.get("endtime")
                        }
                        for row in table.get("data_rows", [])
                    }
                }
            
        if table.get("id") == "infoscreens":
            infoscreens_data = []
            
            for row in table.get("data_rows", []):
                infoscreen = {
                    "id": row.get("id"),
                    "enabled": row.get("enabled", False),
                    "name": row.get("name", ""),
                    "header": row.get("header", ""),
                    "type": row.get("type", ""),
                }
                
                if row.get("iframe") is not None:
                    infoscreen["iframe"] = row.get("iframe")
                if row.get("html") is not None:
                    infoscreen["html"] = row.get("html")
                if row.get("image") is not None:
                    infoscreen["image"] = row.get("image")
                if row.get("photoalbum") is not None:
                    infoscreen["photoalbum"] = row.get("photoalbum")
                if row.get("pdf") is not None:
                    infoscreen["pdf"] = row.get("pdf")
                if row.get("timetable") is not None:
                    infoscreen["timetable"] = row.get("timetable")
                if row.get("substitution") is not None:
                    infoscreen["substitution"] = row.get("substitution")
                if row.get("events") is not None:
                    infoscreen["events"] = row.get("events")
                if row.get("canteen_menu") is not None:
                    infoscreen["canteen_menu"] = row.get("canteen_menu")
                if row.get("combined") is not None:
                    infoscreen["combined"] = row.get("combined")
                if row.get("timed") is not None:
                    infoscreen["timed"] = row.get("timed")
                if row.get("cycled") is not None:
                    infoscreen["cycled"] = row.get("cycled")
                if row.get("multiday") is not None:
                    infoscreen["multiday"] = row.get("multiday")
                
                infoscreens_data.append(infoscreen)
            
            data["infoscreens"] = {
                "name": table.get("def").get("name"),
                "item_name": table.get("def").get("item_name"),
                "icon": table.get("def").get("icon"),
                "data": infoscreens_data
            }

        return data
        
    def fetchInfoscreenEventsData(self):
        r = httpx.post(
            f"https://{self.SCHOOL_SUBDOMAIN}.edupage.org/infoscreen/server/infoscreens.js?__func=getInfoscreenEventsData",
            json={"__args":[None,"5",{"date":datetime.now().strftime('%Y-%m-%d')}],"__gsh":"00000000"},
            cookies=self.cookies,
            headers=self.headers
        )
        
        response_data = r.json()
        
        if "r" in response_data and "rows" in response_data["r"]:
            parsed_data = {
                "table": response_data["r"].get("table"),
                "day_name": response_data["r"].get("day_name"),
                "change_events": response_data["r"].get("_changeEvents", {}),
                "classes": []
            }
            
            for row in response_data["r"]["rows"]:
                class_data = {
                    "id": row.get("id"),
                    "ttitems": []
                }
                
                for item in row.get("ttitems", []):
                    tt_item = {
                        "type": item.get("type"),
                        "date": item.get("date"),
                        "uniperiod": item.get("uniperiod"),
                        "starttime": item.get("starttime"),
                        "endtime": item.get("endtime"),
                    }
                    
                    if "name" in item:
                        tt_item["name"] = item["name"]
                    if "subjectid" in item:
                        tt_item["subjectid"] = item["subjectid"]
                    if "classids" in item:
                        tt_item["classids"] = item["classids"]
                    if "groupnames" in item:
                        tt_item["groupnames"] = item["groupnames"]
                    if "igroupid" in item:
                        tt_item["igroupid"] = item["igroupid"]
                    if "teacherids" in item:
                        tt_item["teacherids"] = item["teacherids"]
                    if "classroomids" in item:
                        tt_item["classroomids"] = item["classroomids"]
                    if "colors" in item:
                        tt_item["colors"] = item["colors"]
                    if "eventid" in item:
                        tt_item["eventid"] = item["eventid"]
                    if "absentid" in item:
                        tt_item["absentid"] = item["absentid"]
                    if "changed" in item:
                        tt_item["changed"] = item["changed"]
                    if "removed" in item:
                        tt_item["removed"] = item["removed"]
                    if "durationperiods" in item:
                        tt_item["durationperiods"] = item["durationperiods"]
                    
                    class_data["ttitems"].append(tt_item)
                
                parsed_data["classes"].append(class_data)
            
            return parsed_data
        
        return response_data
    
    def fetchTimetableData(self):
        r = httpx.post(
            f"https://{self.SCHOOL_SUBDOMAIN}.edupage.org/infoscreen/server/infoscreens.js?__func=getInfoscreenTimetableData",
            json={"__args":[None,"1",{"date":datetime.now().strftime('%Y-%m-%d')}],"__gsh":"00000000"},
            cookies=self.cookies,
            headers=self.headers
        )
        
        response_data = r.json()
        
        if "r" not in response_data:
            return response_data
        
        data = {
            "day_name": response_data["r"].get("day_name"),
            "change_events": response_data["r"].get("_changeEvents", {}),
            "table": response_data["r"].get("table"),
            "classes": []
        }
        
        for row in response_data["r"].get("rows", []):
            class_data = {
                "id": row.get("id"),
                "ttitems": []
            }
            
            for item in row.get("ttitems", []):
                tt_item = {}
                for key, value in item.items():
                    tt_item[key] = value
                class_data["ttitems"].append(tt_item)
            
            data["classes"].append(class_data)
                
        return data

# Class instance
edub = EduBoard()

# Api endpoints
@app.get("/api/data")
def get_all_data():
    return edub.fetchMainDBI()

@app.get("/api/events")
def get_events():
    return edub.fetchInfoscreenEventsData()

@app.get("/api/timetable")
def get_timetable():
    return edub.fetchTimetableData()

# Frontend
app.mount(
    "/",
    StaticFiles(directory=Path(__file__).parent / "frontend" / "dist", html=True),
    name="frontend"
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
