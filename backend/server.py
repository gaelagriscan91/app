from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
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
    active: bool = True


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
    unit_label: Optional[str] = "unidad"
    active: bool = True


class HarvestIn(BaseModel):
    worker_id: str
    parcel_id: str
    product_id: str
    kilos: float = 0
    units: float = 0
    price_per_kg: Optional[float] = None  # overrides product snapshot
    price_per_unit: Optional[float] = None
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
# Auth endpoints
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(data: RegisterIn, response: Response):
    email = data.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="El correo ya está registrado")
    doc = {
        "email": email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "role": "user",
        "token_version": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    access = create_access_token(uid, email, 0)
    refresh = create_refresh_token(uid, 0)
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": email, "name": data.name, "role": "user"}


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
    rows = await db.workers.find({}).sort("name", 1).to_list(1000)
    return [doc_out(r) for r in rows]


@api_router.post("/workers")
async def create_worker(data: WorkerIn, user: CurrentUser):
    doc = data.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.workers.insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc_out(doc)


@api_router.put("/workers/{wid}")
async def update_worker(wid: str, data: WorkerIn, user: CurrentUser):
    await db.workers.update_one({"_id": ObjectId(wid)}, {"$set": data.model_dump()})
    row = await db.workers.find_one({"_id": ObjectId(wid)})
    return doc_out(row)


@api_router.delete("/workers/{wid}")
async def delete_worker(wid: str, user: CurrentUser):
    await db.workers.delete_one({"_id": ObjectId(wid)})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Parcels CRUD
# ---------------------------------------------------------------------------
@api_router.get("/parcels")
async def list_parcels(user: CurrentUser):
    rows = await db.parcels.find({}).sort("name", 1).to_list(1000)
    return [doc_out(r) for r in rows]


@api_router.post("/parcels")
async def create_parcel(data: ParcelIn, user: CurrentUser):
    doc = data.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.parcels.insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc_out(doc)


@api_router.put("/parcels/{pid}")
async def update_parcel(pid: str, data: ParcelIn, user: CurrentUser):
    await db.parcels.update_one({"_id": ObjectId(pid)}, {"$set": data.model_dump()})
    row = await db.parcels.find_one({"_id": ObjectId(pid)})
    return doc_out(row)


@api_router.delete("/parcels/{pid}")
async def delete_parcel(pid: str, user: CurrentUser):
    await db.parcels.delete_one({"_id": ObjectId(pid)})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Products CRUD
# ---------------------------------------------------------------------------
@api_router.get("/products")
async def list_products(user: CurrentUser):
    rows = await db.products.find({}).sort("name", 1).to_list(1000)
    return [doc_out(r) for r in rows]


@api_router.post("/products")
async def create_product(data: ProductIn, user: CurrentUser):
    doc = data.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.products.insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc_out(doc)


@api_router.put("/products/{pid}")
async def update_product(pid: str, data: ProductIn, user: CurrentUser):
    await db.products.update_one({"_id": ObjectId(pid)}, {"$set": data.model_dump()})
    row = await db.products.find_one({"_id": ObjectId(pid)})
    return doc_out(row)


@api_router.delete("/products/{pid}")
async def delete_product(pid: str, user: CurrentUser):
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
    q: dict = {}
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
    price_per_kg = data.price_per_kg if data.price_per_kg is not None else float(prod.get("price_per_kg", 0))
    price_per_unit = data.price_per_unit if data.price_per_unit is not None else float(prod.get("price_per_unit", 0))
    payment = round(float(data.kilos) * price_per_kg + float(data.units) * price_per_unit, 2)
    doc = {
        "worker_id": data.worker_id,
        "parcel_id": data.parcel_id,
        "product_id": data.product_id,
        "kilos": float(data.kilos),
        "units": float(data.units),
        "price_per_kg": price_per_kg,
        "price_per_unit": price_per_unit,
        "payment": payment,
        "date": data.date,
        "photo_path": data.photo_path or "",
        "notes": data.notes or "",
        "created_by": user["_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.harvests.insert_one(doc)
    doc["_id"] = res.inserted_id
    return await _enrich_harvest(doc)


@api_router.put("/harvests/{hid}")
async def update_harvest(hid: str, data: HarvestIn, user: CurrentUser):
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
    await db.harvests.delete_one({"_id": ObjectId(hid)})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Daily summary & Dashboard
# ---------------------------------------------------------------------------
@api_router.get("/harvests/daily")
async def daily_summary(user: CurrentUser, date: Optional[str] = None):
    d = date or today_iso()
    rows = await db.harvests.find({"date": d}).to_list(2000)
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

    month_rows = await db.harvests.find({"date": {"$gte": month_start}}).to_list(5000)
    week_rows = await db.harvests.find({"date": {"$gte": week_start}}).to_list(5000)
    today_rows = await db.harvests.find({"date": now.isoformat()}).to_list(5000)

    month_kilos = sum(float(r.get("kilos", 0)) for r in month_rows)
    month_payment = sum(float(r.get("payment", 0)) for r in month_rows)
    today_kilos = sum(float(r.get("kilos", 0)) for r in today_rows)
    today_payment = sum(float(r.get("payment", 0)) for r in today_rows)

    workers_count = await db.workers.count_documents({"active": True})
    parcels_count = await db.parcels.count_documents({"active": True})

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
    q: dict = {}
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
            {"name": "Tomate", "price_per_kg": 12.0, "price_per_unit": 0,
             "unit_label": "caja", "active": True,
             "created_at": datetime.now(timezone.utc).isoformat()},
            {"name": "Fresa", "price_per_kg": 25.0, "price_per_unit": 15.0,
             "unit_label": "canasta", "active": True,
             "created_at": datetime.now(timezone.utc).isoformat()},
            {"name": "Aguacate", "price_per_kg": 35.0, "price_per_unit": 5.0,
             "unit_label": "pieza", "active": True,
             "created_at": datetime.now(timezone.utc).isoformat()},
        ])


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup_event():
    await db.users.create_index("email", unique=True)
    await seed_admin()
    await seed_demo()
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
