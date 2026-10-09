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
- **Inicio (Panel principal)** restaurado al diseño original: título + fecha, botones Cosechar por QR / Asistencia, tarjeta Pago hoy, lista Registros del mes con Ver reportes
- **Nav inferior con 6 pestañas**: Inicio · Cosechar · Asistencia · Día · Reportes · Módulos
- Scanner `ScanHarvestMode.jsx` restaurado al comportamiento original (sin autosave inmediato, cooldown de 2 min, navegación a Jornada tras scan)
- `/health` y `/api/health` endpoints para liveness/readiness probes de Kubernetes
- Autenticación JWT con cookies; roles admin/user (mayordomo)
- Mayordomos con fecha de expiración y bloqueo manual
- Reportes y Lista del Día simplificados
- Módulos: Trabajadores, Cuadrilla, Registro, Mayordomos

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
