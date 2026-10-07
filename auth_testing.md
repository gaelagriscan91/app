# AgriScan — Auth Testing Playbook

## Credenciales
- Admin: `gaelmartin158@gmail.com` / `agriscan2026`
- Test mayordomo: creado por Admin desde Módulos → Mayordomos

## Endpoints
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | Pública | Login con email+password, setea cookies httpOnly |
| POST | `/api/auth/logout` | Requerida | Borra cookies |
| GET | `/api/auth/me` | Requerida | Devuelve usuario actual |
| POST | `/api/auth/refresh` | Cookie refresh | Emite nuevo access token |
| POST | `/api/auth/register` | **403** | Desactivado por multi-tenant |
| POST | `/api/auth/forgot-password` | Pública | Envía link de reset (respuesta genérica siempre) |
| POST | `/api/auth/reset-password` | Pública (token) | Guarda nueva contraseña y bumpea token_version |

## Flujo de reset de contraseña

1. Usuario pulsa "¿Olvidaste tu contraseña?" en Login → `/forgot-password`
2. POST `/api/auth/forgot-password` con email → respuesta genérica siempre
3. Email con link `${FRONTEND_URL}/reset-password?token=...` (válido 1h, un solo uso)
4. Usuario abre link → `/reset-password?token=...`
5. POST `/api/auth/reset-password` con `{token, password}` → actualiza hash, bumpea `token_version`, limpia `login_attempts` por email, borra tokens no usados
6. Redirección a `/login` con la nueva contraseña

## Seguridad

- **Bcrypt** para hashear (`$2b$`)
- **JWT access** 24h + **refresh** 7 días, ambos en cookies httpOnly, Secure, SameSite=None
- **Brute-force**: 5 intentos fallidos por `{ip}:{email}` en 15 min → 429
- **Reset throttle**: 5 solicitudes de forgot-password por email en 15 min
- **Respuesta genérica** en forgot-password (misma para registrados / no-registrados / rate-limited)
- **Hash SHA-256** del token almacenado (nunca el raw)
- **Claim atómico** del token con `find_one_and_update` (previene double-submit)
- **token_version++** al resetear invalida todas las sesiones previas (access + refresh)

## Verificación rápida con curl

```bash
API="https://harvest-track-94.emergent.host"

# Login OK
curl -s -c /tmp/c.txt -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"gaelmartin158@gmail.com","password":"agriscan2026"}'

# /me con cookies
curl -s -b /tmp/c.txt "$API/api/auth/me"

# Refresh
curl -s -b /tmp/c.txt -X POST "$API/api/auth/refresh"

# Forgot (ambos retornan mismo mensaje genérico)
curl -s -X POST "$API/api/auth/forgot-password" \
  -H "Content-Type: application/json" -d '{"email":"gaelmartin158@gmail.com"}'
curl -s -X POST "$API/api/auth/forgot-password" \
  -H "Content-Type: application/json" -d '{"email":"nobody@example.org"}'

# Reset (token obtenido del email)
curl -s -X POST "$API/api/auth/reset-password" \
  -H "Content-Type: application/json" \
  -d '{"token":"<TOKEN_DEL_EMAIL>","password":"nuevaClave123"}'
```

## Índices de MongoDB (creados en startup)

- `users.email` (unique)
- `attendance (worker_id, date)` (unique)
- `workers.qr_code`
- `login_attempts.identifier`
- `login_attempts.email`
- `password_reset_tokens.token_hash` (unique)
- `password_reset_tokens.expires_at` (TTL 0s)
- `password_reset_requests.email`
- `password_reset_requests.created_at` (TTL 900s = 15 min)

## Notas sobre el envío real de emails

El email solo se envía si `EMERGENT_EMAIL_KEY` no es el placeholder y `FRONTEND_URL` empieza con `https://`. En este entorno la clave está en `backend/.env` como placeholder; cuando la plataforma la provisiona en producción, los correos empiezan a enviarse automáticamente. Mientras tanto, el link de reset se escribe al log del backend para pruebas locales (solo si `FRONTEND_URL` apunta a localhost).
