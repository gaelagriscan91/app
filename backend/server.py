from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import re
import uuid
import logging
import secrets as _secrets
import hashlib
import bcrypt
import jwt
import httpx
import requests
from datetime import datetime, timezone, timedelta
from html import escape
from typing import List, Optional, Annotated
from urllib.parse import urlparse

from fastapi import (
    FastAPI, APIRouter, HTTPException, Depends, Request, Response,
    UploadFile, File, Form, Query, Header, BackgroundTasks
)
from fastapi.responses import StreamingResponse, JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from bson import ObjectId
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill

# ---------------------------------------------------------------------------
# MongoDB
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------------------------------------------------------------------------
# App & Router
# ---------------------------------------------------------------------------
app = FastAPI(title="AgriScan API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Object Storage (for photos)
# ---------------------------------------------------------------------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = os.environ.get("APP_NAME", "agriscan")
storage_key = None


def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not available")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120
    )
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not available")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60
    )
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key}, timeout=60
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str, token_version: int = 0) -> str:
    payload = {
        "sub": user_id, "email": email, "ver": token_version,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str, token_version: int = 0) -> str:
    payload = {
        "sub": user_id, "ver": token_version,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


REFRESH_DAYS = 30
TRIAL_DAYS = 3
BLOCKED_DETAIL = "Cuenta bloqueada. Contacta al administrador."


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                        max_age=86400, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                        max_age=REFRESH_DAYS * 86400, path="/")


async def ensure_not_blocked(user: dict):
    """Raise 403 for blocked or expired non-admin accounts."""
    if user.get("role") == "admin":
        return
    exp_iso = user.get("access_expires_at")
    if exp_iso:
        try:
            expired = datetime.now(timezone.utc) > datetime.fromisoformat(exp_iso)
        except Exception:
            expired = False
        if expired:
            if user.get("active") is not False:
                await db.users.update_one({"_id": ObjectId(str(user["_id"]))}, {"$set": {"active": False}})
            raise HTTPException(status_code=403, detail="Acceso vencido. Cuenta bloqueada, contacta al administrador.")
    if user.get("active") is False:
        raise HTTPException(status_code=403, detail=BLOCKED_DETAIL)


async def get_current_user(request: Request) -> dict:
    return await _load_user(request, allow_blocked=False)


async def _load_user(request: Request, allow_blocked: bool) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Tipo de token inválido")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        if payload.get("ver", 0) != user.get("token_version", 0):
            raise HTTPException(status_code=401, detail="Sesión expirada")
        try:
            await ensure_not_blocked(user)
            user["blocked"] = False
        except HTTPException:
            # Blocked accounts may look around (read-only GETs) but cannot save or export
            read_only = request.method == "GET" and "export" not in request.url.path
            if not (allow_blocked or read_only):
                raise
            user["blocked"] = True
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


async def get_current_user_any(request: Request) -> dict:
    """Like get_current_user but lets blocked accounts through (flagged with blocked=True)."""
    return await _load_user(request, allow_blocked=True)


CurrentUser = Annotated[dict, Depends(get_current_user)]
CurrentUserAny = Annotated[dict, Depends(get_current_user_any)]


# ---------------------------------------------------------------------------
# Brute force protection + Password reset email
# ---------------------------------------------------------------------------
LOGIN_MAX_ATTEMPTS = 5
LOGIN_LOCKOUT_MINUTES = 15
RESET_MAX_REQUESTS = 5
RESET_WINDOW_MINUTES = 15

EMAIL_BASE_URL = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip().rstrip("/") or "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME") or "AgriScan"


def _client_ip(request: Request) -> str:
    xf = request.headers.get("x-forwarded-for", "")
    if xf:
        return xf.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def check_login_lockout(ip: str, email: str):
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
    cutoff_iso = cutoff.isoformat()
    identifier = f"{ip}:{email}"
    count = await db.login_attempts.count_documents({
        "identifier": identifier,
        "created_at": {"$gt": cutoff_iso},
    })
    if count >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail=f"Demasiados intentos. Intenta de nuevo en {LOGIN_LOCKOUT_MINUTES} minutos.",
        )


async def record_failed_login(ip: str, email: str):
    identifier = f"{ip}:{email}"
    await db.login_attempts.insert_one({
        "identifier": identifier,
        "email": email,
        "ip": ip,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def clear_login_attempts(ip: str, email: str):
    identifier = f"{ip}:{email}"
    await db.login_attempts.delete_many({"identifier": identifier})


async def send_password_reset_email(to_email: str, token: str) -> bool:
    """Server-side template. Called via BackgroundTasks. Return value is for logging only."""
    base = os.environ.get("FRONTEND_URL", "").rstrip("/")
    link = f"{base}/reset-password?token={token}"
    if not EMAIL_KEY or EMAIL_KEY.startswith("{") or EMAIL_KEY == "ek_8e830dbf65dd33f13bf415c9fa8314cb" or not base.startswith("https://"):
        if urlparse(base).hostname in ("localhost", "127.0.0.1", "::1"):
            logger.warning("Email not configured; password reset link: %s", link)
        else:
            logger.error("Password reset email not configured (EMERGENT_EMAIL_KEY / FRONTEND_URL)")
        return False
    brand = escape(EMAIL_FROM_NAME)
    html = (
        f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
        f'<p>Recibimos una solicitud para restablecer tu contraseña de {brand}.</p>'
        f'<p><a href="{escape(link)}">Restablecer contraseña</a></p>'
        f'<p>Este enlace expira en 1 hora y solo puede usarse una vez. Si no lo solicitaste, '
        f'ignora este correo — tu contraseña no cambió.</p>'
        f'<p style="font-size:12px;color:#888">Enviado por {brand}. Nunca te pediremos tu contraseña por correo.</p>'
        f'</td></tr></table>'
    )
    try:
        async with httpx.AsyncClient(timeout=30) as client_http:
            resp = await client_http.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json={"to": [to_email], "subject": f"Restablecer tu contraseña de {EMAIL_FROM_NAME}",
                      "html": html, "from_name": EMAIL_FROM_NAME},
            )
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Password reset email failed: {e}")
        return False


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class WorkerIn(BaseModel):
    name: str
    document_id: Optional[str] = ""
    phone: Optional[str] = ""
    role: Optional[str] = "Cosechador"
    crew_id: Optional[str] = ""
    active: bool = True


class CrewIn(BaseModel):
    name: str
    boss_worker_id: Optional[str] = ""  # worker id of the crew boss
    worker_ids: List[str] = Field(default_factory=list)
    notes: Optional[str] = ""
    active: bool = True


class AttendanceScanIn(BaseModel):
    code: str
    date: Optional[str] = None


class ParcelIn(BaseModel):
    name: str
    hectares: Optional[float] = 0
    crop_type: Optional[str] = ""
    location: Optional[str] = ""
    active: bool = True


class ProductIn(BaseModel):
    name: str
    price_per_kg: float = 0
    price_per_unit: float = 0
    price_per_hour: float = 0
    unit_label: Optional[str] = "unidad"
    weight_unit: Optional[str] = "kg"  # "kg" | "lb"
    pricing_mode: Optional[str] = "both"  # "unit" | "weight" | "both"
    active: bool = True


class HarvestIn(BaseModel):
    worker_id: str
    parcel_id: str
    product_id: str
    kilos: float = 0
    units: float = 0
    price_per_kg: Optional[float] = None  # overrides product snapshot
    price_per_unit: Optional[float] = None
    price_mode: Optional[str] = "piece"  # "piece" | "hour" — affects which product field to lock-in
    date: str  # YYYY-MM-DD
    photo_path: Optional[str] = ""
    notes: Optional[str] = ""
    block: Optional[str] = ""
    variety: Optional[str] = ""
    mayordomo: Optional[str] = ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def doc_out(d: dict) -> dict:
    d = dict(d)
    if "_id" in d:
        d["id"] = str(d.pop("_id"))
    return d


def today_iso():
    return datetime.now(timezone.utc).date().isoformat()


# ---------------------------------------------------------------------------
# Multi-tenant scoping helpers
# ---------------------------------------------------------------------------
def is_admin(user: dict) -> bool:
    return (user or {}).get("role") == "admin"


def scope_filter(user: dict, field: str = "owner_id") -> dict:
    """Every account (admin included) only sees its own data."""
    return {field: user["_id"]}


def owner_of(user: dict) -> str:
    return user["_id"]


def require_admin(user: dict):
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Solo administradores")


class MayordomoCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Optional[str] = "user"
    active: bool = True
    access_days: Optional[int] = None  # None = unlimited; otherwise auto-block after N days


class MayordomoUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    access_days: Optional[int] = None  # When set, resets access_expires_at = now + N days


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(data: RegisterIn, request: Request, response: Response):
    """Self sign-up for mayordomos. Accounts start BLOCKED until an admin unblocks them."""
    email = data.email.lower().strip()
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Escribe tu nombre")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
    ip = _client_ip(request)
    since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    if await db.register_attempts.count_documents({"ip": ip, "created_at": {"$gt": since}}) >= 5:
        raise HTTPException(status_code=429, detail="Demasiados registros. Intenta más tarde.")
    await db.register_attempts.insert_one({"ip": ip, "created_at": datetime.now(timezone.utc).isoformat()})
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Ese correo ya tiene una cuenta. Inicia sesión.")
    trial_end = (datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)).isoformat()
    doc = {
        "email": email, "name": name, "password_hash": hash_password(data.password),
        "role": "user", "active": True, "self_registered": True, "token_version": 0,
        "unlocked_by": "trial", "trial_ends_at": trial_end, "access_expires_at": trial_end,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    set_auth_cookies(response, create_access_token(uid, email, 0), create_refresh_token(uid, 0))
    return {"id": uid, "email": email, "name": name, "role": "user", "blocked": False, "trial_ends_at": trial_end}


@api_router.post("/auth/login")
async def login(data: LoginIn, request: Request, response: Response):
    email = data.email.lower().strip()
    ip = _client_ip(request)
    await check_login_lockout(ip, email)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        await record_failed_login(ip, email)
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
    await clear_login_attempts(ip, email)
    uid = str(user["_id"])
    ver = user.get("token_version", 0)
    access, refresh = create_access_token(uid, email, ver), create_refresh_token(uid, ver)
    # Blocked/expired accounts can enter the app, but every section is locked
    try:
        await ensure_not_blocked(user)
        is_blocked = False
    except HTTPException:
        is_blocked = True
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": email, "name": user.get("name", ""), "role": user.get("role", "user"), "blocked": is_blocked}


@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    """Issue a new access token from a valid refresh cookie. Never goes through get_current_user."""
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Sin token de refresco")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Tipo de token inválido")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        if payload.get("ver", 0) != user.get("token_version", 0):
            raise HTTPException(status_code=401, detail="Sesión expirada")
        uid = str(user["_id"])
        ver = user.get("token_version", 0)
        # Sliding 30-day session: rotate both tokens on every refresh
        set_auth_cookies(response, create_access_token(uid, user["email"], ver), create_refresh_token(uid, ver))
        return {"ok": True}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


