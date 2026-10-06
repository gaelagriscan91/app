# 🤖 Generar AAB firmado automáticamente con GitHub Actions

Esta guía te deja un pipeline que, **cada vez que haces push a `main`**, compila el **AAB firmado** listo para Play Store. No necesitas Android Studio en tu PC.

---

## 1. Crea la keystore (una sola vez, en cualquier computadora con Java)

Si ya tienes Java instalado:
```bash
keytool -genkey -v \
  -keystore agriscan.jks \
  -alias agriscan \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

Si no tienes Java, usa un celular Android con la app **Keystore Generator** (o pídele a cualquier amigo con Java). Importante:

- **Guarda `agriscan.jks` en lugar seguro** (iCloud, Google Drive, pendrive).
- **Anota las contraseñas** (store password y key password). Si las pierdes, nunca podrás volver a actualizar la app en Play Store.

---

## 2. Convierte la keystore a base64 (para subirla a GitHub Secrets)

En Mac/Linux:
```bash
base64 -i agriscan.jks | pbcopy      # Mac (copia al portapapeles)
base64 -w0 agriscan.jks > ks.txt     # Linux (guarda en archivo)
```

En Windows (PowerShell):
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("agriscan.jks")) | Set-Clipboard
```

---

## 3. Guarda los secretos en GitHub

En tu repo en GitHub → **Settings → Secrets and variables → Actions → New repository secret**. Crea estos 4:

| Nombre | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | el string base64 del paso 2 |
| `ANDROID_KEYSTORE_PASSWORD` | la store password |
| `ANDROID_KEY_ALIAS` | `agriscan` |
| `ANDROID_KEY_PASSWORD` | la key password |

---

## 4. Haz push

El workflow `.github/workflows/android-release.yml` ya está en el repo. Apenas hagas push:

- Ve a la pestaña **Actions** en GitHub.
- Verás el job **"Build Signed AAB"** corriendo (~8-12 min).
- Cuando termine, baja el artefacto `app-release-aab` → dentro está `app-release.aab`.

**Ese es el archivo que subes a Play Console.**

---

## 5. Subir a Play Console

1. Entra a <https://play.google.com/console> ($25 USD, una vez).
2. Crea la app → **Producción → Nueva versión → Subir `app-release.aab`**.
3. Rellena capturas, descripción, política de privacidad.
4. Envía a revisión (1-3 días).

---

## 🔁 Actualizar la app (versiones futuras)

Edita `/app/frontend/android/app/build.gradle`:
```gradle
versionCode 2
versionName "1.1"
```
Haz push → GitHub Actions genera un nuevo AAB firmado automáticamente.

---

## 🧪 Compilación manual (si prefieres hacerlo en tu PC)

Si prefieres no usar GitHub Actions, sigue `/app/PUBLISH_PLAYSTORE.md`.
