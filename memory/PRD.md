# AgriScan — PRD

## Problema original
Crear una app de registro de cosecha estilo PickTrace para equipos agrícolas:
- Registrar cosecha (Trabajador, Parcela, Producto, Kilos/Piezas, Fecha, Foto)
- Calcular pago automáticamente por kilo/pieza/hora
- Lista del día con totales
- Reportes con exportación Excel
- Módulos de Trabajadores, Parcelas, Cosechas
- Sincronización offline/online e impresión térmica (ESC/POS)
- Multi-tenancy (Admin vs Mayordomos) y empaquetado Android vía Capacitor

## Arquitectura
- Frontend: React + Tailwind + Shadcn (en `/app/frontend`)
- Backend: FastAPI + MongoDB Motor (en `/app/backend/server.py`)
- Android: Capacitor (en `/app/frontend/android`) con CI vía GitHub Actions

## Lo implementado hasta ahora
- Autenticación JWT con cookies; roles admin/user (mayordomo)
- Mayordomos con fecha de expiración y bloqueo manual
- Pantalla Check-In (Asistencia.jsx) con campos editables inline que persisten en `localStorage`
- Escáner QR fullscreen (ScanHarvestMode.jsx) estilo nativo (flash/zoom/flip)
- Dashboard (Inicio) con botón SCAN central siempre visible
- Barra inferior dinámica con fracciones (1/4, 1/2, 3/4) y SAVE cuando hay escaneo pendiente
- Bottom-sheet "¿Guardar recibo?" al volver del escáner
- Reportes y Lista del Día simplificados
- Módulos: Trabajadores, Cuadrilla, Registro, Mayordomos (Parcelas y Productos removidos)
- **(Nuevo 10/2026)** Inicio muestra únicamente los registros de escaneo; los check-ins (En campo) solo aparecen en Día/Registro

## Backlog priorizado
### P1
- Guardar Block y Variedad en el schema `harvests` para que aparezcan históricamente en Reportes

### P2
- Generación de QR por pieza/canasta para modo "Escanear piezas"
- Modo "Review" para bloquear jornada auditada

### P3
- Refactor `server.py` (~1900 líneas) en routers (auth, workers, harvests, attendance)
- Refactor `Dashboard.jsx` y `ScanHarvestMode.jsx` modularizando componentes

## Credenciales de prueba
Ver `/app/memory/test_credentials.md`
