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
- **Fix: QR scan "no reconocido"** — ScanHarvestMode (Picking) ahora normaliza códigos a mayúsculas, trim, y extrae de prefijos URL (agriscan://worker/AGW-xxx). Fallback a document_id. Error muestra el código decodificado para debug. Backend `_resolve_worker_by_code` también actualizado con búsqueda case-insensitive y strip de prefijo URL.
- **Picking rediseñado**: sin setup, hereda rancho/producto del Check in. Banner "Jornada activa" + botón Hub.
- **Toggle Pago por pieza / por hora** en Picking: Por hora lista automática de trabajadores con asistencia × precio por hora.
- **Inputs de teclado** en modal "Antes de empezar": Rancho, Mayordomo y Trabajo son inputs de texto con datalist + chips rápidos. Rancho/Trabajo nuevos se crean automáticamente.
- **PickTrace-style Hub** en /asistencia con navy BG y 3 tiles grandes: Check in (naranja/sol), Picking (rojo/canasta), Check out (púrpura/luna)
- Selección obligatoria de Rancho + Mayordomo + Trabajo antes de dar entrada; persistida en localStorage por fecha
- Bloqueo del botón Picking hasta que al menos 1 trabajador tenga check-in registrado
- Botón Check out: cierra la jornada de todos los trabajadores con jornada abierta en lote (confirmación)
- Picking tile navega a /registrar?mode=qr con parcel y product pre-cargados desde la sesión

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
