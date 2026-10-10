"""Backend tests for Price Lock-in feature (iteration 3)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://harvest-track-94.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ["TEST_ADMIN_EMAIL"]
ADMIN_PASS = os.environ["TEST_ADMIN_PASSWORD"]


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def context(client):
    # Need an existing worker and parcel
    workers = client.get(f"{BASE_URL}/api/workers", timeout=30).json()
    parcels = client.get(f"{BASE_URL}/api/parcels", timeout=30).json()
    assert workers and parcels, "Need existing workers and parcels for admin"
    return {"worker_id": workers[0]["id"], "parcel_id": parcels[0]["id"]}


def _make_product(client, name, **extra):
    payload = {"name": name, "price_per_kg": 0, "price_per_unit": 0, "price_per_hour": 0, "unit_label": "canasta"}
    payload.update(extra)
    r = client.post(f"{BASE_URL}/api/products", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _get_product(client, pid):
    r = client.get(f"{BASE_URL}/api/products", timeout=30)
    assert r.status_code == 200
    for p in r.json():
        if p["id"] == pid:
            return p
    return None


def test_product_accepts_price_per_hour(client):
    p = _make_product(client, "TEST_PPH_Field", price_per_hour=60)
    assert p["price_per_hour"] == 60
    # cleanup
    client.delete(f"{BASE_URL}/api/products/{p['id']}", timeout=30)


def test_piece_mode_lockin_and_persist(client, context):
    prod = _make_product(client, "TEST_LockPiece")
    pid = prod["id"]
    assert prod["price_per_unit"] == 0

    # First harvest: price_per_unit=25, piece mode -> should lock product to 25
    h1 = client.post(f"{BASE_URL}/api/harvests", json={
        "worker_id": context["worker_id"],
        "parcel_id": context["parcel_id"],
        "product_id": pid,
        "kilos": 0, "units": 5,
        "price_per_unit": 25, "price_mode": "piece",
        "date": "2026-02-11",
    }, timeout=30)
    assert h1.status_code == 200, h1.text
    assert h1.json()["payment"] == 125.0

    p_after = _get_product(client, pid)
    assert p_after["price_per_unit"] == 25, f"Expected 25, got {p_after['price_per_unit']}"

    # Second harvest with DIFFERENT price should NOT overwrite the lock
    h2 = client.post(f"{BASE_URL}/api/harvests", json={
        "worker_id": context["worker_id"],
        "parcel_id": context["parcel_id"],
        "product_id": pid,
        "kilos": 0, "units": 3,
        "price_per_unit": 999, "price_mode": "piece",
        "date": "2026-02-12",
    }, timeout=30)
    assert h2.status_code == 200
    # Harvest itself can still carry 999 (snapshot) — the point is product stays locked
    p_locked = _get_product(client, pid)
    assert p_locked["price_per_unit"] == 25, f"LOCK BROKEN: product now {p_locked['price_per_unit']}"

    client.delete(f"{BASE_URL}/api/products/{pid}", timeout=30)


def test_hour_mode_lockin(client, context):
    prod = _make_product(client, "TEST_LockHour")
    pid = prod["id"]
    assert prod["price_per_hour"] == 0

    h = client.post(f"{BASE_URL}/api/harvests", json={
        "worker_id": context["worker_id"],
        "parcel_id": context["parcel_id"],
        "product_id": pid,
        "kilos": 0, "units": 8,
        "price_per_unit": 50, "price_mode": "hour",
        "date": "2026-02-11",
    }, timeout=30)
    assert h.status_code == 200, h.text

    p_after = _get_product(client, pid)
    assert p_after["price_per_hour"] == 50, f"Expected 50, got {p_after['price_per_hour']}"
    # price_per_unit should remain 0 (hour mode shouldn't touch piece field)
    assert p_after["price_per_unit"] == 0

    # Second hour harvest with different price shouldn't overwrite
    client.post(f"{BASE_URL}/api/harvests", json={
        "worker_id": context["worker_id"],
        "parcel_id": context["parcel_id"],
        "product_id": pid,
        "kilos": 0, "units": 4,
        "price_per_unit": 777, "price_mode": "hour",
        "date": "2026-02-12",
    }, timeout=30)
    p_locked = _get_product(client, pid)
    assert p_locked["price_per_hour"] == 50, f"HOUR LOCK BROKEN: {p_locked['price_per_hour']}"

    client.delete(f"{BASE_URL}/api/products/{pid}", timeout=30)


def test_e2e_scenario_from_request(client, context):
    """Exact scenario from review_request: TestLockPrice product."""
    prod = _make_product(client, "TEST_LockPriceE2E")
    pid = prod["id"]
    assert prod["price_per_unit"] == 0

    client.post(f"{BASE_URL}/api/harvests", json={
        "worker_id": context["worker_id"], "parcel_id": context["parcel_id"],
        "product_id": pid, "kilos": 0, "units": 5,
        "price_per_unit": 25, "price_mode": "piece", "date": "2026-02-11",
    }, timeout=30).raise_for_status()
    assert _get_product(client, pid)["price_per_unit"] == 25

    client.post(f"{BASE_URL}/api/harvests", json={
        "worker_id": context["worker_id"], "parcel_id": context["parcel_id"],
        "product_id": pid, "kilos": 0, "units": 2,
        "price_per_unit": 999, "price_mode": "piece", "date": "2026-02-12",
    }, timeout=30).raise_for_status()
    assert _get_product(client, pid)["price_per_unit"] == 25

    client.delete(f"{BASE_URL}/api/products/{pid}", timeout=30)
