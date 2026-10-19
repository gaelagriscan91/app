# Receipts Basurero (trash): soft-delete, list, restore, permanent purge, 60-day auto purge
import os
import datetime
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/") + "/api"
EMAIL = os.environ.get("TEST_ADMIN_EMAIL")
PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD")
TODAY = datetime.date.today().isoformat()


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        pytest.skip("login failed")
    s.rids = []
    yield s
    for rid in s.rids:
        s.delete(f"{BASE_URL}/receipts/history/{rid}")
        s.delete(f"{BASE_URL}/receipts/trash/{rid}")
    for w in s.get(f"{BASE_URL}/workers").json():
        if w["name"].startswith("TEST_TRASH"):
            for h in s.get(f"{BASE_URL}/harvests", params={"worker_id": w["id"]}).json():
                if h.get("worker_id") == w["id"]:
                    s.delete(f"{BASE_URL}/harvests/{h['id']}")
            s.delete(f"{BASE_URL}/workers/{w['id']}")


@pytest.fixture(scope="module")
def receipt(client):
    sess = client.get(f"{BASE_URL}/checkin-session").json()
    parcel = sess.get("parcelId") or client.get(f"{BASE_URL}/parcels").json()[0]["id"]
    product = sess.get("productId") or client.get(f"{BASE_URL}/products").json()[0]["id"]
    w = client.post(f"{BASE_URL}/workers", json={"name": "TEST_TRASH Empleado"}).json()
    h = client.post(f"{BASE_URL}/harvests", json={
        "worker_id": w["id"], "parcel_id": parcel, "product_id": product, "kilos": 0, "units": 3,
        "price_per_kg": 0, "price_per_unit": 10, "price_mode": "piece", "unit_type": "pieza", "date": TODAY,
        "photo_path": "", "notes": "", "block": "", "variety": "", "mayordomo": ""})
    assert h.status_code == 200, h.text
    r = client.post(f"{BASE_URL}/receipts/history", json={"date_from": TODAY, "date_to": TODAY, "worker_id": w["id"]})
    assert r.status_code == 200, r.text
    client.rids.append(r.json()["id"])
    return r.json()


def _ids(client, path):
    r = client.get(f"{BASE_URL}{path}")
    assert r.status_code == 200, r.text
    return {x["id"]: x for x in r.json()}


def test_delete_moves_to_trash(client, receipt):
    rid = receipt["id"]
    assert client.delete(f"{BASE_URL}/receipts/history/{rid}").status_code == 200
    assert rid not in _ids(client, "/receipts/history")
    trash = _ids(client, "/receipts/trash")
    assert rid in trash
    item = trash[rid]
    assert item.get("deleted_at") and "rows" not in item and "_id" not in item
    assert item["total_payment"] == 30.0


def test_restore(client, receipt):
    rid = receipt["id"]
    r = client.post(f"{BASE_URL}/receipts/trash/{rid}/restore")
    assert r.status_code == 200
    hist = _ids(client, "/receipts/history")
    assert rid in hist and "deleted_at" not in hist[rid]
    assert rid not in _ids(client, "/receipts/trash")
    full = client.get(f"{BASE_URL}/receipts/history/{rid}").json()
    assert full["total_payment"] == 30.0 and full.get("rows")


def test_purge_permanently(client, receipt):
    rid = receipt["id"]
    client.delete(f"{BASE_URL}/receipts/history/{rid}")
    assert client.delete(f"{BASE_URL}/receipts/trash/{rid}").status_code == 200
    assert rid not in _ids(client, "/receipts/trash")
    assert rid not in _ids(client, "/receipts/history")
    assert client.delete(f"{BASE_URL}/receipts/trash/{rid}").status_code == 404
    assert client.post(f"{BASE_URL}/receipts/trash/{rid}/restore").status_code == 404


def test_invalid_ids(client):
    assert client.delete(f"{BASE_URL}/receipts/trash/bad-id").status_code in (400, 404)
    assert client.post(f"{BASE_URL}/receipts/trash/bad-id/restore").status_code in (400, 404)
    assert client.delete(f"{BASE_URL}/receipts/history/000000000000000000000000").status_code == 404


def test_trash_requires_auth():
    assert requests.get(f"{BASE_URL}/receipts/trash").status_code == 401


def test_auto_purge_after_60_days(client):
    me = client.get(f"{BASE_URL}/auth/me").json()
    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    from bson import ObjectId
    owner = ObjectId(me.get("id") or me.get("_id")) if len(str(me.get("id") or me.get("_id"))) == 24 else (me.get("id"))
    # match owner_id type with an existing doc if possible
    sample = db.receipts_history.find_one({}) or db.receipts_trash.find_one({})
    if sample is not None and isinstance(sample.get("owner_id"), str):
        owner = str(owner)
    old = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=61)).isoformat()
    recent = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=59)).isoformat()
    a = db.receipts_trash.insert_one({"owner_id": owner, "note": "TEST_TRASH old", "deleted_at": old,
                                      "date_from": TODAY, "date_to": TODAY, "total_payment": 1, "workers_count": 1}).inserted_id
    b = db.receipts_trash.insert_one({"owner_id": owner, "note": "TEST_TRASH recent", "deleted_at": recent,
                                      "date_from": TODAY, "date_to": TODAY, "total_payment": 1, "workers_count": 1}).inserted_id
    try:
        trash = _ids(client, "/receipts/trash")
        assert str(a) not in trash
        assert db.receipts_trash.find_one({"_id": a}) is None
        assert str(b) in trash
    finally:
        db.receipts_trash.delete_many({"_id": {"$in": [a, b]}})
