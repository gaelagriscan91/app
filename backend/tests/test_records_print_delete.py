# Records print/delete: unit_type persistence + delete/edit propagation to receipts snapshots & reports
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
    s.created_receipts = []
    yield s
    for rid in s.created_receipts:
        s.delete(f"{BASE_URL}/receipts/history/{rid}")
        s.delete(f"{BASE_URL}/receipts/trash/{rid}")
    for w in s.get(f"{BASE_URL}/workers").json():
        if w["name"].startswith("TEST_RPD"):
            for h in s.get(f"{BASE_URL}/harvests", params={"worker_id": w["id"]}).json():
                if h.get("worker_id") == w["id"]:
                    s.delete(f"{BASE_URL}/harvests/{h['id']}")
            s.delete(f"{BASE_URL}/workers/{w['id']}")


@pytest.fixture(scope="module")
def ctx(client):
    sess = client.get(f"{BASE_URL}/checkin-session").json()
    parcel = sess.get("parcelId") or client.get(f"{BASE_URL}/parcels").json()[0]["id"]
    product = sess.get("productId") or client.get(f"{BASE_URL}/products").json()[0]["id"]
    w = client.post(f"{BASE_URL}/workers", json={"name": "TEST_RPD Worker"})
    assert w.status_code == 200, w.text
    return {"parcel": parcel, "product": product, "worker": w.json()}


def _p(ctx, units, unit_type="pieza", price=10.0):
    return {"worker_id": ctx["worker"]["id"], "parcel_id": ctx["parcel"], "product_id": ctx["product"],
            "kilos": 0, "units": units, "price_per_kg": 0, "price_per_unit": price, "price_mode": "piece",
            "unit_type": unit_type, "date": TODAY, "photo_path": "", "notes": "Cosecha escaneada",
            "block": "", "variety": "", "mayordomo": ""}


def _receipt_row(client, wid):
    rows = client.get(f"{BASE_URL}/receipts", params={"date_from": TODAY, "date_to": TODAY, "worker_id": wid}).json()
    return rows[0] if rows else None


def test_unit_type_stored(ctx, client):
    a = client.post(f"{BASE_URL}/harvests", json=_p(ctx, 2, "libra")).json()
    b = client.post(f"{BASE_URL}/harvests", json=_p(ctx, 3, "pieza")).json()
    assert a["unit_type"] == "libra" and b["unit_type"] == "pieza"
    rows = client.get(f"{BASE_URL}/harvests", params={"date_from": TODAY, "date_to": TODAY}).json()
    got = {x["id"]: x for x in rows}
    assert got[a["id"]]["unit_type"] == "libra" and got[b["id"]]["unit_type"] == "pieza"
    ctx["a"], ctx["b"] = a["id"], b["id"]


def test_saved_receipt_then_delete_propagates(ctx, client):
    wid = ctx["worker"]["id"]
    r = client.post(f"{BASE_URL}/receipts/history", json={"date_from": TODAY, "date_to": TODAY, "worker_id": wid})
    assert r.status_code == 200, r.text
    snap = r.json()
    client.created_receipts.append(snap["id"])
    assert snap["total_payment"] == 50.0 and snap["total_units"] == 5.0
    # delete the libra harvest (covered by receipt)
    d = client.delete(f"{BASE_URL}/harvests/{ctx['a']}")
    assert d.status_code == 200, d.text
    s2 = client.get(f"{BASE_URL}/receipts/history/{snap['id']}").json()
    assert s2["total_payment"] == 30.0 and s2["total_units"] == 3.0
    hids = [h.get("id") for row in s2["rows"] for h in row.get("harvests", [])]
    assert ctx["a"] not in hids
    # live receipts
    row = _receipt_row(client, wid)
    assert row and row["total_payment"] == 30.0
    # harvests list / daily / export
    rows = client.get(f"{BASE_URL}/harvests", params={"date_from": TODAY, "date_to": TODAY}).json()
    assert not any(x["id"] == ctx["a"] for x in rows)
    daily = client.get(f"{BASE_URL}/harvests/daily", params={"date": TODAY})
    assert daily.status_code == 200
    assert ctx["a"] not in daily.text
    ex = client.get(f"{BASE_URL}/harvests/export", params={"date_from": TODAY, "date_to": TODAY})
    assert ex.status_code == 200


def test_edit_propagates_to_snapshot(ctx, client):
    rid = client.created_receipts[0]
    u = client.put(f"{BASE_URL}/harvests/{ctx['b']}", json=_p(ctx, 4, "pieza"))
    assert u.status_code == 200, u.text
    assert u.json()["payment"] == 40.0 and u.json()["unit_type"] == "pieza"
    s = client.get(f"{BASE_URL}/receipts/history/{rid}").json()
    assert s["total_payment"] == 40.0 and s["total_units"] == 4.0
    lst = client.get(f"{BASE_URL}/receipts/history").json()
    item = next(x for x in lst if x["id"] == rid)
    assert item["total_payment"] == 40.0


def test_delete_last_harvest_snapshot_zeroes(ctx, client):
    rid = client.created_receipts[0]
    assert client.delete(f"{BASE_URL}/harvests/{ctx['b']}").status_code == 200
    s = client.get(f"{BASE_URL}/receipts/history/{rid}")
    assert s.status_code == 200
    assert s.json()["total_payment"] == 0
    assert client.delete(f"{BASE_URL}/harvests/{ctx['b']}").status_code == 404


def test_put_preserves_unit_type_when_omitted(ctx, client):
    h = client.post(f"{BASE_URL}/harvests", json=_p(ctx, 1, "libra")).json()
    p = _p(ctx, 2)
    p.pop("unit_type")
    u = client.put(f"{BASE_URL}/harvests/{h['id']}", json=p)
    assert u.status_code == 200 and u.json()["unit_type"] == "libra"


def test_invalid_id(client):
    assert client.delete(f"{BASE_URL}/harvests/not-an-id").status_code == 400