GENERIC_RESET_MSG = {"message": "Si el correo está registrado, te enviaremos un enlace para restablecer tu contraseña."}


@api_router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordIn, background_tasks: BackgroundTasks):
    email = data.email.lower().strip()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    # 1) Record request BEFORE lookup (same work for registered/unregistered)
    await db.password_reset_requests.insert_one({"email": email, "created_at": now_iso})
    # 2) Rate limit per email
    cutoff_iso = (now - timedelta(minutes=RESET_WINDOW_MINUTES)).isoformat()
    recent = await db.password_reset_requests.count_documents({
        "email": email, "created_at": {"$gt": cutoff_iso},
    })
    if recent > RESET_MAX_REQUESTS:
        return GENERIC_RESET_MSG
    # 3) Lookup user
    user = await db.users.find_one({"email": email})
    if not user:
        return GENERIC_RESET_MSG
    # 4) Create token (store hash, never raw)
    raw_token = _secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    await db.password_reset_tokens.insert_one({
        "token_hash": token_hash,
        "user_id": str(user["_id"]),
        "email": email,
        "expires_at": now + timedelta(hours=1),
        "used": False,
    })
    # 5) Queue email send
    background_tasks.add_task(send_password_reset_email, user["email"], raw_token)
    return GENERIC_RESET_MSG


@api_router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordIn):
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
    now = datetime.now(timezone.utc)
    token_hash = hashlib.sha256(data.token.encode()).hexdigest()
    # Atomic claim
    claimed = await db.password_reset_tokens.find_one_and_update(
        {"token_hash": token_hash, "used": False, "expires_at": {"$gt": now}},
        {"$set": {"used": True}},
    )
    if not claimed:
        raise HTTPException(status_code=400, detail="Enlace inválido o expirado")
    user_id = claimed["user_id"]
    email = claimed["email"]
    # Update password + bump token_version to invalidate existing sessions
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"password_hash": hash_password(data.password)},
         "$inc": {"token_version": 1}},
    )
    # Clean up other unused reset tokens for this user
    await db.password_reset_tokens.delete_many({"user_id": user_id, "used": False})
    # Clear brute-force lockout for this email
    await db.login_attempts.delete_many({"email": email})
    return {"ok": True}


@api_router.post("/auth/change-password")
async def change_password(data: ChangePasswordIn, request: Request, response: Response, user: CurrentUserAny):
    """Logged-in user changes own password. Kills other sessions, keeps this one."""
    doc = await db.users.find_one({"_id": ObjectId(user["_id"])})
    ip = _client_ip(request)
    await check_login_lockout(ip, doc["email"])
    if not verify_password(data.current_password, doc["password_hash"]):
        await record_failed_login(ip, doc["email"])
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 6 caracteres")
    ver = (doc.get("token_version", 0) or 0) + 1
    await db.users.update_one({"_id": doc["_id"]}, {"$set": {"password_hash": hash_password(data.new_password), "token_version": ver}})
    await clear_login_attempts(ip, doc["email"])
    uid = str(doc["_id"])
    set_auth_cookies(response, create_access_token(uid, doc["email"], ver), create_refresh_token(uid, ver))
    return {"ok": True}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/", secure=True, httponly=True, samesite="none")
    response.delete_cookie("refresh_token", path="/", secure=True, httponly=True, samesite="none")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: CurrentUserAny):
    on_trial = user.get("unlocked_by") == "trial" and not user.get("blocked")
    return {"id": user["_id"], "email": user["email"], "name": user.get("name", ""), "role": user.get("role", "user"),
            "blocked": user.get("blocked", False), "trial_ends_at": user.get("trial_ends_at") if on_trial else None,
            "trial_used": user.get("unlocked_by") == "trial"}


# ---------------------------------------------------------------------------
# Workers CRUD
# ---------------------------------------------------------------------------
@api_router.get("/workers")
async def list_workers(user: CurrentUser):
    rows = await db.workers.find(scope_filter(user)).sort("name", 1).to_list(1000)
    return [doc_out(r) for r in rows]


def _gen_qr() -> str:
    return f"AGW-{uuid.uuid4().hex[:10].upper()}"


@api_router.post("/workers")
async def create_worker(data: WorkerIn, user: CurrentUser):
    doc = data.model_dump()
    doc["qr_code"] = _gen_qr()
    doc["owner_id"] = owner_of(user)
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.workers.insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc_out(doc)


@api_router.put("/workers/{wid}")
async def update_worker(wid: str, data: WorkerIn, user: CurrentUser):
    existing = await db.workers.find_one({"_id": ObjectId(wid), **scope_filter(user)})
    if not existing:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado")
    upd = data.model_dump()
    if not existing.get("qr_code"):
        upd["qr_code"] = _gen_qr()
    await db.workers.update_one({"_id": ObjectId(wid)}, {"$set": upd})
    row = await db.workers.find_one({"_id": ObjectId(wid)})
    return doc_out(row)


@api_router.post("/workers/{wid}/regenerate-qr")
async def regenerate_qr(wid: str, user: CurrentUser):
    existing = await db.workers.find_one({"_id": ObjectId(wid), **scope_filter(user)})
    if not existing:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado")
    new_qr = _gen_qr()
    await db.workers.update_one({"_id": ObjectId(wid)}, {"$set": {"qr_code": new_qr}})
    row = await db.workers.find_one({"_id": ObjectId(wid)})
    return doc_out(row)


class ResolveQRIn(BaseModel):
    code: str


@api_router.post("/workers/resolve")
async def resolve_worker_qr(data: ResolveQRIn, user: CurrentUser):
    """Resolve a scanned QR to a worker, scoped to the current user.
    Uses the SAME lookup as /attendance/scan so Check-in and Picking behave identically."""
    worker = await _resolve_worker_by_code(data.code, user)
    if not worker:
        raise HTTPException(status_code=404, detail="QR no reconocido")
    return doc_out(worker)


# ---------------------------------------------------------------------------
# Crews (Cuadrillas)
# ---------------------------------------------------------------------------
async def _enrich_crew(c: dict) -> dict:
    out = doc_out(c)
    workers_map = {}
    boss = None
    all_ids = list(set((out.get("worker_ids") or []) + ([out.get("boss_worker_id")] if out.get("boss_worker_id") else [])))
    for wid in all_ids:
        try:
            w = await db.workers.find_one({"_id": ObjectId(wid)})
            if w:
                workers_map[wid] = {"id": str(w["_id"]), "name": w.get("name"), "role": w.get("role", "")}
        except Exception:
            pass
    if out.get("boss_worker_id"):
        boss = workers_map.get(out["boss_worker_id"])
    out["boss"] = boss
    out["workers"] = [workers_map[wid] for wid in (out.get("worker_ids") or []) if wid in workers_map]
    out["worker_count"] = len(out["workers"])
    return out


@api_router.get("/crews")
async def list_crews(user: CurrentUser):
    rows = await db.crews.find(scope_filter(user)).sort("name", 1).to_list(1000)
    return [await _enrich_crew(r) for r in rows]


@api_router.post("/crews")
async def create_crew(data: CrewIn, user: CurrentUser):
    doc = data.model_dump()
    doc["owner_id"] = owner_of(user)
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.crews.insert_one(doc)
    # Backlink crew_id onto workers for easy filtering
    if doc.get("worker_ids"):
        await db.workers.update_many(
            {"_id": {"$in": [ObjectId(w) for w in doc["worker_ids"]]}},
            {"$set": {"crew_id": str(res.inserted_id)}},
        )
    doc["_id"] = res.inserted_id
    return await _enrich_crew(doc)


@api_router.put("/crews/{cid}")
async def update_crew(cid: str, data: CrewIn, user: CurrentUser):
    existing = await db.crews.find_one({"_id": ObjectId(cid), **scope_filter(user)})
    if not existing:
        raise HTTPException(status_code=404, detail="Cuadrilla no encontrada")
    old_workers = set(existing.get("worker_ids", []))
    new_workers = set(data.worker_ids)
    removed = old_workers - new_workers
    added = new_workers - old_workers
    upd = data.model_dump()
    await db.crews.update_one({"_id": ObjectId(cid)}, {"$set": upd})
    # Update worker backlinks
    if removed:
        await db.workers.update_many(
            {"_id": {"$in": [ObjectId(w) for w in removed]}, "crew_id": cid},
            {"$set": {"crew_id": ""}},
        )
    if added:
        await db.workers.update_many(
            {"_id": {"$in": [ObjectId(w) for w in added]}},
            {"$set": {"crew_id": cid}},
        )
    row = await db.crews.find_one({"_id": ObjectId(cid)})
    return await _enrich_crew(row)


