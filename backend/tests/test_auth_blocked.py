"""
Backend tests for self-registration + blocked account flow (sliding 30-day session).
Covers: /auth/register, /auth/login (blocked), /auth/me 403, admin block/unblock,
/auth/refresh rotation, duplicate email, short password.
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if os.environ.get('REACT_APP_BACKEND_URL') else None
if not BASE_URL:
    # Fallback: read from frontend/.env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
                break

ADMIN_EMAIL = os.environ["TEST_ADMIN_EMAIL"]
ADMIN_PASS = os.environ["TEST_ADMIN_PASSWORD"]

# Direct mongo access to clean register_attempts rate limiting
def _env(key):
    v = os.environ.get(key)
    if v:
        return v.strip().strip('"').strip("'")
    for line in open('/app/backend/.env'):
        if line.startswith(key + '='):
            return line.split('=', 1)[1].strip().strip('"').strip("'")
    return None

MONGO_URL = _env('MONGO_URL')
DB_NAME = _env('DB_NAME')
mongo = MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return s


@pytest.fixture(scope="module")
def created_users():
    """Track created test users, cleanup at end."""
    users = []
    yield users
    # Clear rate limit
    mongo.register_attempts.delete_many({})
    # Delete via admin
    s = requests.Session()
    s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    for uid in users:
        try:
            s.delete(f"{BASE_URL}/api/admin/mayordomos/{uid}")
        except Exception:
            pass


def _unique_email():
    return f"test_{uuid.uuid4().hex[:8]}@agriscan-test.com"


def test_register_creates_blocked_user(created_users):
    mongo.register_attempts.delete_many({})
    s = requests.Session()
    email = _unique_email()
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"email": email, "password": "secret123", "name": "Test User"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert not data.get("blocked")  # new accounts start with a 3-day free trial
    assert data.get("email") == email
    assert "id" in data
    created_users.append(data["id"])
    # Cookies set
    assert "access_token" in s.cookies
    assert "refresh_token" in s.cookies
    # /auth/me should 403 blocked
    me = s.get(f"{BASE_URL}/api/auth/me")
    assert me.status_code == 403, me.text
    assert "bloqueada" in me.json().get("detail", "").lower()
    # /api/workers also 403
    w = s.get(f"{BASE_URL}/api/workers")
    assert w.status_code == 403


def test_register_duplicate_email(created_users):
    mongo.register_attempts.delete_many({})
    s = requests.Session()
    email = _unique_email()
    r1 = s.post(f"{BASE_URL}/api/auth/register",
                json={"email": email, "password": "secret123", "name": "Dup"})
    assert r1.status_code == 200
    created_users.append(r1.json()["id"])
    mongo.register_attempts.delete_many({})
    s2 = requests.Session()
    r2 = s2.post(f"{BASE_URL}/api/auth/register",
                 json={"email": email, "password": "secret123", "name": "Dup2"})
    assert r2.status_code == 400
    assert "ya tiene" in r2.json().get("detail", "").lower() or "existe" in r2.json().get("detail", "").lower()


def test_register_short_password():
    mongo.register_attempts.delete_many({})
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"email": _unique_email(), "password": "123", "name": "Short"})
    assert r.status_code == 400
    assert "6" in r.json().get("detail", "")


def test_blocked_login_returns_403_with_cookies(created_users):
    mongo.register_attempts.delete_many({})
    email = _unique_email()
    pwd = "secret123"
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"email": email, "password": pwd, "name": "Blocked Login"})
    assert r.status_code == 200
    uid = r.json()["id"]
    created_users.append(uid)
    # Fresh session to login
    s2 = requests.Session()
    rl = s2.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd})
    assert rl.status_code == 403, rl.text
    assert "bloqueada" in rl.json().get("detail", "").lower()
    # Cookies still set
    assert "access_token" in s2.cookies
    assert "refresh_token" in s2.cookies
    # me returns 403
    me = s2.get(f"{BASE_URL}/api/auth/me")
    assert me.status_code == 403


def test_admin_unblock_grants_access(admin_session, created_users):
    mongo.register_attempts.delete_many({})
    email = _unique_email()
    pwd = "secret123"
    user_sess = requests.Session()
    r = user_sess.post(f"{BASE_URL}/api/auth/register",
                       json={"email": email, "password": pwd, "name": "ToUnblock"})
    assert r.status_code == 200
    uid = r.json()["id"]
    created_users.append(uid)
    # user is blocked
    assert user_sess.get(f"{BASE_URL}/api/auth/me").status_code == 403
    # admin unblocks
    rp = admin_session.patch(f"{BASE_URL}/api/admin/mayordomos/{uid}",
                             json={"active": True, "name": "ToUnblock"})
    assert rp.status_code == 200, rp.text
    # Same cookies now 200
    me = user_sess.get(f"{BASE_URL}/api/auth/me")
    assert me.status_code == 200, me.text
    assert me.json().get("email") == email


def test_admin_block_active_user_kicks(admin_session, created_users):
    mongo.register_attempts.delete_many({})
    email = _unique_email()
    pwd = "secret123"
    user_sess = requests.Session()
    r = user_sess.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": pwd, "name": "ActiveThenBlocked"})
    assert r.status_code == 200
    uid = r.json()["id"]
    created_users.append(uid)
    # Unblock
    admin_session.patch(f"{BASE_URL}/api/admin/mayordomos/{uid}",
                        json={"active": True, "name": "ActiveThenBlocked"})
    assert user_sess.get(f"{BASE_URL}/api/auth/me").status_code == 200
    # Admin blocks
    admin_session.patch(f"{BASE_URL}/api/admin/mayordomos/{uid}",
                        json={"active": False, "name": "ActiveThenBlocked"})
    me = user_sess.get(f"{BASE_URL}/api/auth/me")
    assert me.status_code == 403, me.text
    assert "bloqueada" in me.json().get("detail", "").lower()


def test_refresh_rotates_both_cookies(admin_session, created_users):
    mongo.register_attempts.delete_many({})
    email = _unique_email()
    pwd = "secret123"
    user_sess = requests.Session()
    r = user_sess.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": pwd, "name": "Refresher"})
    uid = r.json()["id"]
    created_users.append(uid)
    admin_session.patch(f"{BASE_URL}/api/admin/mayordomos/{uid}",
                        json={"active": True, "name": "Refresher"})
    # grab initial cookies
    old_access = user_sess.cookies.get("access_token")
    old_refresh = user_sess.cookies.get("refresh_token")
    # Call refresh directly with requests to inspect Set-Cookie headers
    rr = user_sess.post(f"{BASE_URL}/api/auth/refresh")
    assert rr.status_code == 200, rr.text
    # Check Set-Cookie contains both tokens with Max-Age
    set_cookies = rr.headers.get("set-cookie", "") or ""
    # requests merges multiple headers; use raw
    raw = rr.raw.headers.getlist("Set-Cookie") if hasattr(rr.raw, 'headers') else [set_cookies]
    joined = " | ".join(raw)
    assert "access_token=" in joined
    assert "refresh_token=" in joined
    # 30 days = 2592000 seconds
    assert "2592000" in joined or "Max-Age=2592000" in joined.lower() or "max-age=2592000" in joined.lower()
    # New cookies in jar
    new_access = user_sess.cookies.get("access_token")
    new_refresh = user_sess.cookies.get("refresh_token")
    assert new_access and new_access != old_access
    assert new_refresh and new_refresh != old_refresh


def test_admin_login_normal(admin_session):
    me = admin_session.get(f"{BASE_URL}/api/auth/me")
    assert me.status_code == 200
    assert me.json().get("role") == "admin"


def test_mayordomos_list_contains_registered(admin_session, created_users):
    if not created_users:
        pytest.skip("no users created")
    r = admin_session.get(f"{BASE_URL}/api/admin/mayordomos")
    assert r.status_code == 200
    ids = [u.get("id") for u in r.json()]
    # at least one of ours present
    assert any(uid in ids for uid in created_users)
