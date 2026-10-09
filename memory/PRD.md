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
- **Registro de mayordomos + sesi\u00f3n de 30 d\u00edas** (2026-10-09): `/register` p\u00fablico (nombre, correo, contrase\u00f1a) crea cuenta bloqueada; aparece en M\u00f3dulos \u2192 Mayordomos para desbloquear. Bloqueados pueden entrar/salir pero solo ven la pantalla "Cuenta bloqueada" con gaelagriscan@gmail.com y bot\u00f3n "Ya me desbloquearon"; el backend responde 403 en todo. Sesi\u00f3n deslizante de 30 d\u00edas (refresh rota cookies; axios reintenta en 401). Sin PIN (el usuario prefiri\u00f3 sesi\u00f3n abierta hasta cerrar sesi\u00f3n).
- **Login extras** (2026-10-09): ojito para mostrar/ocultar contraseña, recuerda el último correo (localStorage `agriscan.lastEmail`), mano del logo en blanco sobre el azul (`/assets/logo-light.png`, prop `light` en LogoHandCherry).
- **Portada / Login nuevo** (2026-10-09): fondo azul marino, logo cereza + "AgriScan" sin cambios, campos con línea inferior, "¿Olvidaste?" a la derecha, botón verde "Entrar", diagonal blanca abajo con logo pequeño y ©.
- **Excel recibo usa datos del Check in** (2026-10-09): el encabezado (Rancho, Block, Trabajo, Variedad, Mayordomo) siempre usa lo escrito ahora en Check in (leído del servidor `checkin_sessions`); si un campo está vacío usa lo de las cosechas. El Precio del Check in se usa para trabajadores sin cosecha.
- **Datos de Check in persistentes** (2026-10-09): Rancho/Block/Trabajo/Variedad/Precio/Mayordomo se guardan en el servidor (`checkin_sessions`, por usuario; GET/PUT `/api/checkin-session`). Siguen aunque se cierre la app o cambie el día; "Cerrar día" ya no los limpia. Solo se borran con Reportes → Borrar todo (`/api/harvests/reset`).
- **Alta de trabajador** (2026-10-09): formulario con Nombre (obligatorio), Apellido (obligatorio), SS# (opcional, se guarda en `document_id`), Rol y Activo; se quitó Teléfono. Se guarda como `name` = "Nombre Apellido". Aplicado en Módulos → Trabajadores y en el alta rápida de Check in.
- **Excel de recibos estilo planilla** (2026-10-09): `/api/receipts/export` genera encabezado RANCH / BLOCK# / Trabajo / Variedad / Mayordomo y tabla con encabezado gris y bordes: SS#, EMPLOYEE NAME, Hora entrada (h:mm:ss a.m.), Fecha (M/D/AAAA), Hora Salida, Total Horas, Total piezas, Precio ($), $. Una fila por trabajador (periodo sumado), sin fila de totales. `harvests` ahora también guarda `mayordomo`; si faltan Block/Variedad/Mayordomo se usan los de la sesión del teléfono (Mayordomo solo para el mismo día).
- **Block y Variedad guardados** (2026-10-09): `harvests` ahora guarda `block` y `variety` (tomados de la sesión de Check in al guardar el escaneo). Se muestran en Reportes (detalle por trabajador), en el detalle de Recibos guardados (Registro) y como columnas en el Excel. Las cosechas anteriores a este cambio quedan sin Block/Variedad.
- **Check in (Asistencia)**: Rancho, Block, Trabajo, Variedad y Precio (o Precio/hora en modo Horas) son obligatorios; sin ellos no se puede dar entrada (cámara, teclado, Move Crew); campos vacíos se marcan en rojo. (2026-10-09)
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
- (HECHO 2026-10-09) Guardar Block y Variedad en el schema `harvests`

### P2
- Generación de QR por pieza/canasta para modo "Escanear piezas"
- Modo "Review" para bloquear jornada auditada

### P3
- Refactor `server.py` (~1900 líneas) en routers
- Refactor `Dashboard.jsx` modularizando componentes

## Credenciales de prueba
Ver `/app/memory/test_credentials.md`
