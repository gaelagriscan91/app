# Helper: seed / cleanup TEST_PAY data for payroll UI testing. Usage: python payroll_seed.py seed|clean|stale
import os, sys, datetime, json, requests
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")
B = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session()
s.post(f"{B}/auth/login", json={"email": os.environ["TEST_ADMIN_EMAIL"], "password": os.environ["TEST_ADMIN_PASSWORD"]})
T = datetime.date.today(); M = T - datetime.timedelta(days=T.weekday())
D = [(M + datetime.timedelta(days=i)).isoformat() for i in range(7)]
STATE = "/tmp/payroll_seed.json"

if sys.argv[1] == "seed":
    sess = s.get(f"{B}/checkin-session").json()
    parcel = sess.get("parcelId") or s.get(f"{B}/parcels").json()[0]["id"]
    product = sess.get("productId") or s.get(f"{B}/products").json()[0]["id"]
    st = {"rids": [], "hids": []}
    for name, entries in (("TEST_PAY Ana", [(0, 10, 2), (2, 5, 2)]), ("TEST_PAY Beto Con Nombre Largo", [(0, 4, 2), (1, 7, 2)])):
        w = s.post(f"{B}/workers", json={"name": name}).json()
        for di, u, p in entries:
            h = s.post(f"{B}/harvests", json={"worker_id": w["id"], "parcel_id": parcel, "product_id": product, "kilos": 0,
                "units": u, "price_per_kg": 0, "price_per_unit": p, "price_mode": "piece", "unit_type": "pieza", "date": D[di],
                "photo_path": "", "notes": "", "block": "", "variety": "", "mayordomo": "TEST_May", "grower": "TEST_Grower"}).json()
            st["hids"].append(h["id"])
        r = s.post(f"{B}/receipts/history", json={"date_from": D[0], "date_to": D[6], "worker_id": w["id"]})
        st["rids"].append(r.json()["id"])
    json.dump(st, open(STATE, "w"))
    print(s.get(f"{B}/payroll", params={"week": D[0], "grower": "TEST_Grower"}).json())
elif sys.argv[1] == "stale":
    # edit a harvest that is already in a saved receipt; does payroll reflect it?
    st = json.load(open(STATE)); hid = st["hids"][0]
    r = s.put(f"{B}/harvests/{hid}", json={"units": 20, "price_per_unit": 2})
    print("edit", r.status_code, r.text[:200])
    print(s.get(f"{B}/payroll", params={"week": D[0], "grower": "TEST_Grower"}).json()["rows"])
    r = s.delete(f"{B}/harvests/{st['hids'][1]}")
    print("delete", r.status_code)
    print(s.get(f"{B}/payroll", params={"week": D[0], "grower": "TEST_Grower"}).json()["rows"])
else:
    st = json.load(open(STATE)) if os.path.exists(STATE) else {"rids": []}
    for rid in st["rids"]:
        s.delete(f"{B}/receipts/history/{rid}"); s.delete(f"{B}/receipts/trash/{rid}")
    for w in s.get(f"{B}/workers").json():
        if w["name"].startswith("TEST_PAY"):
            for h in s.get(f"{B}/harvests", params={"worker_id": w["id"]}).json():
                if h.get("worker_id") == w["id"]:
                    s.delete(f"{B}/harvests/{h['id']}")
            s.delete(f"{B}/workers/{w['id']}")
    print("cleaned")