@api_router.delete("/crews/{cid}")
async def delete_crew(cid: str, user: CurrentUser):
    existing = await db.crews.find_one({"_id": ObjectId(cid), **scope_filter(user)})
    if not existing:
        raise HTTPException(status_code=404, detail="Cuadrilla no encontrada")
    await db.crews.delete_one({"_id": ObjectId(cid)})
    await db.workers.update_many({"crew_id": cid}, {"$set": {"crew_id": ""}})
    return {"ok": True}


@api_router.delete("/workers/{wid}")
async def delete_worker(wid: str, user: CurrentUser):
    existing = await db.workers.find_one({"_id": ObjectId(wid), **scope_filter(user)})
    if not existing:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado")
    await db.workers.delete_one({"_id": ObjectId(wid)})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Parcels CRUD
# ---------------------------------------------------------------------------
@api_router.get("/parcels")
async def list_parcels(user: CurrentUser):
    rows = await db.parcels.find(scope_filter(user)).sort("name", 1).to_list(1000)
    return [doc_out(r) for r in rows]


@api_router.post("/parcels")
async def create_parcel(data: ParcelIn, user: CurrentUser):
    doc = data.model_dump()
    doc["owner_id"] = owner_of(user)
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.parcels.insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc_out(doc)


@api_router.put("/parcels/{pid}")
async def update_parcel(pid: str, data: ParcelIn, user: CurrentUser):
    existing = await db.parcels.find_one({"_id": ObjectId(pid), **scope_filter(user)})
    if not existing:
        raise HTTPException(status_code=404, detail="Rancho no encontrado")
    await db.parcels.update_one({"_id": ObjectId(pid)}, {"$set": data.model_dump()})
    row = await db.parcels.find_one({"_id": ObjectId(pid)})
    return doc_out(row)


@api_router.delete("/parcels/{pid}")
async def delete_parcel(pid: str, user: CurrentUser):
    existing = await db.parcels.find_one({"_id": ObjectId(pid), **scope_filter(user)})
    if not existing:
        raise HTTPException(status_code=404, detail="Rancho no encontrado")
    await db.parcels.delete_one({"_id": ObjectId(pid)})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Products CRUD
# ---------------------------------------------------------------------------
@api_router.get("/products")
async def list_products(user: CurrentUser):
    rows = await db.products.find(scope_filter(user)).sort("name", 1).to_list(1000)
    return [doc_out(r) for r in rows]


@api_router.post("/products")
async def create_product(data: ProductIn, user: CurrentUser):
    doc = data.model_dump()
    doc["owner_id"] = owner_of(user)
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.products.insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc_out(doc)


@api_router.put("/products/{pid}")
async def update_product(pid: str, data: ProductIn, user: CurrentUser):
    existing = await db.products.find_one({"_id": ObjectId(pid), **scope_filter(user)})
    if not existing:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    await db.products.update_one({"_id": ObjectId(pid)}, {"$set": data.model_dump()})
    row = await db.products.find_one({"_id": ObjectId(pid)})
    return doc_out(row)


@api_router.delete("/products/{pid}")
async def delete_product(pid: str, user: CurrentUser):
    existing = await db.products.find_one({"_id": ObjectId(pid), **scope_filter(user)})
    if not existing:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    await db.products.delete_one({"_id": ObjectId(pid)})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Harvests
# ---------------------------------------------------------------------------
async def _enrich_harvest(h: dict) -> dict:
    out = doc_out(h)
    try:
        w = await db.workers.find_one({"_id": ObjectId(out["worker_id"])})
        out["worker_name"] = w["name"] if w else "—"
    except Exception:
        out["worker_name"] = "—"
    try:
        p = await db.parcels.find_one({"_id": ObjectId(out["parcel_id"])})
        out["parcel_name"] = p["name"] if p else "—"
    except Exception:
        out["parcel_name"] = "—"
    try:
        pr = await db.products.find_one({"_id": ObjectId(out["product_id"])})
        out["product_name"] = pr["name"] if pr else "—"
        out["unit_label"] = pr.get("unit_label", "unidad") if pr else "unidad"
    except Exception:
        out["product_name"] = "—"
        out["unit_label"] = "unidad"
    return out


@api_router.get("/harvests")
async def list_harvests(
    user: CurrentUser,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    worker_id: Optional[str] = None,
    parcel_id: Optional[str] = None,
    product_id: Optional[str] = None,
):
    q: dict = {**scope_filter(user)}
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    if worker_id:
        q["worker_id"] = worker_id
    if parcel_id:
        q["parcel_id"] = parcel_id
    if product_id:
        q["product_id"] = product_id
    rows = await db.harvests.find(q).sort("date", -1).to_list(2000)
    return [await _enrich_harvest(r) for r in rows]


