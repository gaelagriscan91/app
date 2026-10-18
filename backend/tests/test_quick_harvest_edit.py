# QuickHarvest: manual employee creation + edit/delete harvest records (PUT/DELETE /api/harvests/{id})
import os
import datetime
import pytest
import requests

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
    yield s
    # cleanup TEST_ workers + their harvests
    for w in s.get(f"{BASE_URL}/workers").json():
        if w["name"].startswith("TEST_"):
            for h in s.get(f"{BASE_URL}/harvests", params={"worker_id": w["id"]}).json():
                if h.get("worker_id") == w["id"]:
                    s.delete(f"{BASE_URL}/harvests/{h['id']}")
            s.delete(f"{BASE_URL}/workers/{w['id']}")


@pytest.fixture(scope="module")
def ctx(client):
    sess = client.get(f"{BASE_URL}/checkin-session").json()
    parcel = sess.get("parcelId") or client.get(f"{BASE_URL}/parcels").json()[0]["id"]
    product = sess.get("productId") or client.get(f"{BASE_URL}/products").json()[0]["id"]
    w = client.post(f"{BASE_URL}/workers", json={"name": "TEST_Manual Worker"})
    assert w.status_code == 200, w.text
    return {"parcel": parcel, "product": product, "worker": w.json()}


def _payload(ctx, units, price=10.0):
    return {"worker_id": ctx["worker"]["id"], "parcel_id": ctx["parcel"], "product_id": ctx["product"],
            "kilos": 0, "units": units, "price_per_kg": 0, "price_per_unit": price, "price_mode": "piece",
            "date": TODAY, "photo_path": "", "notes": "Cosecha escaneada", "block": "", "variety": "", "mayordomo": ""}


def test_worker_created_name_only(ctx, client):
    w = ctx["worker"]
    assert w["name"] == "TEST_Manual Worker" and isinstance(w["id"], str)
    ids = [x["id"] for x in client.get(f"{BASE_URL}/workers").json()]
    assert w["id"] in ids


def test_create_edit_delete_harvest(ctx, client):
    r = client.post(f"{BASE_URL}/harvests", json=_payload(ctx, 1))
    assert r.status_code == 200, r.text
    h = r.json()
    assert h["units"] == 1 and h["payment"] == 10.0
    hid = h["id"]
    rows = client.get(f"{BASE_URL}/harvests", params={"date_from": TODAY, "date_to": TODAY}).json()
    assert any(x["id"] == hid for x in rows)

    u = client.put(f"{BASE_URL}/harvests/{hid}", json=_payload(ctx, 2.5))
    assert u.status_code == 200, u.text
    assert u.json()["units"] == 2.5 and u.json()["payment"] == 25.0
    rows = client.get(f"{BASE_URL}/harvests", params={"date_from": TODAY, "date_to": TODAY}).json()
    got = next(x for x in rows if x["id"] == hid)
    assert got["units"] == 2.5 and got["payment"] == 25.0 and got["price_per_unit"] == 10.0

    d = client.delete(f"{BASE_URL}/harvests/{hid}")
    assert d.status_code == 200 and d.json()["ok"] is True
    rows = client.get(f"{BASE_URL}/harvests", params={"date_from": TODAY, "date_to": TODAY}).json()
    assert not any(x["id"] == hid for x in rows)
    assert client.delete(f"{BASE_URL}/harvests/{hid}").status_code == 404


def test_put_unknown_harvest_404(ctx, client):
    r = client.put(f"{BASE_URL}/harvests/000000000000000000000000", json=_payload(ctx, 1))
    assert r.status_code == 404


def test_invalid_id_returns_4xx(client):
    r = client.delete(f"{BASE_URL}/harvests/not-an-id")
    assert r.status_code in (400, 404, 422), f"got {r.status_code}"


def test_unauth_delete_rejected(ctx):
    r = requests.delete(f"{BASE_URL}/harvests/000000000000000000000000")
    assert r.status_code in (401, 403)


def test_locked_by_receipt(ctx, client):
    # Harvest included in saved receipt -> DELETE blocked (400); PUT should also be blocked for consistency
    h = client.post(f"{BASE_URL}/harvests", json=_payload(ctx, 1)).json()
    rc = client.post(f"{BASE_URL}/receipts/history", json={"date_from": TODAY, "date_to": TODAY, "worker_id": ctx["worker"]["id"], "note": "TEST_lock"})
    assert rc.status_code == 200, rc.text
    rid = rc.json()["id"]
    try:
        d = client.delete(f"{BASE_URL}/harvests/{h['id']}")
        assert d.status_code == 400 and "recibo" in d.json()["detail"]
        u = client.put(f"{BASE_URL}/harvests/{h['id']}", json=_payload(ctx, 5))
        assert u.status_code == 400, f"PUT on locked record returned {u.status_code} (edit allowed, receipt snapshot diverges)"
    finally:
        client.delete(f"{BASE_URL}/receipts/history/{rid}")
        client.delete(f"{BASE_URL}/harvests/{h['id']}")
