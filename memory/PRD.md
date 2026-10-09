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
  - Lee `?from=cosecha` y regresa a `/cosecha?prompt=save` cuando se abre desde la pestaña Cosecha
- Dashboard (Inicio) con botón SCAN central siempre visible
- Barra inferior: Empleado activo · SCAN · Pieza; GUARDAR siempre accesible
- Bottom-sheet "¿Guardar recibo?" con botón GUARDAR siempre disponible
- GUARDAR idempotente: refresca datos, marca local savedIds, snapshot backend
- Inicio solo muestra escaneos **del día** guardados vía SAVE (`agriscan.savedIds` en localStorage)
- Cada escaneo es una fila independiente, mismo trabajador puede aparecer N veces
- **Pestaña Cosecha** rediseñada:
  - Card blanco **"REGISTRO DE ESCÁNEO"** con ícono scan-line azul y contador a la derecha
  - Card ocupa toda la pantalla disponible entre header y barra SCAN (siempre visible)
  - Lista scrollea internamente, header pegado arriba
  - Filas: nombre grande + badge QR/MANUAL/GRUPO azul claro + hora am/pm; precio azul + N/PZA
  - Al volver del scanner con `?prompt=save` refresca lista y muestra toast "Registro guardado"
- Navegación inferior con 5 tabs: Inicio · Cosecha · Día · Reportes · Módulos

## Backlog priorizado
### P1
- Guardar Block y Variedad en el schema `harvests` (hoy solo viven en localStorage)

### P2
- Generación de QR por pieza/canasta para modo "Escanear piezas"
- Modo "Review" para bloquear jornada auditada
- Filtrar Cosecha por rango de fechas

### P3
- Refactor `server.py` (~1900 líneas) en routers
- Refactor `Dashboard.jsx` modularizando componentes

## Credenciales de prueba
Ver `/app/memory/test_credentials.md`
