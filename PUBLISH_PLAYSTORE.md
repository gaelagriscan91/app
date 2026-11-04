# 📱 Publicar AgriScan en Google Play Store

Este proyecto usa **Capacitor** para envolver la web app React en un contenedor Android nativo.
La configuración ya está lista en `/app/frontend`. Solo necesitas Android Studio en tu computadora para firmar y generar el AAB final.

---

## 1. 🔑 Antes de nada — Deploy del backend

La app Android **llama a tu backend FastAPI**. Debes tener el backend en producción (una URL pública con HTTPS) antes de generar el AAB.

En Emergent:
1. Usa el botón **Deploy** / "Save to Deployment".
2. Copia la URL de producción, por ejemplo:
   `https://agriscan-prod.yourdomain.com`

Luego edita `/app/frontend/.env`:
```bash
REACT_APP_BACKEND_URL=https://agriscan-prod.yourdomain.com
```

> Si no apuntas a tu backend en producción, la app crasheará apenas abra login.

---

## 2. 📦 Exportar el código

En Emergent, pulsa **"Save to GitHub"** desde el chat.
Luego en tu computadora:
```bash
git clone https://github.com/<tu-usuario>/<tu-repo>.git
cd <tu-repo>/frontend
```

---

## 3. 🏗️ Build de React + sync a Android

Necesitas Node 18+ y Yarn:
```bash
yarn install
yarn build                    # genera /build con el bundle estático
npx cap sync android          # copia /build al proyecto Android
```

---

## 4. 🧰 Abrir en Android Studio

```bash
npx cap open android
```
Esto abre el proyecto `/android` en Android Studio.
Primera vez tardará (Gradle sync descargando SDKs).

---

## 5. 🔐 Generar la keystore (una sola vez)

En Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle → Create new…**

Rellena:
- **Key store path**: `~/keystores/agriscan.jks`
- **Password / Confirm**: pon una segura (anótala — Google NO la recupera)
- **Alias**: `agriscan`
- **Validity**: 25 años
- **Certificate**: tu nombre + organización + país

Guarda el `.jks` en lugar seguro. Si lo pierdes, no podrás actualizar la app nunca más.

---

## 6. 📦 Generar el AAB firmado

En Android Studio:
**Build → Generate Signed Bundle / APK → Android App Bundle → Next**
- Elige tu keystore `.jks` y alias
- Selecciona build variant: **release**
- Marca **V1** y **V2 signatures**
- Pulsa **Finish**

El archivo final estará en:
```
android/app/build/outputs/bundle/release/app-release.aab
```

**Ese .aab es el que subes a Play Console.**

---

## 7. 🎨 Iconos y splash (opcional pero recomendado)

Instala el helper:
```bash
yarn add -D @capacitor/assets
```
Crea `assets/icon.png` (1024×1024) y `assets/splash.png` (2732×2732) en la raíz del frontend.
Luego:
```bash
npx capacitor-assets generate --android
npx cap sync android
```

---

## 8. 🚀 Subir a Play Console

1. Entra a <https://play.google.com/console> (cuota única de **$25 USD** para crear la cuenta de developer).
2. **Crear aplicación → Nombre: AgriScan → Español**
3. Rellena:
   - Descripción breve
   - Descripción larga
   - Capturas de pantalla (mín. 2)
   - Icono 512×512
   - Gráfico de funciones 1024×500
   - Clasificación de contenido
   - Política de privacidad (puedes alojarla gratis en GitHub Pages)
4. **Producción → Crear nueva versión → Subir `app-release.aab`**
5. Revisa, confirma y **Enviar a revisión** (tarda 1–3 días).

---

## 📝 Datos clave del proyecto

| Campo | Valor |
|---|---|
| **App ID** | `com.agriscan.app` |
| **App Name** | AgriScan |
| **Version** | se controla en `android/app/build.gradle` (`versionCode` y `versionName`) |
| **Permisos** | Cámara (QR), Internet, Bluetooth (impresora) |

Cuando subas una nueva versión, incrementa en `android/app/build.gradle`:
```gradle
versionCode 2
versionName "1.1"
```
Luego: `yarn build && npx cap sync android` → genera un nuevo AAB firmado.

---

## 🧪 Probar en un dispositivo real antes de subir

Con el celular conectado por USB (modo desarrollador):
```bash
npx cap run android
```
O desde Android Studio: pulsa ▶️ con el dispositivo seleccionado.
