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
- **Pestaña Soporte** (2026-10-09): "Mi plan" se renombró a "Soporte" y se quitó la tarjeta de plan/estado. Contiene: Contactar AgriScan (WhatsApp + correo), Restablecer contraseña y, solo si hay suscripción PayPal activa, "Cancelar suscripción".
- **Restablecer contraseña en Mi plan** (2026-10-09): botón que abre formulario (actual, nueva, repetir). POST `/api/auth/change-password` verifica la actual (con bloqueo por intentos), sube `token_version` (cierra otras sesiones) y renueva las cookies de esta sesión.
- **WhatsApp en Mi plan** (2026-10-09): abre wa.me/15093173565 con el texto "Gracias por contactar AgriScan, ¿cómo te puedo ayudar?" (constantes en `src/lib/support.js`). El botón flotante y el subtítulo "¿Cómo te puedo ayudar?" se quitaron a pedido del usuario.
- **Contacto en Mi plan** (2026-10-09): tarjeta "Contactar AgriScan — ¿Cómo te puedo ayudar?" con WhatsApp (509) 317-3565 (wa.me/15093173565, mensaje listo) y correo gaelagriscan@gmail.com.
- **Datos privados por cuenta** (2026-10-09): `scope_filter` ya no da acceso global al admin; cada cuenta (admin incluido) solo ve sus datos. Módulos → Mayordomos (admin) ahora es lista de usuarios con estado (Bloqueado / Prueba gratis / Pagado / Activo) y botones Bloquear/Desbloquear y Eliminar (borra la cuenta y todos sus datos). Sin crear/editar ni contadores.
- **Guardar antes de borrar** (2026-10-09): Reportes → Borrar todo exige guardar recibo primero. GET `/api/harvests/reset-check` indica si hay actividad sin recibo guardado (compara última cosecha/asistencia con `receipts_history.saved_at`); POST `/api/harvests/reset` responde 409 si falta guardar. El modal muestra "Guardar recibo" y luego permite borrar.
- **Prueba gratis de 3 días** (2026-10-09): `/auth/register` crea la cuenta activa con `unlocked_by=trial`, `trial_ends_at` y `access_expires_at` = ahora + 3 días (`TRIAL_DAYS`). Banner verde "Prueba gratis: quedan X días" con "Activar plan". Al vencer pasa a modo solo lectura + paywall ("Tu prueba gratis terminó"). Si el admin desbloquea durante/después de la prueba se borra el vencimiento (`unlocked_by=admin`).
- **Pago PayPal $29.99/mes + modo solo lectura** (2026-10-09): cuentas bloqueadas pueden abrir todas las pantallas (GET permitidos) pero guardar/escanear/exportar devuelve 403 y abre el PaywallDialog (PayPal, correo gaelagriscan@gmail.com). Banner amarillo "Cuenta bloqueada — Pagar $29.99/mes". Endpoints: GET `/api/billing/status`, POST `/api/billing/subscribe` (devuelve approve_url), POST `/api/billing/confirm`, POST `/api/billing/cancel`, POST `/api/billing/paypal-webhook` (verifica firma). Al activarse la suscripción: `active=true, unlocked_by=paypal, paid_until`; al cancelar/suspender sigue hasta `paid_until` y luego se bloquea. Plan se crea solo si no hay `PAYPAL_PLAN_ID`. Mayordomo cancela en Módulos → Mi plan. **PENDIENTE: el usuario debe dar PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_WEBHOOK_ID (y PAYPAL_MODE=live para cobrar real). Sin ellas el botón muestra "se activará muy pronto".**
- **Aviso de cuenta nueva** (2026-10-09): en Inicio del admin, tarjeta con los mayordomos auto-registrados bloqueados → abre Módulos → Mayordomos.
- **Bloqueados dentro de la app** (2026-10-09): la cuenta bloqueada entra a la app (login 200 con `blocked:true`, `/auth/me` usa `CurrentUserAny`), ve encabezado y barra con candados; cada sección muestra la tarjeta "Cuenta bloqueada" con gaelagriscan@gmail.com. Todos los demás endpoints siguen respondiendo 403. `/auth/logout` ya no requiere sesión válida.
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
