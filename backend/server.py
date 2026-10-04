from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import re
import uuid
import logging
import bcrypt
import jwt
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated

from fastapi import (
    FastAPI, APIRouter, HTTPException, Depends, Request, Response,
    UploadFile, File, Form, Query, Header
)
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from bson import ObjectId
from openpyxl import Workbook

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
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                        max_age=86400, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                        max_age=604800, path="/")


async def get_current_user(request: Request) -> dict:
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
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


CurrentUser = Annotated[dict, Depends(get_current_user)]


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
    """Admin sees everything; regular users only their own data."""
    if is_admin(user):
        return {}
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


class MayordomoUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(data: RegisterIn, response: Response):
    # Public registration is DISABLED. Only admins can create mayordomo accounts
    # via POST /api/admin/mayordomos.
    raise HTTPException(
        status_code=403,
        detail="El registro público está deshabilitado. Pide a tu administrador que te cree una cuenta.",
    )


@api_router.post("/auth/login")
async def login(data: LoginIn, response: Response):
    email = data.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
    uid = str(user["_id"])
    ver = user.get("token_version", 0)
    access = create_access_token(uid, email, ver)
    refresh = create_refresh_token(uid, ver)
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": email, "name": user.get("name", ""), "role": user.get("role", "user")}


@api_router.post("/auth/logout")
async def logout(response: Response, user: CurrentUser):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: CurrentUser):
    return {"id": user["_id"], "email": user["email"], "name": user.get("name", ""), "role": user.get("role", "user")}


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
    }
    await db.harvests.update_one({"_id": ObjectId(hid)}, {"$set": upd})
    row = await db.harvests.find_one({"_id": ObjectId(hid)})
    return await _enrich_harvest(row)


@api_router.delete("/harvests/{hid}")
async def delete_harvest(hid: str, user: CurrentUser):
    existing = await db.harvests.find_one({"_id": ObjectId(hid), **scope_filter(user)})
    if not existing:
        raise HTTPException(status_code=404, detail="Cosecha no encontrada")
    await db.harvests.delete_one({"_id": ObjectId(hid)})
    return {"ok": True}


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
        "Fecha", "Trabajador", "Parcela", "Producto",
        "Kilos", "Precio/Kg", "Unidades", "Precio/Unidad",
        "Pago Total ($)", "Notas"
    ])
    for r in enriched:
        ws.append([
            r.get("date", ""),
            r.get("worker_name", ""),
            r.get("parcel_name", ""),
            r.get("product_name", ""),
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
    ws.append(["TOTALES", "", "", "", total_kilos, "", total_units, "", total_payment, ""])

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


# ---------------------------------------------------------------------------
# Receipts (Recibos de pago)
# ---------------------------------------------------------------------------
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

        # Skip workers with no activity at all
        if total_payment == 0 and total_hours == 0 and total_kilos == 0 and total_units == 0:
            continue

        result.append({
            "worker_id": wid,
            "worker_name": w.get("name"),
            "document_id": w.get("document_id", ""),
            "role": w.get("role", ""),
            "date_from": date_from,
            "date_to": date_to,
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
    if not ci or not co:
        return 0.0
    try:
        a = datetime.fromisoformat(ci)
        b = datetime.fromisoformat(co)
        return round((b - a).total_seconds() / 3600.0, 2)
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
@api_router.get("/admin/mayordomos")
async def admin_list_mayordomos(user: CurrentUser):
    require_admin(user)
    rows = await db.users.find({}).sort("created_at", -1).to_list(1000)
    out = []
    for r in rows:
        r.pop("password_hash", None)
        d = doc_out(r)
        d["workers_count"] = await db.workers.count_documents({"owner_id": d["id"]})
        d["parcels_count"] = await db.parcels.count_documents({"owner_id": d["id"]})
        d["harvests_count"] = await db.harvests.count_documents({"owner_id": d["id"]})
        out.append(d)
    return out


@api_router.post("/admin/mayordomos")
async def admin_create_mayordomo(data: MayordomoCreate, user: CurrentUser):
    require_admin(user)
    email = data.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="El correo ya está registrado")
    doc = {
        "email": email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "role": data.role or "user",
        "active": data.active,
        "token_version": 0,
        "created_by": user["_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
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
    if data.password:
        upd["password_hash"] = hash_password(data.password)
        upd["token_version"] = (existing.get("token_version", 0) or 0) + 1
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
    # Transfer orphan data to admin so nothing gets lost
    aid = str(user["_id"])
    for coll in ["workers", "parcels", "products", "harvests", "attendance", "crews"]:
        await db[coll].update_many({"owner_id": uid}, {"$set": {"owner_id": aid}})
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