@api_router.post("/harvests")
async def create_harvest(data: HarvestIn, user: CurrentUser):
    # Snapshot pricing from product if not provided
    prod = await db.products.find_one({"_id": ObjectId(data.product_id)})
    if not prod:
        raise HTTPException(status_code=400, detail="Producto no válido")
    mode = (data.price_mode or "piece")

    # Always use the price from the payload (admin/mayordomo can change the price when needed)
    # Fall back to product's stored price if payload omits it (shouldn't happen in UI flow)
    price_per_unit = (
        float(data.price_per_unit)
        if data.price_per_unit is not None
        else float(prod.get("price_per_hour" if mode == "hour" else "price_per_unit", 0) or 0)
    )
    price_per_kg = (
        float(data.price_per_kg)
        if data.price_per_kg is not None
        else float(prod.get("price_per_kg", 0) or 0)
    )

    payment = round(float(data.kilos) * price_per_kg + float(data.units) * price_per_unit, 2)

    # Remember-last-price: always store the latest non-zero price on the product so it pre-loads next time
    remember: dict = {}
    if price_per_unit > 0:
        if mode == "hour":
            remember["price_per_hour"] = price_per_unit
        else:
            remember["price_per_unit"] = price_per_unit
    if price_per_kg > 0:
        remember["price_per_kg"] = price_per_kg
    if remember:
        await db.products.update_one({"_id": ObjectId(data.product_id)}, {"$set": remember})

    doc = {
        "worker_id": data.worker_id,
        "parcel_id": data.parcel_id,
        "product_id": data.product_id,
        "kilos": float(data.kilos),
        "units": float(data.units),
        "price_per_kg": price_per_kg,
        "price_per_unit": price_per_unit,
        "price_mode": mode,
        "payment": payment,
        "date": data.date,
        "photo_path": data.photo_path or "",
        "notes": data.notes or "",
        "block": (data.block or "").strip(),
        "variety": (data.variety or "").strip(),
        "mayordomo": (data.mayordomo or "").strip(),
        "created_by": user["_id"],
        "owner_id": owner_of(user),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.harvests.insert_one(doc)
    doc["_id"] = res.inserted_id
    return await _enrich_harvest(doc)


@api_router.put("/harvests/{hid}")
async def update_harvest(hid: str, data: HarvestIn, user: CurrentUser):
    existing = await db.harvests.find_one({"_id": ObjectId(hid), **scope_filter(user)})
    if not existing:
        raise HTTPException(status_code=404, detail="Cosecha no encontrada")
    prod = await db.products.find_one({"_id": ObjectId(data.product_id)})
    if not prod:
        raise HTTPException(status_code=400, detail="Producto no válido")
    price_per_kg = data.price_per_kg if data.price_per_kg is not None else float(prod.get("price_per_kg", 0))
    price_per_unit = data.price_per_unit if data.price_per_unit is not None else float(prod.get("price_per_unit", 0))
    payment = round(float(data.kilos) * price_per_kg + float(data.units) * price_per_unit, 2)
    upd = {
        "worker_id": data.worker_id, "parcel_id": data.parcel_id, "product_id": data.product_id,
        "kilos": float(data.kilos), "units": float(data.units),
        "price_per_kg": price_per_kg, "price_per_unit": price_per_unit,
        "payment": payment, "date": data.date,
        "photo_path": data.photo_path or "", "notes": data.notes or "",
        "block": (data.block or existing.get("block") or "").strip(),
        "variety": (data.variety or existing.get("variety") or "").strip(),
        "mayordomo": (data.mayordomo or existing.get("mayordomo") or "").strip(),
    }
    await db.harvests.update_one({"_id": ObjectId(hid)}, {"$set": upd})
    row = await db.harvests.find_one({"_id": ObjectId(hid)})
    return await _enrich_harvest(row)


@api_router.delete("/harvests/{hid}")
async def delete_harvest(hid: str, user: CurrentUser):
    existing = await db.harvests.find_one({"_id": ObjectId(hid), **scope_filter(user)})
    if not existing:
        raise HTTPException(status_code=404, detail="Cosecha no encontrada")
    # Protect harvests that are part of a saved receipt (immutable snapshot)
    hdate = existing.get("date", "")
    wid = str(existing.get("worker_id", ""))
    locked = await db.receipts_history.find_one({
        **scope_filter(user),
        "date_from": {"$lte": hdate},
        "date_to": {"$gte": hdate},
        "rows.worker_id": wid,
    })
    if locked:
        raise HTTPException(
            status_code=400,
            detail="No se puede borrar: este registro ya está incluido en un recibo guardado.",
        )
    await db.harvests.delete_one({"_id": ObjectId(hid)})
    return {"ok": True}


@api_router.get("/checkin-session")
async def get_checkin_session(user: CurrentUser):
    doc = await db.checkin_sessions.find_one({"user_id": user["_id"]})
    return (doc or {}).get("data", {})


@api_router.put("/checkin-session")
async def put_checkin_session(data: dict, user: CurrentUser):
    await db.checkin_sessions.update_one(
        {"user_id": user["_id"]},
        {"$set": {"data": data, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


async def _unsaved_activity(user: dict) -> Optional[dict]:
    """Return the date range of activity not yet covered by a saved receipt, or None."""
    scope = scope_filter(user)
    h_last = await db.harvests.find_one(scope, sort=[("created_at", -1)])
    a_last = await db.attendance.find_one(scope, sort=[("_id", -1)])
    if not h_last and not a_last:
        return None
    stamps = []
    if h_last:
        stamps.append(h_last.get("created_at") or "")
    if a_last:
        stamps.append(a_last.get("check_out") or a_last.get("check_in") or "")
    last_activity = max(stamps)
    saved = await db.receipts_history.find_one({**scope, "saved_at": {"$gte": last_activity}})
    if saved:
        return None
    dates = []
    for coll in (db.harvests, db.attendance):
        lo = await coll.find_one(scope, sort=[("date", 1)])
        hi = await coll.find_one(scope, sort=[("date", -1)])
        dates += [d.get("date") for d in (lo, hi) if d and d.get("date")]
    return {"date_from": min(dates), "date_to": max(dates)} if dates else None


@api_router.get("/harvests/reset-check")
async def reset_check(user: CurrentUser):
    pending = await _unsaved_activity(user)
    return {"unsaved": bool(pending), **(pending or {})}


@api_router.post("/harvests/reset")
async def reset_all_harvests(user: CurrentUser, include_attendance: bool = True):
    """Deletes ALL harvests (and optionally attendance) of the current account.
    Requires the activity to be saved as a receipt first."""
    if await _unsaved_activity(user):
        raise HTTPException(status_code=409, detail="Primero guarda tu recibo para no perder la información.")
    scope = scope_filter(user)
    h_del = await db.harvests.delete_many(scope)
    await db.checkin_sessions.delete_many(scope_filter(user, "user_id"))
    a_del = {"deleted_count": 0}
    if include_attendance:
        a_res = await db.attendance.delete_many(scope)
        a_del = {"deleted_count": a_res.deleted_count}
    return {"ok": True, "harvests_deleted": h_del.deleted_count, "attendance_deleted": a_del["deleted_count"]}


# ---------------------------------------------------------------------------
# Daily summary & Dashboard
# ---------------------------------------------------------------------------
@api_router.get("/harvests/daily")
async def daily_summary(user: CurrentUser, date: Optional[str] = None):
    d = date or today_iso()
    rows = await db.harvests.find({"date": d, **scope_filter(user)}).to_list(2000)
    enriched = [await _enrich_harvest(r) for r in rows]
    total_kilos = sum(float(r.get("kilos", 0)) for r in enriched)
    total_units = sum(float(r.get("units", 0)) for r in enriched)
    total_payment = sum(float(r.get("payment", 0)) for r in enriched)

    by_worker: dict = {}
    for r in enriched:
        key = r.get("worker_id")
        if key not in by_worker:
            by_worker[key] = {
                "worker_id": key, "worker_name": r.get("worker_name"),
                "kilos": 0.0, "units": 0.0, "payment": 0.0, "count": 0,
            }
        by_worker[key]["kilos"] += float(r.get("kilos", 0))
        by_worker[key]["units"] += float(r.get("units", 0))
        by_worker[key]["payment"] += float(r.get("payment", 0))
        by_worker[key]["count"] += 1

    return {
        "date": d,
        "total_kilos": round(total_kilos, 2),
        "total_units": round(total_units, 2),
        "total_payment": round(total_payment, 2),
        "by_worker": sorted(by_worker.values(), key=lambda x: -x["payment"]),
        "harvests": enriched,
    }


@api_router.get("/dashboard")
async def dashboard(user: CurrentUser):
    now = datetime.now(timezone.utc).date()
    month_start = now.replace(day=1).isoformat()
    week_start = (now - timedelta(days=6)).isoformat()

    month_rows = await db.harvests.find({"date": {"$gte": month_start}, **scope_filter(user)}).to_list(5000)
    week_rows = await db.harvests.find({"date": {"$gte": week_start}, **scope_filter(user)}).to_list(5000)
    today_rows = await db.harvests.find({"date": now.isoformat(), **scope_filter(user)}).to_list(5000)

    month_kilos = sum(float(r.get("kilos", 0)) for r in month_rows)
    month_payment = sum(float(r.get("payment", 0)) for r in month_rows)
    today_kilos = sum(float(r.get("kilos", 0)) for r in today_rows)
    today_payment = sum(float(r.get("payment", 0)) for r in today_rows)

    workers_count = await db.workers.count_documents({"active": True, **scope_filter(user)})
    parcels_count = await db.parcels.count_documents({"active": True, **scope_filter(user)})
    today = now.isoformat()
    att_today = await db.attendance.find({"date": today, **scope_filter(user)}).to_list(1000)
    present_now = sum(1 for r in att_today if r.get("check_in") and not r.get("check_out"))
    closed_today = sum(1 for r in att_today if r.get("check_in") and r.get("check_out"))

    # Weekly breakdown
    weekly: dict = {}
    for i in range(7):
        d = (now - timedelta(days=6 - i)).isoformat()
        weekly[d] = {"date": d, "kilos": 0.0, "payment": 0.0}
    for r in week_rows:
        d = r.get("date")
        if d in weekly:
            weekly[d]["kilos"] += float(r.get("kilos", 0))
            weekly[d]["payment"] += float(r.get("payment", 0))

    # Full month records enriched (sorted newest first)
    month_sorted = sorted(month_rows, key=lambda r: (r.get("date", ""), str(r.get("_id", ""))), reverse=True)
    month_records = [await _enrich_harvest(r) for r in month_sorted[:500]]

    # Add synthetic "pending" rows for workers with check-in today but no harvest yet
    harvested_today_ids = {str(r.get("worker_id")) for r in today_rows}
    pending_records = []
    for a in att_today:
        if not a.get("check_in"):
            continue
        wid = str(a.get("worker_id") or "")
        if not wid or wid in harvested_today_ids:
            continue
        worker = await db.workers.find_one({"_id": ObjectId(wid)}) if wid else None
        pending_records.append({
            "id": f"pending-{wid}",
            "worker_id": wid,
            "worker_name": (worker or {}).get("name", "—"),
            "date": today,
            "parcel_name": "",
            "product_name": "Sin cosecha aún",
            "kilos": 0,
            "units": 0,
            "payment": 0,
            "pending": True,
        })

    return {
        "today_kilos": round(today_kilos, 2),
        "today_payment": round(today_payment, 2),
        "month_kilos": round(month_kilos, 2),
        "month_payment": round(month_payment, 2),
        "workers_count": workers_count,
        "parcels_count": parcels_count,
        "present_now": present_now,
        "closed_today": closed_today,
        "weekly": list(weekly.values()),
        "month_records": month_records + pending_records,
        "month_records_count": len(month_rows),
        "today_records": [await _enrich_harvest(r) for r in sorted(today_rows, key=lambda r: str(r.get("_id", "")), reverse=True)] + pending_records,
        "today_records_count": len(today_rows),
        "pending_count": len(pending_records),
    }


# ---------------------------------------------------------------------------
# Excel export
# ---------------------------------------------------------------------------
@api_router.get("/harvests/export")
async def export_excel(
    user: CurrentUser,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    worker_id: Optional[str] = None,
    parcel_id: Optional[str] = None,
    product_id: Optional[str] = None,
):
    q: dict = {**scope_filter(user)}
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    if worker_id:
        q["worker_id"] = worker_id
    if parcel_id:
        q["parcel_id"] = parcel_id
    if product_id:
        q["product_id"] = product_id

    rows = await db.harvests.find(q).sort("date", -1).to_list(10000)
    enriched = [await _enrich_harvest(r) for r in rows]

    wb = Workbook()
    ws = wb.active
    ws.title = "Cosechas"
    ws.append([
        "Fecha", "Trabajador", "Parcela", "Block", "Producto", "Variedad",
        "Kilos", "Precio/Kg", "Unidades", "Precio/Unidad",
        "Pago Total ($)", "Notas"
    ])
    for r in enriched:
        ws.append([
            r.get("date", ""),
            r.get("worker_name", ""),
            r.get("parcel_name", ""),
            r.get("block", ""),
            r.get("product_name", ""),
            r.get("variety", ""),
            float(r.get("kilos", 0)),
            float(r.get("price_per_kg", 0)),
            float(r.get("units", 0)),
            float(r.get("price_per_unit", 0)),
            float(r.get("payment", 0)),
            r.get("notes", ""),
        ])
    # Totals row
    total_kilos = sum(float(r.get("kilos", 0)) for r in enriched)
    total_units = sum(float(r.get("units", 0)) for r in enriched)
    total_payment = sum(float(r.get("payment", 0)) for r in enriched)
    ws.append([])
    ws.append(["TOTALES", "", "", "", "", "", total_kilos, "", total_units, "", total_payment, ""])

    for col in ws.columns:
        length = max((len(str(c.value)) for c in col if c.value is not None), default=10)
        ws.column_dimensions[col[0].column_letter].width = min(length + 2, 30)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"reporte_cosechas_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api_router.get("/receipts")
async def receipts(
    user: CurrentUser,
    date_from: str,
    date_to: str,
    worker_id: Optional[str] = None,
    crew_id: Optional[str] = None,
):
    """Returns per-worker summary combining attendance (hours) + harvests (payment)
    for a date range. Used to generate printable pay slips."""
    workers_q = {**scope_filter(user)}
    if worker_id:
        try:
            workers_q["_id"] = ObjectId(worker_id)
        except Exception:
            raise HTTPException(status_code=400, detail="ID de trabajador inválido")
    if crew_id:
        workers_q["crew_id"] = crew_id
    workers = await db.workers.find(workers_q).sort("name", 1).to_list(1000)

    all_harvests = await db.harvests.find({
        "date": {"$gte": date_from, "$lte": date_to}, **scope_filter(user)
    }).to_list(5000)
    all_attendance = await db.attendance.find({
        "date": {"$gte": date_from, "$lte": date_to}, **scope_filter(user)
    }).to_list(5000)

    # Enrich harvests with product/parcel names
    product_cache: dict = {}
    parcel_cache: dict = {}
    for h in all_harvests:
        pid = h.get("product_id")
        if pid and pid not in product_cache:
            try:
                p = await db.products.find_one({"_id": ObjectId(pid)})
                product_cache[pid] = p
            except Exception:
                product_cache[pid] = None
        parid = h.get("parcel_id")
        if parid and parid not in parcel_cache:
            try:
                p = await db.parcels.find_one({"_id": ObjectId(parid)})
                parcel_cache[parid] = p
            except Exception:
                parcel_cache[parid] = None

    result = []
    for w in workers:
        wid = str(w["_id"])
        w_harvests = [h for h in all_harvests if h.get("worker_id") == wid]
        w_attendance = [a for a in all_attendance if a.get("worker_id") == wid]

        total_kilos = round(sum(float(h.get("kilos", 0)) for h in w_harvests), 2)
        total_units = round(sum(float(h.get("units", 0)) for h in w_harvests), 2)
        total_payment = round(sum(float(h.get("payment", 0)) for h in w_harvests), 2)
        total_hours = round(sum(_duration_hours(a.get("check_in"), a.get("check_out")) for a in w_attendance), 2)
        days_worked = len({a.get("date") for a in w_attendance if a.get("check_in")})
        harvest_days = len({h.get("date") for h in w_harvests})

        # Breakdown of harvests
        harvest_lines = []
        for h in sorted(w_harvests, key=lambda x: x.get("date", "")):
            prod = product_cache.get(h.get("product_id"))
            parc = parcel_cache.get(h.get("parcel_id"))
            harvest_lines.append({
                "date": h.get("date"),
                "product_name": prod["name"] if prod else "—",
                "parcel_name": parc["name"] if parc else "—",
                "block": h.get("block", ""),
                "variety": h.get("variety", ""),
                "mayordomo": h.get("mayordomo", ""),
                "kilos": float(h.get("kilos", 0)),
                "units": float(h.get("units", 0)),
                "unit_label": prod.get("unit_label", "u") if prod else "u",
                "price_per_kg": float(h.get("price_per_kg", 0)),
                "price_per_unit": float(h.get("price_per_unit", 0)),
                "payment": float(h.get("payment", 0)),
            })

        attendance_lines = []
        for a in sorted(w_attendance, key=lambda x: x.get("date", "")):
            attendance_lines.append({
                "date": a.get("date"),
                "check_in": _hhmm(a.get("check_in")),
                "check_out": _hhmm(a.get("check_out")),
                "hours": _duration_hours(a.get("check_in"), a.get("check_out")),
            })

        # Skip workers with no activity at all (no attendance AND no harvests)
        if (
            total_payment == 0
            and total_hours == 0
            and total_kilos == 0
            and total_units == 0
            and len(w_attendance) == 0
        ):
            continue

        # Raw ISO times for export use (earliest check_in, latest check_out)
        ci_isos = [a.get("check_in") for a in w_attendance if a.get("check_in")]
        co_isos = [a.get("check_out") for a in w_attendance if a.get("check_out")]
        min_ci_iso = min(ci_isos) if ci_isos else None
        max_co_iso = max(co_isos) if co_isos else None
        still_working = any(a.get("check_in") and not a.get("check_out") for a in w_attendance)

        result.append({
            "worker_id": wid,
            "worker_name": w.get("name"),
            "document_id": w.get("document_id", ""),
            "role": w.get("role", ""),
            "date_from": date_from,
            "date_to": date_to,
            "min_check_in_iso": min_ci_iso,
            "max_check_out_iso": max_co_iso,
            "still_working": still_working,
            "total_kilos": total_kilos,
            "total_units": total_units,
            "total_payment": total_payment,
            "total_hours": total_hours,
            "days_worked": days_worked,
            "harvest_days": harvest_days,
            "harvests": harvest_lines,
            "attendance": attendance_lines,
        })
    return result


def _hhmm_local(iso_ts: Optional[str], tz_offset_minutes: int = 0) -> str:
    """Format an ISO timestamp as HH:MM shifted by tz_offset_minutes (minutes east of UTC)."""
    if not iso_ts:
        return ""
    try:
        dt = datetime.fromisoformat(iso_ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        local = dt.astimezone(timezone.utc) + timedelta(minutes=tz_offset_minutes)
        return local.strftime("%H:%M")
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Receipts Export — aggregated per worker (one row per trabajador)
# ---------------------------------------------------------------------------
@api_router.get("/receipts/export")
async def receipts_export(
    user: CurrentUser,
    date_from: str,
    date_to: str,
    worker_id: Optional[str] = None,
    crew_id: Optional[str] = None,
    tz_offset: int = 0,
    block: Optional[str] = "",
    variety: Optional[str] = "",
    mayordomo: Optional[str] = "",
    rancho: Optional[str] = "",
    trabajo: Optional[str] = "",
    price: Optional[float] = None,
):
    """Excel receipt: header (Ranch/Block/Trabajo/Variedad/Mayordomo) + one row per worker.
    `tz_offset` is minutes east of UTC. block/variety/mayordomo are fallbacks from the device session."""
    rows = await receipts(user=user, date_from=date_from, date_to=date_to, worker_id=worker_id, crew_id=crew_id)
    now_iso = datetime.now(timezone.utc).isoformat()

    def _uniq(key: str) -> str:
        vals = []
        for r in rows:
            for h in r.get("harvests", []):
                v = (h.get(key) or "").strip()
                if v and v != "—" and v not in vals:
                    vals.append(v)
        return ", ".join(vals)

    def _time_local(iso_ts: Optional[str]) -> str:
        if not iso_ts:
            return ""
        try:
            dt = datetime.fromisoformat(iso_ts)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            local = dt.astimezone(timezone.utc) + timedelta(minutes=tz_offset)
            h12 = local.hour % 12 or 12
            return f"{h12}:{local.minute:02d}:{local.second:02d} {'a.m.' if local.hour < 12 else 'p.m.'}"
        except Exception:
            return ""

    def _fmt_date(d: str) -> str:
        try:
            y, m, dd = d.split("-")
            return f"{int(m)}/{int(dd)}/{y}"
        except Exception:
            return d or ""

    def _fmt_hours(h: float) -> str:
        total_min = int(round(float(h or 0) * 60))
        hh, mm = divmod(total_min, 60)
        return f"{hh}h {mm}min" if hh > 0 else f"{mm}min"

    same_day = date_from == date_to
    sess = ((await db.checkin_sessions.find_one({"user_id": user["_id"]})) or {}).get("data", {}) or {}
    sess_price = sess.get("pricePerHour") if sess.get("unitMode") == "horas" else sess.get("pricePerUnit")
    try:
        session_price = float(sess_price or price or 0)
    except (TypeError, ValueError):
        session_price = float(price or 0)

    def _pick(sess_val: Optional[str], key: str) -> str:
        s = str(sess_val or "").strip()
        return s or _uniq(key)

    header_vals = {
        "ranch": _pick(sess.get("ranchoName") or rancho, "parcel_name"),
        "block": _pick(sess.get("block") or block, "block"),
        "trabajo": _pick(sess.get("trabajoName") or trabajo, "product_name"),
        "variety": _pick(sess.get("variedad") or variety, "variety"),
        "mayordomo": _pick(sess.get("mayordomo") or mayordomo, "mayordomo"),
    }

    wb = Workbook()
    ws = wb.active
    ws.title = "Recibos"
    bold = Font(bold=True, size=12)
    thin = Side(style="thin", color="999999")
    box = Border(left=thin, right=thin, top=thin, bottom=thin)
    underline = Border(bottom=Side(style="thin", color="000000"))

    def _label(cell: str, text: str, value: str, merge_to: Optional[str] = None):
        ws[cell] = text
        ws[cell].font = bold
        ws[cell].alignment = Alignment(horizontal="right", vertical="bottom")
        col = ws[cell].column
        vcell = ws.cell(row=ws[cell].row, column=col + 1, value=value)
        vcell.alignment = Alignment(horizontal="center", vertical="bottom")
        last = ws[merge_to].column if merge_to else col + 1
        for c in range(col + 1, last + 1):
            ws.cell(row=ws[cell].row, column=c).border = underline
        if merge_to:
            ws.merge_cells(start_row=ws[cell].row, start_column=col + 1, end_row=ws[cell].row, end_column=last)

    _label("A2", "RANCH", header_vals["ranch"], "C2")
    _label("D2", "BLOCK#", header_vals["block"], "F2")
    _label("G2", "Trabajo", header_vals["trabajo"], "I2")
    _label("A3", "Variedad", header_vals["variety"], "B3")
    _label("C3", "Mayordomo", header_vals["mayordomo"], "F3")
    ws.row_dimensions[2].height = 24
    ws.row_dimensions[3].height = 24

    headers = ["SS#", "EMPLOYEE  NAME", "Hora entrada", "Fecha", "Hora Salida",
               "Total Horas", "Total piezas", "Precio", "$"]
    hdr_row = 5
    grey = PatternFill("solid", fgColor="BFC1C2")
    for i, t in enumerate(headers, start=1):
        c = ws.cell(row=hdr_row, column=i, value=t)
        c.font = Font(bold=True, size=11)
        c.fill = grey
        c.border = box
        c.alignment = Alignment(horizontal="right" if i == 2 else "left", vertical="top", wrap_text=True)
    ws.row_dimensions[hdr_row].height = 42

    money = '"$"#,##0.00'
    r_idx = hdr_row
    for r in rows:
        r_idx += 1
        total_units = float(r.get("total_units", 0))
        total_payment = float(r.get("total_payment", 0))
        prices = {float(h.get("price_per_unit", 0)) for h in r.get("harvests", []) if float(h.get("price_per_unit", 0)) > 0}
        price = prices.pop() if len(prices) == 1 else (round(total_payment / total_units, 2) if total_units > 0 else float(session_price))
        entrada = _time_local(r.get("min_check_in_iso"))
        if r.get("max_check_out_iso") and not r.get("still_working"):
            salida = _time_local(r.get("max_check_out_iso"))
        elif r.get("min_check_in_iso"):
            salida = _time_local(now_iso)
        else:
            salida = ""
        dates = sorted({a.get("date") for a in r.get("attendance", []) if a.get("date")} |
                       {h.get("date") for h in r.get("harvests", []) if h.get("date")})
        if not dates:
            fecha = _fmt_date(date_from) if same_day else f"{_fmt_date(date_from)} - {_fmt_date(date_to)}"
        elif dates[0] == dates[-1]:
            fecha = _fmt_date(dates[0])
        else:
            fecha = f"{_fmt_date(dates[0])} - {_fmt_date(dates[-1])}"
        ss = (r.get("document_id") or "").strip()
        values = [
            int(ss) if ss.isdigit() else ss,
            (r.get("worker_name") or "").strip(),
            entrada, fecha, salida,
            _fmt_hours(r.get("total_hours", 0)),
            int(total_units) if total_units == int(total_units) else round(total_units, 2),
            price,
            total_payment,
        ]
        for i, v in enumerate(values, start=1):
            c = ws.cell(row=r_idx, column=i, value=v)
            c.border = box
            c.font = Font(size=11)
            c.alignment = Alignment(horizontal="right" if i in (1, 6, 7, 8, 9) else "left", vertical="center")
            if i in (8, 9):
                c.number_format = money
        ws.row_dimensions[r_idx].height = 30

    for letter, w in zip("ABCDEFGHI", [12, 26, 14, 12, 14, 12, 10, 10, 11]):
        ws.column_dimensions[letter].width = w

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"recibos_{date_from}_a_{date_to}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Receipts History — persisted snapshots the user can review later
# ---------------------------------------------------------------------------
class ReceiptSaveIn(BaseModel):
    date_from: str
    date_to: str
    worker_id: Optional[str] = None
    crew_id: Optional[str] = None
    note: Optional[str] = ""


@api_router.post("/receipts/history")
async def save_receipt_history(payload: ReceiptSaveIn, user: CurrentUser):
    """Store a snapshot of the current receipts for later review."""
    rows = await receipts(
        user=user,
        date_from=payload.date_from,
        date_to=payload.date_to,
        worker_id=payload.worker_id,
        crew_id=payload.crew_id,
    )
    if not rows:
        raise HTTPException(status_code=400, detail="No hay actividad para guardar en este periodo")

    total_hours = round(sum(float(r.get("total_hours", 0)) for r in rows), 2)
    total_kilos = round(sum(float(r.get("total_kilos", 0)) for r in rows), 2)
    total_units = round(sum(float(r.get("total_units", 0)) for r in rows), 2)
    total_payment = round(sum(float(r.get("total_payment", 0)) for r in rows), 2)

    # Collect unique parcel + product names across all workers' harvests
    parcel_set = []
    product_set = []
    for r in rows:
        for h in r.get("harvests", []) or []:
            pn = (h.get("parcel_name") or "").strip()
            if pn and pn != "—" and pn not in parcel_set:
                parcel_set.append(pn)
            prd = (h.get("product_name") or "").strip()
            if prd and prd != "—" and prd not in product_set:
                product_set.append(prd)

    doc = {
        "owner_id": user["_id"],
        "saved_by_email": user.get("email", ""),
        "saved_by_name": user.get("name") or user.get("email", ""),
        "saved_by_role": user.get("role", ""),
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "date_from": payload.date_from,
        "date_to": payload.date_to,
        "worker_id": payload.worker_id,
        "crew_id": payload.crew_id,
        "note": (payload.note or "").strip(),
        "workers_count": len(rows),
        "total_hours": total_hours,
        "total_kilos": total_kilos,
        "total_units": total_units,
        "total_payment": total_payment,
        "parcels": parcel_set,
        "products": product_set,
        "rows": rows,
    }
    res = await db.receipts_history.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return doc


@api_router.get("/receipts/history")
async def list_receipt_history(user: CurrentUser):
    cursor = db.receipts_history.find({**scope_filter(user)}).sort("saved_at", -1).limit(500)
    out = []
    async for d in cursor:
        d["id"] = str(d.pop("_id"))
        # Trim heavy row payload for the list view
        d.pop("rows", None)
        out.append(d)
    return out


@api_router.get("/receipts/history/{hid}")
async def get_receipt_history(hid: str, user: CurrentUser):
    try:
        d = await db.receipts_history.find_one({"_id": ObjectId(hid), **scope_filter(user)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")
    if not d:
        raise HTTPException(status_code=404, detail="No encontrado")
    d["id"] = str(d.pop("_id"))
    return d


@api_router.delete("/receipts/history/{hid}")
async def delete_receipt_history(hid: str, user: CurrentUser):
    try:
        res = await db.receipts_history.delete_one({"_id": ObjectId(hid), **scope_filter(user)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido")
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No encontrado")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Attendance (Asistencia) - Entrada / Salida
# ---------------------------------------------------------------------------
def _hhmm(iso_ts: Optional[str]) -> str:
    if not iso_ts:
        return ""
    try:
        dt = datetime.fromisoformat(iso_ts)
        return dt.strftime("%H:%M")
    except Exception:
        return ""


def _duration_hours(ci: Optional[str], co: Optional[str]) -> float:
    """Hours between check_in and check_out. If still 'en campo' (no check_out),
    counts up to current UTC time so partial hours are reflected everywhere."""
    if not ci:
        return 0.0
    try:
        a = datetime.fromisoformat(ci)
        if co:
            b = datetime.fromisoformat(co)
        else:
            # Ensure tz-aware subtraction regardless of ci having tz info or not
            b = datetime.now(a.tzinfo) if a.tzinfo else datetime.utcnow()
        secs = max(0.0, (b - a).total_seconds())
        return round(secs / 3600.0, 2)
    except Exception:
        return 0.0


async def _resolve_worker_by_code(code: str, user: Optional[dict] = None) -> Optional[dict]:
    raw = (code or "").strip()
    if not raw:
        return None
    # Strip URL/scheme prefix: "agriscan://worker/AGW-xxx" or "https://x/w/AGW-xxx" -> "AGW-xxx"
    extracted = raw
    if "/" in extracted:
        extracted = [p for p in extracted.split("/") if p][-1]
    if ":" in extracted:
        extracted = extracted.split(":")[-1]
    extracted = extracted.strip()
    upper = extracted.upper()

    scope = scope_filter(user) if user else {}
    logger.info(f"[resolve_worker] code_raw={raw!r} extracted={extracted!r} upper={upper!r} scope={scope} user={user.get('email') if user else None}")

    # Try qr_code field with case-insensitive match on normalized value
    w = await db.workers.find_one({"qr_code": upper, **scope})
    if w:
        logger.info(f"[resolve_worker] HIT upper qr_code={upper!r}")
        return w
    # Try original (in case qr_code is stored differently)
    w = await db.workers.find_one({"qr_code": extracted, **scope})
    if w:
        logger.info(f"[resolve_worker] HIT extracted qr_code={extracted!r}")
        return w
    # Case-insensitive regex fallback on qr_code
    w = await db.workers.find_one({"qr_code": {"$regex": f"^{re.escape(extracted)}$", "$options": "i"}, **scope})
    if w:
        logger.info(f"[resolve_worker] HIT regex qr_code={extracted!r}")
        return w
    # Fallback: treat as ObjectId
    try:
        w = await db.workers.find_one({"_id": ObjectId(extracted), **scope})
        if w:
            logger.info(f"[resolve_worker] HIT ObjectId")
            return w
    except Exception:
        pass
    # Last fallback: document_id or name exact match (case-insensitive)
    found = await db.workers.find_one({"$and": [
        scope or {},
        {"$or": [
            {"document_id": extracted},
            {"document_id": {"$regex": f"^{re.escape(extracted)}$", "$options": "i"}},
            {"name": extracted},
        ]},
    ]})
    if found:
        logger.info(f"[resolve_worker] HIT document_id/name fallback")
    else:
        logger.warning(f"[resolve_worker] MISS — no worker for code {extracted!r}")
    return found


@api_router.post("/attendance/scan")
async def attendance_scan(data: AttendanceScanIn, user: CurrentUser):
    date = data.date or today_iso()
    worker = await _resolve_worker_by_code(data.code, user)
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado para ese código")

    wid = str(worker["_id"])
    now_iso = datetime.now(timezone.utc).isoformat()
    row = await db.attendance.find_one({"worker_id": wid, "date": date, **scope_filter(user)})
    action = ""

    if not row:
        doc = {
            "worker_id": wid,
            "worker_name": worker.get("name", ""),
            "date": date,
            "check_in": now_iso,
            "check_out": None,
            "created_by": user["_id"],
            "owner_id": owner_of(user),
        }
        res = await db.attendance.insert_one(doc)
        doc["_id"] = res.inserted_id
        action = "check_in"
        row = doc
    elif not row.get("check_out"):
        await db.attendance.update_one({"_id": row["_id"]}, {"$set": {"check_out": now_iso}})
        row = await db.attendance.find_one({"_id": row["_id"]})
        action = "check_out"
    else:
        raise HTTPException(
            status_code=400,
            detail=f"{worker.get('name')} ya cerró su jornada hoy ({_hhmm(row.get('check_in'))} - {_hhmm(row.get('check_out'))})",
        )

    out = doc_out(row)
    out["action"] = action
    out["worker_name"] = worker.get("name", "")
    out["check_in_hhmm"] = _hhmm(out.get("check_in"))
    out["check_out_hhmm"] = _hhmm(out.get("check_out"))
    out["hours"] = _duration_hours(out.get("check_in"), out.get("check_out"))
    return out


@api_router.get("/attendance")
async def list_attendance(user: CurrentUser, date: Optional[str] = None):
    d = date or today_iso()
    rows = await db.attendance.find({"date": d, **scope_filter(user)}).to_list(2000)
    out = []
    for r in rows:
        o = doc_out(r)
        o["check_in_hhmm"] = _hhmm(o.get("check_in"))
        o["check_out_hhmm"] = _hhmm(o.get("check_out"))
        o["hours"] = _duration_hours(o.get("check_in"), o.get("check_out"))
        out.append(o)
    out.sort(key=lambda x: x.get("check_in") or "")

    present = sum(1 for r in out if r.get("check_in") and not r.get("check_out"))
    closed = sum(1 for r in out if r.get("check_in") and r.get("check_out"))
    total_hours = round(sum(float(r.get("hours") or 0) for r in out), 2)
    return {
        "date": d,
        "rows": out,
        "present": present,
        "closed": closed,
        "total": len(out),
        "total_hours": total_hours,
    }


@api_router.delete("/attendance/{aid}")
async def delete_attendance(aid: str, user: CurrentUser):
    existing = await db.attendance.find_one({"_id": ObjectId(aid), **scope_filter(user)})
    if not existing:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    await db.attendance.delete_one({"_id": ObjectId(aid)})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Admin: Mayordomos management (admin-only)
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Billing: PayPal monthly subscription ($29.99) — auto unblock / block
# ---------------------------------------------------------------------------
PLAN_PRICE = "29.99"


def _paypal_base() -> str:
    return "https://api-m.paypal.com" if os.environ.get("PAYPAL_MODE") == "live" else "https://api-m.sandbox.paypal.com"


def paypal_configured() -> bool:
    return bool(os.environ.get("PAYPAL_CLIENT_ID") and os.environ.get("PAYPAL_SECRET"))


async def _paypal_token(client: httpx.AsyncClient) -> str:
    r = await client.post(
        f"{_paypal_base()}/v1/oauth2/token",
        auth=(os.environ["PAYPAL_CLIENT_ID"], os.environ["PAYPAL_SECRET"]),
        data={"grant_type": "client_credentials"},
    )
    r.raise_for_status()
    return r.json()["access_token"]


async def _paypal(method: str, path: str, json_body: Optional[dict] = None) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        token = await _paypal_token(client)
        r = await client.request(method, f"{_paypal_base()}{path}", json=json_body,
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        if r.status_code >= 400:
            logger.error(f"PayPal {method} {path} -> {r.status_code}: {r.text[:400]}")
            raise HTTPException(status_code=502, detail="PayPal no respondió. Intenta de nuevo.")
        return r.json() if r.content else {}


async def _plan_id() -> str:
    """Use PAYPAL_PLAN_ID, or create (once) a product + $29.99/month plan and cache it in Mongo."""
    env_plan = os.environ.get("PAYPAL_PLAN_ID")
    if env_plan:
        return env_plan
    mode = os.environ.get("PAYPAL_MODE") or "sandbox"
    cached = await db.billing_config.find_one({"key": f"plan_{mode}"})
    if cached:
        return cached["plan_id"]
    product = await _paypal("POST", "/v1/catalogs/products", {"name": "AgriScan", "type": "SERVICE", "category": "SOFTWARE"})
    plan = await _paypal("POST", "/v1/billing/plans", {
        "product_id": product["id"], "name": "AgriScan mensual", "status": "ACTIVE",
        "billing_cycles": [{
            "frequency": {"interval_unit": "MONTH", "interval_count": 1},
            "tenure_type": "REGULAR", "sequence": 1, "total_cycles": 0,
            "pricing_scheme": {"fixed_price": {"value": PLAN_PRICE, "currency_code": "USD"}},
        }],
        "payment_preferences": {"auto_bill_outstanding": True, "payment_failure_threshold": 1},
    })
    await db.billing_config.insert_one({"key": f"plan_{mode}", "plan_id": plan["id"], "product_id": product["id"]})
    return plan["id"]


async def _apply_subscription(sub: dict):
    """Sync a PayPal subscription onto its user (custom_id = user id)."""
    uid = sub.get("custom_id")
    if not uid or not ObjectId.is_valid(uid):
        return
    status = sub.get("status", "")
    next_bill = (sub.get("billing_info") or {}).get("next_billing_time")
    upd = {"subscription_id": sub.get("id"), "subscription_status": status,
           "subscription_checked_at": datetime.now(timezone.utc).isoformat()}
    if status == "ACTIVE":
        upd.update({"active": True, "unlocked_by": "paypal", "access_expires_at": None})
        if next_bill:
            # 2-day grace so a late renewal webhook doesn't block a paying user
            upd["paid_until"] = (datetime.fromisoformat(next_bill.replace("Z", "+00:00")) + timedelta(days=2)).isoformat()
    await db.users.update_one({"_id": ObjectId(uid)}, {"$set": upd})
    if status in ("CANCELLED", "SUSPENDED", "EXPIRED"):
        u = await db.users.find_one({"_id": ObjectId(uid)})
        if u and u.get("unlocked_by") == "paypal" and u.get("role") != "admin":
            # Keep access until the period already paid ends
            until = u.get("paid_until")
            if until and datetime.fromisoformat(until) > datetime.now(timezone.utc):
                await db.users.update_one({"_id": u["_id"]}, {"$set": {"access_expires_at": until}})
            else:
                await db.users.update_one({"_id": u["_id"]}, {"$set": {"active": False}})


class BillingConfirmIn(BaseModel):
    subscription_id: str


@api_router.get("/billing/status")
async def billing_status(user: CurrentUserAny):
    u = await db.users.find_one({"_id": ObjectId(user["_id"])})
    sub_id = u.get("subscription_id")
    # Re-sync from PayPal at most every 6h (backup for missed webhooks)
    checked = u.get("subscription_checked_at")
    stale = not checked or datetime.now(timezone.utc) - datetime.fromisoformat(checked) > timedelta(hours=6)
    if sub_id and paypal_configured() and stale:
        try:
            await _apply_subscription(await _paypal("GET", f"/v1/billing/subscriptions/{sub_id}"))
            u = await db.users.find_one({"_id": u["_id"]})
        except HTTPException:
            pass
    return {
        "configured": paypal_configured(), "price": PLAN_PRICE, "currency": "USD",
        "status": u.get("subscription_status") or "", "subscription_id": sub_id or "",
        "paid_until": u.get("paid_until") or "", "blocked": user.get("blocked", False),
    }


@api_router.post("/billing/subscribe")
async def billing_subscribe(user: CurrentUserAny):
    if not paypal_configured():
        raise HTTPException(status_code=503, detail="Los pagos con PayPal aún no están activados.")
    base = os.environ["FRONTEND_URL"].rstrip("/")
    sub = await _paypal("POST", "/v1/billing/subscriptions", {
        "plan_id": await _plan_id(), "custom_id": user["_id"],
        "subscriber": {"email_address": user["email"]},
        "application_context": {
            "brand_name": "AgriScan", "locale": "es-MX", "user_action": "SUBSCRIBE_NOW",
            "shipping_preference": "NO_SHIPPING",
            "return_url": f"{base}/?billing=return", "cancel_url": f"{base}/?billing=cancel",
        },
    })
    approve = next((lk["href"] for lk in sub.get("links", []) if lk.get("rel") == "approve"), "")
    await db.users.update_one({"_id": ObjectId(user["_id"])}, {"$set": {"subscription_id": sub["id"], "subscription_status": sub.get("status", "")}})
    return {"approve_url": approve, "subscription_id": sub["id"]}


@api_router.post("/billing/confirm")
async def billing_confirm(data: BillingConfirmIn, user: CurrentUserAny):
    if not paypal_configured():
        raise HTTPException(status_code=503, detail="Los pagos con PayPal aún no están activados.")
    sub = await _paypal("GET", f"/v1/billing/subscriptions/{data.subscription_id}")
    if sub.get("custom_id") != user["_id"]:
        raise HTTPException(status_code=403, detail="Esta suscripción no es tuya")
    await _apply_subscription(sub)
    return {"status": sub.get("status", ""), "active": sub.get("status") == "ACTIVE"}


@api_router.post("/billing/cancel")
async def billing_cancel(user: CurrentUserAny):
    u = await db.users.find_one({"_id": ObjectId(user["_id"])})
    sub_id = u.get("subscription_id")
    if not sub_id or not paypal_configured():
        raise HTTPException(status_code=400, detail="No tienes una suscripción activa")
    await _paypal("POST", f"/v1/billing/subscriptions/{sub_id}/cancel", {"reason": "Cancelado por el usuario en AgriScan"})
    await _apply_subscription(await _paypal("GET", f"/v1/billing/subscriptions/{sub_id}"))
    u = await db.users.find_one({"_id": u["_id"]})
    return {"ok": True, "paid_until": u.get("paid_until") or ""}


@api_router.post("/billing/paypal-webhook")
async def paypal_webhook(request: Request):
    body = await request.json()
    webhook_id = os.environ.get("PAYPAL_WEBHOOK_ID")
    if not (paypal_configured() and webhook_id):
        raise HTTPException(status_code=503, detail="Webhook no configurado")
    h = request.headers
    check = await _paypal("POST", "/v1/notifications/verify-webhook-signature", {
        "auth_algo": h.get("paypal-auth-algo"), "cert_url": h.get("paypal-cert-url"),
        "transmission_id": h.get("paypal-transmission-id"), "transmission_sig": h.get("paypal-transmission-sig"),
        "transmission_time": h.get("paypal-transmission-time"), "webhook_id": webhook_id, "webhook_event": body,
    })
    if check.get("verification_status") != "SUCCESS":
        raise HTTPException(status_code=400, detail="Firma inválida")
    event = body.get("event_type", "")
    res = body.get("resource") or {}
    sub_id = res.get("id") if event.startswith("BILLING.SUBSCRIPTION") else res.get("billing_agreement_id")
    if sub_id:
        # Always re-read the subscription from PayPal instead of trusting the payload
        await _apply_subscription(await _paypal("GET", f"/v1/billing/subscriptions/{sub_id}"))
    return {"ok": True}


@api_router.get("/admin/mayordomos")
async def admin_list_mayordomos(user: CurrentUser):
    require_admin(user)
    rows = await db.users.find({}).sort("created_at", -1).to_list(1000)
    out = []
    for r in rows:
        r.pop("password_hash", None)
        d = doc_out(r)
        out.append(d)
    return out


@api_router.post("/admin/mayordomos")
async def admin_create_mayordomo(data: MayordomoCreate, user: CurrentUser):
    require_admin(user)
    email = data.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="El correo ya está registrado")
    now = datetime.now(timezone.utc)
    doc = {
        "email": email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "role": data.role or "user",
        "active": data.active,
        "token_version": 0,
        "created_by": user["_id"],
        "created_at": now.isoformat(),
    }
    if data.access_days is not None and data.access_days > 0:
        doc["access_days"] = int(data.access_days)
        doc["access_expires_at"] = (now + timedelta(days=int(data.access_days))).isoformat()
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    doc.pop("password_hash", None)
    return doc_out(doc)


@api_router.patch("/admin/mayordomos/{uid}")
async def admin_update_mayordomo(uid: str, data: MayordomoUpdate, user: CurrentUser):
    require_admin(user)
    existing = await db.users.find_one({"_id": ObjectId(uid)})
    if not existing:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    upd: dict = {}
    if data.name is not None:
        upd["name"] = data.name
    if data.role is not None:
        upd["role"] = data.role
    if data.active is not None:
        upd["active"] = data.active
        if data.active and data.access_days is None and existing.get("unlocked_by") == "trial":
            # Admin unblock ends the free-trial countdown
            upd["access_expires_at"] = None
            upd["unlocked_by"] = "admin"
    if data.password:
        upd["password_hash"] = hash_password(data.password)
        upd["token_version"] = (existing.get("token_version", 0) or 0) + 1
    if data.access_days is not None:
        now = datetime.now(timezone.utc)
        if data.access_days <= 0:
            upd["access_days"] = None
            upd["access_expires_at"] = None
        else:
            upd["access_days"] = int(data.access_days)
            upd["access_expires_at"] = (now + timedelta(days=int(data.access_days))).isoformat()
    if not upd:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    await db.users.update_one({"_id": ObjectId(uid)}, {"$set": upd})
    row = await db.users.find_one({"_id": ObjectId(uid)})
    row.pop("password_hash", None)
    return doc_out(row)


@api_router.delete("/admin/mayordomos/{uid}")
async def admin_delete_mayordomo(uid: str, user: CurrentUser):
    require_admin(user)
    if str(uid) == str(user["_id"]):
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")
    existing = await db.users.find_one({"_id": ObjectId(uid)})
    if not existing:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    # Remove the account and all of its data (admin never takes over other users' data)
    for coll in ["workers", "parcels", "products", "harvests", "attendance", "crews", "receipts_history"]:
        await db[coll].delete_many({"owner_id": uid})
    await db.checkin_sessions.delete_many({"user_id": uid})
    await db.users.delete_one({"_id": ObjectId(uid)})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Photo upload
# ---------------------------------------------------------------------------
@api_router.post("/upload")
async def upload_photo(file: UploadFile = File(...), user: CurrentUser = None):
    ext = (file.filename or "img").split(".")[-1].lower() if "." in (file.filename or "") else "jpg"
    if ext not in {"jpg", "jpeg", "png", "webp", "gif"}:
        ext = "jpg"
    path = f"{APP_NAME}/uploads/{user['_id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    result = put_object(path, data, file.content_type or f"image/{ext}")
    await db.files.insert_one({
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type or f"image/{ext}",
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "owner": user["_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"path": result["path"]}


@api_router.get("/files/{path:path}")
async def download_file(path: str, request: Request, auth: Optional[str] = Query(None)):
    # Allow via Bearer header or ?auth= token
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token and auth:
        token = auth
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")

    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    data, content_type = get_object(path)
    return Response(content=data, media_type=record.get("content_type", content_type))


# ---------------------------------------------------------------------------
# Seed admin + demo data
# ---------------------------------------------------------------------------
async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    admin_name = os.environ.get("ADMIN_NAME", "Administrador")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": admin_name,
            "role": "admin",
            "token_version": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Admin creado: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password), "name": admin_name}},
        )


async def seed_demo():
    if await db.workers.count_documents({}) == 0:
        await db.workers.insert_many([
            {"name": "Juan Pérez", "document_id": "V-12345678", "phone": "555-0101",
             "role": "Cosechador", "active": True,
             "created_at": datetime.now(timezone.utc).isoformat()},
            {"name": "María López", "document_id": "V-23456789", "phone": "555-0102",
             "role": "Cosechador", "active": True,
             "created_at": datetime.now(timezone.utc).isoformat()},
            {"name": "Carlos Ruiz", "document_id": "V-34567890", "phone": "555-0103",
             "role": "Supervisor", "active": True,
             "created_at": datetime.now(timezone.utc).isoformat()},
        ])
    if await db.parcels.count_documents({}) == 0:
        await db.parcels.insert_many([
            {"name": "Parcela A - Norte", "hectares": 5.5, "crop_type": "Tomate",
             "location": "Sector Norte", "active": True,
             "created_at": datetime.now(timezone.utc).isoformat()},
            {"name": "Parcela B - Sur", "hectares": 3.2, "crop_type": "Fresa",
             "location": "Sector Sur", "active": True,
             "created_at": datetime.now(timezone.utc).isoformat()},
            {"name": "Parcela C - Este", "hectares": 8.0, "crop_type": "Aguacate",
             "location": "Sector Este", "active": True,
             "created_at": datetime.now(timezone.utc).isoformat()},
        ])
    if await db.products.count_documents({}) == 0:
        await db.products.insert_many([
            {"name": "Cherry", "price_per_kg": 0, "price_per_unit": 25.0,
             "unit_label": "canasta", "weight_unit": "kg", "pricing_mode": "unit",
             "active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"name": "Naranja", "price_per_kg": 8.0, "price_per_unit": 0,
             "unit_label": "arpilla", "weight_unit": "kg", "pricing_mode": "weight",
             "active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"name": "Mandarina", "price_per_kg": 10.0, "price_per_unit": 0,
             "unit_label": "caja", "weight_unit": "lb", "pricing_mode": "weight",
             "active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"name": "Durazno", "price_per_kg": 15.0, "price_per_unit": 20.0,
             "unit_label": "caja", "weight_unit": "kg", "pricing_mode": "both",
             "active": True, "created_at": datetime.now(timezone.utc).isoformat()},
        ])


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
async def backfill_worker_qr():
    cursor = db.workers.find({"$or": [{"qr_code": {"$exists": False}}, {"qr_code": None}, {"qr_code": ""}]})
    async for w in cursor:
        await db.workers.update_one({"_id": w["_id"]}, {"$set": {"qr_code": _gen_qr()}})


async def backfill_owner_id():
    """Assign all pre-existing records without owner_id to the first admin."""
    admin = await db.users.find_one({"role": "admin"})
    if not admin:
        return
    aid = str(admin["_id"])
    for coll in ["workers", "parcels", "products", "harvests", "attendance", "crews"]:
        await db[coll].update_many(
            {"$or": [{"owner_id": {"$exists": False}}, {"owner_id": None}, {"owner_id": ""}]},
            {"$set": {"owner_id": aid}},
        )


@app.on_event("startup")
async def startup_event():
    await db.users.create_index("email", unique=True)
    await db.attendance.create_index([("worker_id", 1), ("date", 1)], unique=True)
    await db.workers.create_index("qr_code")
    # Auth brute-force + password reset
    await db.login_attempts.create_index("identifier")
    await db.login_attempts.create_index("email")
    try:
        await db.password_reset_tokens.create_index("token_hash", unique=True)
        await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    except Exception:
        pass
    await db.password_reset_requests.create_index("email")
    try:
        await db.password_reset_requests.create_index("created_at", expireAfterSeconds=900)
    except Exception:
        pass
    await seed_admin()
    await seed_demo()
    await backfill_worker_qr()
    await backfill_owner_id()
    try:
        init_storage()
        logger.info("Object storage inicializado")
    except Exception as e:
        logger.warning(f"Storage init opcional falló: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# ---------------------------------------------------------------------------
# Router + CORS
# ---------------------------------------------------------------------------
app.include_router(api_router)


# Kubernetes liveness/readiness probe — must be reachable without /api prefix
@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/health")
async def api_health_check():
    return {"status": "ok"}


frontend_url = os.environ.get("FRONTEND_URL", "")
cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",")]
if frontend_url and frontend_url not in cors_origins:
    cors_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins if cors_origins != ["*"] else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
