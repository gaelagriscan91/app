# AgriScan — PRD

## Original problem statement
Agricultural harvest tracking web app (PickTrace-style). Register harvest (Worker, Parcel, Product, Kilos, Date, Photo), auto-calc pay by price/kilo or price/unit, daily list with totals, Excel export, modules for Workers / Parcels / Harvests, offline/online sync, thermal printer. Spanish UI.

## Core architecture
- React + Tailwind + Shadcn UI (frontend)
- FastAPI + Motor + MongoDB (backend, multi-tenant via `owner_id` scope)
- JWT auth; Admin creates Mayordomo sub-accounts
- HTML5-QRCode for camera scanning; Web Bluetooth ESC/POS thermal printing

## Implemented
- [2026-02] Hub PickTrace (Check In / Picking / Check Out)
- [2026-02] Pre-session modal (Rancho / Mayordomo / Trabajo)
- [2026-02] Picking modes: Por Pieza, Por Hora, Compartir pieza
- [2026-02] QR anti-fraud cooldown + beep + camera auto-pause + scan history
- [2026-02] Multi-tenancy (Admin oversees all, Mayordomos isolated)
- [2026-02] Product price lock + override
- [2026-02] End-Day modal (summary + session reset)
- [2026-10-04] **Minimalist Cosechar screen**: Both Manual and Escanear tabs now only show Price + Scan/Manual + Save. Parcel/Product/Date resolved automatically (session → first available → auto-create "Rancho General" + "Cosecha"). Removed setup form, pay-mode toggle, share toggle, scan-mode toggle, photo + notes.
- [2026-02-08] **Check In header rediseño inline**: El header azul de la pantalla Check In ahora muestra Rancho/Block (izq) + Trabajo/Variedad (der) lado a lado + fila Precio por unidad / Precio por hora. Todos los campos abren el modal "Antes de empezar" al tocarlos. El modal fue extendido con 4 nuevos inputs: Block, Variedad, Precio por unidad, Precio por hora. Persisten en localStorage por día. Botones Pieza/Libra/Horas del header son independientes del selector del escáner.
- [2026-02-08b] **Modal "Antes de empezar" eliminado**: Reemplazado por completo con inputs editables inline directamente dentro del header azul del Check In. Al tocar la tile "Check in" entra directo a la vista. Cada input persiste via `saveSession` en el blur. Rancho y Trabajo crean la entidad en backend (`/parcels`, `/products`) automáticamente si el nombre no existe. Componente `SessionModal` + estado `sessionModalOpen` removidos de Asistencia.jsx (284 líneas menos).
- [2026-02-08c] **Scanner (Cosechar) limpieza top controls**: Removido del scanner QR el card "PRECIO · 1 unidad" (top-left), el toggle de unidad pza/hr/lb, el botón de pausar/reanudar cámara (top-right) y el pill "Compartir" (debajo). Ya están en Check In. Las fracciones (1/4·1/2·3/4) siguen apareciendo solo después de escanear un trabajador.

## Backlog (P1/P2)
- P1 — Export por trabajador (Nómina)
- P2 — Generación de QR por pieza/canasta
- P2 — Modo Revisión (bloqueo de jornadas auditadas)
- P3 — Refactor backend/server.py (>1200 líneas → routers)
- P3 — Refactor ScanHarvestMode (ya reducido con última simplificación)

## Known fragile points
- `AudioContext` beep may not play on iOS Safari without initial user tap (frontend only).

## Test credentials
See `/app/memory/test_credentials.md`.
