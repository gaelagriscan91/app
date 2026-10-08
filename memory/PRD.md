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

## Implementado
- Autenticación JWT con cookies; roles admin/user (mayordomo)
- Mayordomos con fecha de expiración y bloqueo manual
- Check-In (Asistencia.jsx) con campos editables inline que persisten en `localStorage`
- Escáner QR fullscreen (ScanHarvestMode.jsx) estilo nativo (flash/zoom/flip)
- Dashboard (Inicio) con botón SCAN central siempre visible
- Barra inferior permanente: fracciones (1/4, 1/2, 3/4), SCAN y botón GUARDAR siempre visibles
- Bottom-sheet "¿Guardar recibo?" con botón GUARDAR siempre disponible
- Reportes y Lista del Día simplificados
- Módulos: Trabajadores, Cuadrilla, Registro, Mayordomos
- **(10/2026)** Inicio solo muestra escaneos **del día de hoy** que ya fueron guardados vía SAVE. Los escaneos pendientes quedan ocultos hasta pulsar GUARDAR. Persiste en `localStorage` (`agriscan.savedIds`).

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
