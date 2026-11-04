"""Backend tests: /auth/{login,register,refresh} return tokens; Bearer auth works."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "gaelmartin158@gmail.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "agriscan2026")


@pytest.fixture(scope="module")
def login_body():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()


def test_login_returns_tokens(login_body):
    # login returns a flat user object plus access_token, refresh_token, token_type
    assert isinstance(login_body.get("access_token"), str) and len(login_body["access_token"]) > 20
    assert isinstance(login_body.get("refresh_token"), str) and len(login_body["refresh_token"]) > 20
    assert login_body.get("token_type") == "bearer"
    assert login_body.get("email") == ADMIN_EMAIL
    assert login_body.get("role") in ("admin", "user")


def test_login_invalid_credentials():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": "wrong_password_xyz"},
        timeout=20,
    )
    assert r.status_code in (400, 401, 403)
    body = r.json()
    assert "detail" in body


def test_me_with_bearer(login_body):
    token = login_body["access_token"]
    r = requests.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    me = r.json()
    assert me.get("email") == ADMIN_EMAIL
    assert "role" in me


def test_me_without_token():
    r = requests.get(f"{BASE_URL}/api/auth/me", timeout=20)
    assert r.status_code == 401


def test_refresh_with_body_token(login_body):
    refresh = login_body["refresh_token"]
    r = requests.post(
        f"{BASE_URL}/api/auth/refresh",
        json={"refresh_token": refresh},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True
    assert isinstance(data.get("access_token"), str)
    assert isinstance(data.get("refresh_token"), str)
    assert data.get("token_type") == "bearer"
    # New access token must work via Bearer
    me = requests.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {data['access_token']}"},
        timeout=20,
    )
    assert me.status_code == 200


def test_refresh_missing_token_returns_401():
    r = requests.post(f"{BASE_URL}/api/auth/refresh", json={}, timeout=20)
    assert r.status_code == 401


def test_register_returns_tokens_and_cleanup():
    # Create a TEST_ mayordomo, then clean up via admin.
    unique = int(time.time() * 1000)
    email = f"test_mob_{unique}@agriscan-test.com"
    password = "Testpass123!"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": password, "name": "TEST_Mobile Register"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body.get("access_token"), str)
    assert isinstance(body.get("refresh_token"), str)
    assert body.get("token_type") == "bearer"
    assert body.get("email") == email
    created_id = body.get("id")

    # Cleanup: admin login + delete the created mayordomo
    admin = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert admin.status_code == 200
    admin_token = admin.json()["access_token"]
    if created_id:
        d = requests.delete(
            f"{BASE_URL}/api/admin/mayordomos/{created_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=20,
        )
        assert d.status_code in (200, 204, 404)
