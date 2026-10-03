# AgriScan — PRD

## Problem Statement
Crea una app web para rastrear cosecha agrícola tipo PickTrace llamada "agri scan".
Funciones: Registrar cosecha (Trabajador, Parcela, Producto, Kilos, Fecha, Foto, pago automático), Lista del día con totales, Reportes filtrables con export a Excel, Módulos CRUD (Trabajadores, Parcelas, Cosechas). Diseño simple, botones grandes, español, mobile-friendly.

## Architecture
- **Backend**: FastAPI + MongoDB + bcrypt + PyJWT, openpyxl para Excel, Object Storage (emergentintegrations proxy) para fotos
- **Frontend**: React 19 + React Router + TailwindCSS + Shadcn UI + Recharts + Sonner (toast) + Lucide icons
- **Auth**: JWT básico con httpOnly cookies (access 24h, refresh 7d), SameSite=none Secure

## User Personas
- **Supervisor/Administrador de campo** (desktop + móvil): da de alta trabajadores, parcelas y productos; revisa reportes; exporta a Excel.
- **Capataz/Operador en campo** (móvil): registra cosechas durante el día; captura fotos; revisa totales del día.

## Core Requirements
- 3 módulos CRUD: Trabajadores, Parcelas, Productos (con precio por kg Y por unidad)
- Registro de cosechas con cálculo automático: `payment = kilos × $/Kg + unidades × $/unidad`
- Vista "Día" con totales por trabajador y detalle de cosechas
- Reportes con filtros: fecha_desde, fecha_hasta, trabajador, parcela, producto
- Exportación a Excel (.xlsx) con totales
- Mobile-first, botones ≥ 48px, todo en español

## Implemented (2026-02-11)
- **Pieza compartida (NUEVO)**:
  - Toggle "Compartir pieza" en Picking modo pieza.
  - Al activarlo, los escaneos entran a un buffer temporal (chips naranjas con X para eliminar).
  - Botón "Confirmar pieza compartida" distribuye 1/N piezas a cada trabajador en el buffer.
  - UI muestra preview: "Cada uno recibirá 0.XXX pieza · $Y.YY".
  - Conteo con decimales (0.50, 0.33, etc.) visible en lista de trabajadores y totales.
- **Price lock-in por producto**: Primer harvest con precio > 0 bloquea el precio. Subsiguientes usan el bloqueado (snapshot override).
- **Multi-tenant por Mayordomo**:
  - Admin ve todos los datos. Mayordomos ven solo lo suyo (`owner_id` scope).
  - Registro público DESHABILITADO (403). Admin gestiona accesos en Módulos → Mayordomos.
  - Backend `_resolve_worker_by_code` + `/workers/resolve` + `/attendance/scan` todos scope-aware.

## Implemented (2026-10-03)
- JWT auth: register, login, logout, me (admin seed: gaelmartin158@gmail.com / agriscan2026)
- CRUD completo /api/workers, /api/parcels, /api/products
- /api/harvests con cálculo automático y precios snapshot/override
- /api/harvests/daily (totales + resumen por trabajador)
- /api/harvests/export → .xlsx con openpyxl
- /api/dashboard (hoy, mes, equipo, gráfica semanal)
- /api/upload + /api/files/{path} con object storage proxy
- Frontend completo: Login, Register, Dashboard, Registrar, Lista del Día, Reportes, Módulos (3 tabs)
- Seed demo: 3 trabajadores, 3 parcelas, 3 productos
- Barra de navegación inferior fija (mobile-first)
- Testing agent: 17/17 pytest backend ✅

## Backlog (prioridad)
- **P1 — Edición in-line de cosechas** (hoy solo DELETE desde Día; editar sólo via API)
- **P1 — Visualización de fotos** en Lista del Día (hoy sólo se suben)
- **P2 — Password reset flow** (forgot-password + reset-password endpoints + emails)
- **P2 — Roles/permisos** (admin vs capataz) — hoy cualquier usuario autenticado puede modificar todo
- **P2 — Dashboard: top parcelas, top trabajadores, promedio $/Kg**
- **P3 — PWA / offline mode** para captura sin internet en campo
- **P3 — Firma digital del trabajador** al cerrar el día
- **P3 — Export por trabajador individual** (nómina)
