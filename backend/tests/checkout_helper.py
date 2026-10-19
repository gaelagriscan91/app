# Helper for Check-out UI testing: state | seed | clean
import os, sys, requests
from datetime import datetime
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session()
r = s.post(f"{BASE}/auth/login", json={"email": os.environ["TEST_ADMIN_EMAIL"], "password": os.environ["TEST_ADMIN_PASSWORD"]})
r.raise_for_status()
cmd = sys.argv[1]
date = sys.argv[2] if len(sys.argv) > 2 else datetime.now().strftime("%Y-%m-%d")
att = s.get(f"{BASE}/attendance", params={"date": date}).json()
workers = s.get(f"{BASE}/workers").json()
if cmd == "state":
    print("date", date, "rows", len(att["rows"]), "present", att["present"], "closed", att["closed"])
    for row in att["rows"]:
        print(" ", row["id"], row["worker_name"], row.get("check_in_hhmm"), row.get("check_out_hhmm"))
    print("workers", len(workers), [w["name"] for w in workers if w["name"].startswith("TEST_")])
    print("session", s.get(f"{BASE}/checkin-session", params={"date": date}).status_code)
elif cmd == "seed":
    for n in ["TEST_CO_Ana", "TEST_CO_Beto", "TEST_CO_Caro"]:
        if not any(w["name"] == n for w in workers):
            print(s.post(f"{BASE}/workers", json={"name": n}).json()["id"], n)
elif cmd == "clean":
    tids = {w["id"] for w in workers if w["name"].startswith("TEST_")}
    for row in att["rows"]:
        if row["worker_id"] in tids:
            print("del att", row["id"], s.delete(f"{BASE}/attendance/{row['id']}").status_code)
    for wid in tids:
        print("del worker", wid, s.delete(f"{BASE}/workers/{wid}").status_code)
