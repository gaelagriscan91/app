# AgriScan — PRD

## Problema original
App de registro de cosecha estilo PickTrace para equipos agrícolas:
- Registrar cosecha (Trabajador, Parcela, Producto, Kilos/Piezas, Fecha, Foto)
- Calcular pago automáticamente por kilo/pieza/hora
- Lista del día con totales
- Reportes con exportación Excel
- Módulos de Trabajadores, Parcelas, Cosechas
- Sincronización offline/online e impresión térmica (ESC/POS)
- Multi-tenancy (Admin vs Mayordomos) y empaquetado Android vía Capacitor

## Arquitectura
- Frontend: React + Tailwind + Shadcn (`/app/frontend`)
- Backend: FastAPI + MongoDB Motor (`/app/backend/server.py`)
- Android: Capacitor (`/app/frontend/android`) con CI por GitHub Actions

## Implementado (estado actual tras reseteo 10/2026)
- **Inicio (Panel principal)**: título + fecha y lista "Registros del día" (solo cosechas de hoy + trabajadores con entrada sin cosecha). Se quitaron Cosechar por QR / Asistencia / Pago hoy. (2026-10-09: cambiado de "Registros del mes" a "Registros del día"; backend /api/dashboard devuelve today_records y today_records_count)
- **Nav inferior con 6 pestañas**: Inicio · Cosechar · Asistencia · Día · Reportes · Módulos
- `/health` y `/api/health` endpoints para liveness/readiness probes de Kubernetes
- Autenticación JWT con cookies; roles admin/user (mayordomo); expiración y bloqueo manual
- Reportes y Lista del Día simplificados; Módulos: Trabajadores, Cuadrilla, Registro, Mayordomos

### Scanner (ScanHarvestMode.jsx) — mejoras recientes
- Botones de pausa cámara y "Compartir" eliminados del scanner
- Chip **PRECIO** arriba-izquierda muestra el precio actual y `/ {unidad}`
- Toggle **PZA / LB / HR** vertical junto al chip PRECIO (seleccionado en azul)
- Toggle y precio sincronizan con `agriscan.session.{fecha}` → Check In se mantiene al día
- Modo **PZA**: fracciones visibles (Completo · 3/4 · 1/2 · 1/4), controles +/-
- Modo **LB/HR**: fracciones ocultas; campo numérico editable entre +/- para teclear decimales exactos

## Backlog priorizado
### P1
- Guardar Block y Variedad en el schema `harvests` (hoy solo viven en localStorage)

### P2
- Generación de QR por pieza/canasta para modo "Escanear piezas"
- Modo "Review" para bloquear jornada auditada

### P3
- Refactor `server.py` (~1900 líneas) en routers
- Refactor `Dashboard.jsx` modularizando componentes

## Credenciales de prueba
Ver `/app/memory/test_credentials.md`
