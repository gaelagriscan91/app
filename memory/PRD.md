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
