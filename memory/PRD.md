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
- [2026-02-08d] **Scanner hereda el precio del Check-In**: Al abrir Cosechar, el `pricePerUnit` se lee primero de `localStorage['agriscan.session.<fecha>'].pricePerUnit` (configurado desde el header del Check In) y solo cae al `product.price_per_unit` como respaldo. Ya no muestra el toast "Pon el precio antes de guardar" si el usuario ya puso el precio en Check In.
- [2026-02-08e] **Toggle Pieza/Libra/Horas persistido**: El selector del header Check In ahora guarda `session.unitMode` en localStorage. El scanner (Cosechar) lo lee en el `init` y mapea a `unitLabel` (`pieza`→`pieza`, `libra`→`libra`, `horas`→`hora`). Cuando `unitMode='libra'`, al escanear un trabajador se abre automáticamente el modal numérico `lbPrompt` para capturar el peso en libras. Cuando `unitMode='horas'`, el precio usa `session.pricePerHour` en vez de `pricePerUnit`.
- [2026-02-08f] **Barra inferior oscura con SCAN redondo**: El bottom bar del scanner se rediseñó completo. Fila única en gris oscuro `#1F2937` con 3 columnas: (izq) label "EMPLEADOS" + chips rojos 3/4·1/2·1/4; (centro) botón redondo rojo grande SCAN que hace +1 al último trabajador o abre picker manual si no hay; (der) contador "unidad N" + tarjeta roja del último trabajador (nombre, count, pago) + botón blanco SAVE. Reemplaza los antiguos controles azules con totals de jornada, botones +/-, y el Guardar separado.
- [2026-02-08g] **Día: eliminar cards Total Kilos y Total a Pagar**: En la pantalla "Día" (`ListaDia.jsx`) se removieron las tarjetas azul "Total kilos" y roja "Total a pagar". Queda únicamente la tarjeta "Unidades" en una sola columna.
- [2026-02-08h] **Reportes: filtros y totales simplificados**: Removidos filtros "Desde", "Trabajador", "Parcela" y "Producto" (queda solo "Hasta"). Removidas tarjetas totales (Kilos/Unidades/Total Pago). En su lugar se agregó bloque "Resumen por trabajador" en `Reportes.jsx` con nombre, kilos, unidades, # registros y pago por trabajador agregado desde `rows`.
- [2026-02-08i] **Reportes: layout mobile = desktop**: Título "Filtros" → "Fecha". Botones Aplicar filtros / Exportar a Excel ahora quedan lado a lado en mobile (removido `flex-col sm:flex-row`, ahora siempre `flex-row`). Mantiene Compartir reporte full-width debajo.
- [2026-02-08j] **Reportes: eliminada tabla de Detalle de cosechas**: Removida la tabla desktop + la lista mobile stacked (`field-card overflow-hidden` con rows[]) al final de Reportes porque el detalle ya existe en el Registro del escáner. Queda únicamente el bloque "Resumen por trabajador".
- [2026-02-08k] **Lista del día: eliminado "Resumen por trabajador"**: Removida la card "Resumen por trabajador" (`by_worker`) de `ListaDia.jsx`. Queda sólo la tarjeta Unidades + "Detalle de cosechas".
- [2026-02-08l] **Reportes: aviso "Empezar temporada nueva" removido**: La caja roja con ícono + título "Empezar temporada nueva" y descripción fue eliminada en `Reportes.jsx`. Queda solo el botón "Borrar todo" alineado a la derecha, que sigue abriendo el modal de confirmación.
- [2026-02-08m] **Reportes: card Fecha eliminada + Compartir reporte eliminado**: Removido el wrapper `field-card` del bloque Fecha (ahora los campos quedan sueltos sin fondo), removido el botón "Compartir reporte" y su texto de ayuda ("Abre tu bandeja de compartir..."). Queda: input Hasta + fila Aplicar filtros / Exportar a Excel.
- [2026-02-08n] **Lista del día rediseñada**: Reescrita por completo `ListaDia.jsx`. Ya no muestra totales/detalle de cosechas. Ahora carga en paralelo `/attendance?date=` + `/harvests/daily?date=` y presenta dos secciones: **Con entrada** (verde, lista los trabajadores con check-in, hora de entrada→salida y horas trabajadas) y **Sin entrada** (rojo, muestra con punto rojo pulsando a los trabajadores con cosechas pero sin check-in; al tocar la fila dispara `POST /attendance/scan` con el worker_id y les registra la entrada automáticamente). Se removió card Unidades, Resumen por trabajador y Detalle de cosechas.

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
