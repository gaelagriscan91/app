"""Backend tests for Attendance-Gate on /api/harvests (iteration 5).

Ensures a harvest cannot be registered for a worker who has no check-in
on data.date (returns 400 'no tiene entrada registrada hoy').
"""
import os
from datetime import datetime, timezone
import requests
import pytest

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://harvest-track-94.preview.emergentagent.com"
).rstrip("/")
ADMIN_EMAIL = "gaelmartin158@gmail.com"
ADMIN_PASS = "agriscan2026"
TODAY = datetime.now(timezone.utc).date().isoformat()


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def parcel_and_product(client):
    parcels = client.get(f"{BASE_URL}/api/parcels", timeout=30).json()
    products = client.get(f"{BASE_URL}/api/products", timeout=30).json()
    assert parcels, "Need existing parcel"
    assert products, "Need existing product"
    return parcels[0]["id"], products[0]["id"]


@pytest.fixture
def fresh_worker(client):
    """Create a fresh worker with no attendance records; cleanup after test."""
    r = client.post(
        f"{BASE_URL}/api/workers",
        json={"name": f"TEST_AttGate_{datetime.now().strftime('%H%M%S%f')}"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    w = r.json()
    yield w
    try:
        client.delete(f"{BASE_URL}/api/workers/{w['id']}", timeout=30)
    except Exception:
        pass


def _harvest_payload(worker_id, parcel_id, product_id, date=TODAY, units=1, price=25):
    return {
        "worker_id": worker_id,
        "parcel_id": parcel_id,
        "product_id": product_id,
        "kilos": 0,
        "units": units,
        "price_per_unit": price,
        "price_mode": "piece",
        "date": date,
    }


# --------------------------- Tests ----------------------------------------

def test_harvest_blocked_without_checkin(client, fresh_worker, parcel_and_product):
    parcel_id, product_id = parcel_and_product
    r = client.post(
        f"{BASE_URL}/api/harvests",
        json=_harvest_payload(fresh_worker["id"], parcel_id, product_id),
        timeout=30,
    )
    assert r.status_code == 400, f"Expected 400 without check-in, got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "")
    assert "no tiene entrada registrada hoy" in detail.lower(), (
        f"Expected Spanish attendance error, got: {detail}"
    )


def test_attendance_check_runs_before_product_check(client, fresh_worker, parcel_and_product):
    """Even with invalid product_id, if worker has no check-in -> attendance error wins."""
    parcel_id, _ = parcel_and_product
    bad_pid = "507f1f77bcf86cd799439011"  # valid ObjectId format, won't exist
    r = client.post(
        f"{BASE_URL}/api/harvests",
        json=_harvest_payload(fresh_worker["id"], parcel_id, bad_pid),
        timeout=30,
    )
    assert r.status_code == 400
    assert "no tiene entrada registrada hoy" in r.json().get("detail", "").lower()


def test_invalid_product_still_returns_producto_no_valido(
    client, fresh_worker, parcel_and_product
):
    """After check-in, invalid product -> 'Producto no válido' (pre-existing path)."""
    parcel_id, _ = parcel_and_product
    # Do check-in for worker today
    scan = client.post(
        f"{BASE_URL}/api/attendance/scan",
        json={"code": fresh_worker["qr_code"]},
        timeout=30,
    )
    assert scan.status_code == 200, scan.text
    bad_pid = "507f1f77bcf86cd799439011"
    r = client.post(
        f"{BASE_URL}/api/harvests",
        json=_harvest_payload(fresh_worker["id"], parcel_id, bad_pid),
        timeout=30,
    )
    assert r.status_code == 400
    assert "producto no válido" in r.json().get("detail", "").lower(), r.text


def test_harvest_succeeds_after_checkin(client, fresh_worker, parcel_and_product):
    parcel_id, product_id = parcel_and_product
    # Check-in
    scan = client.post(
        f"{BASE_URL}/api/attendance/scan",
        json={"code": fresh_worker["qr_code"]},
        timeout=30,
    )
    assert scan.status_code == 200, scan.text
    assert scan.json().get("action") == "check_in"

    r = client.post(
        f"{BASE_URL}/api/harvests",
        json=_harvest_payload(fresh_worker["id"], parcel_id, product_id, units=2, price=10),
        timeout=30,
    )
    assert r.status_code == 200, f"Expected 200 after check-in, got {r.status_code}: {r.text}"
    body = r.json()
    assert body.get("payment") == 20.0
    hid = body.get("id")
    if hid:
        client.delete(f"{BASE_URL}/api/harvests/{hid}", timeout=30)


def test_different_date_without_attendance_blocked(client, fresh_worker, parcel_and_product):
    """Check-in today should NOT satisfy a harvest for a different date."""
    parcel_id, product_id = parcel_and_product
    # Check-in today
    client.post(
        f"{BASE_URL}/api/attendance/scan",
        json={"code": fresh_worker["qr_code"]},
        timeout=30,
    )
    # Try harvest for a future date (no attendance)
    r = client.post(
        f"{BASE_URL}/api/harvests",
        json=_harvest_payload(fresh_worker["id"], parcel_id, product_id, date="2030-01-01"),
        timeout=30,
    )
    assert r.status_code == 400
    assert "no tiene entrada registrada" in r.json().get("detail", "").lower()
