# Cross-Platform Port Blueprint: AgriScan

## 1. Detection
- **Source Platform**: Web (React, Tailwind, Shadcn UI) detected in `/app/frontend`.
- **Target Platform**: Mobile (React Native, Expo, Expo Router) detected in `/app/mobile`.
- **Evidence**: `/app/frontend/src` contains a complete React web application with routing (`App.js`), pages, and components. `/app/mobile/app` contains a fresh Expo Router boilerplate without application code.

## 2. Existing App Map (Web)
### Screens / Routes
- **Auth**: `/login`, `/register`, `/forgot-password`, `/reset-password`
- **Main Shell (`AppLayout.jsx`)**: Wrapper protecting authenticated routes. Features a top header (User info, Admin badge, Logout), an optional Trial/Blocked banner, a main scrollable content area, and a fixed bottom tab navigation.
- **Tabs**:
  - `/registrar` (`RegistrarCosecha.jsx` -> `QuickHarvest.jsx`): Core flow for registering harvests. Supports QR scanning, employee search, weight/pieces inputs, pricing, and a quick view of today's records.
  - `/asistencia` (`Asistencia.jsx`): Check-in and Check-out flow for workers. Requires setting Rancho, Block, Task, Variety.
  - `/dia` (`ListaDia.jsx`): List of today's records (harvests and checked-in workers).
  - `/reportes` (`Reportes.jsx`): Report generation, historical receipts, and payroll export capabilities.
  - `/modulos` (`Modulos.jsx`): Settings hub (Workers, Crew, Mayordomos, Support, Plan/Paywall).

### Components & State
- **Context**: `AuthContext` (managing user session, `blocked` status, and triggering the `PaywallDialog`).
- **Key Reusable Components**: 
  - `QrScanner`: Camera implementation using `<video>` and `jsQR` with continuous stream management.
  - `ConfirmHost`: Custom dialog system overriding native `window.confirm`.
  - `PaywallDialog`: PayPal subscription modal.
  - `LogoHandCherry`: App branding.

### Primary User Flows
1. **Authentication**: Login/Register. If trial expires or unpaid, user enters a restricted state triggering Paywall.
2. **Setup**: Defining Rancho/Block (Check-in context) before operations.
3. **Operations**: Scanning employee QRs or manually selecting them -> Inputting harvest quantity -> Saving.
4. **End of Day**: Viewing daily list -> Exporting reports or printing ESC/POS tickets.

## 3. Shared Backend API Surface
The backend (`/app/backend/server.py`) is shared and will be consumed via standard HTTP requests by the new mobile app. The backend supports `Authorization: Bearer <token>` natively, providing a smooth path for mobile auth.

### Authentication & Users
- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/change-password`
- `GET /auth/me`

### Core Entities (CRUD)
- **Workers**: `GET|POST /workers`, `PUT|DELETE /workers/{wid}`, `POST /workers/{wid}/regenerate-qr`, `POST /workers/resolve`
- **Crews**: `GET|POST /crews`, `PUT|DELETE /crews/{cid}`
- **Parcels/Products**: `GET|POST /parcels`, `PUT|DELETE /parcels/{pid}`, `GET|POST /products`, `PUT|DELETE /products/{pid}`

### Daily Operations
- **Check-in/Attendance**: `GET|PUT /checkin-session`, `GET /attendance`, `POST /attendance/scan`, `DELETE /attendance/{aid}`
- **Harvests**: `GET|POST /harvests`, `PUT|DELETE /harvests/{hid}`
- **Dashboard**: `GET /dashboard`, `GET /harvests/daily`

### Reports & Billing
- **Exports**: `GET /harvests/export`, `GET /receipts/export`, `GET /payroll/export`
- **History/Receipts**: `GET|POST /receipts/history`, `GET|DELETE /receipts/history/{hid}`, `GET /receipts/trash`, `POST /receipts/trash/{hid}/restore`, `DELETE /receipts/trash/{hid}`
- **Payroll**: `GET /receipts`, `GET /payroll`
- **Billing (PayPal)**: `GET /billing/status`, `POST /billing/subscribe`, `POST /billing/confirm`, `POST /billing/cancel`, `POST /billing/paypal-webhook`

### Admin & System
- **Mayordomos**: `GET|POST /admin/mayordomos`, `PATCH|DELETE /admin/mayordomos/{uid}`
- **Files**: `POST /upload`, `GET /files/{path:path}`
- **Cron/Health**: `POST /cron/daily-close`, `GET /health`, `GET /api/health`

## 4. Data Models & Integrations
- **MongoDB Collections**: `users`, `workers`, `crews`, `parcels`, `products`, `harvests`, `checkin_sessions`, `receipts_history`, `receipts_trash`, `attendance`, `billing_config`, `cron_runs`, `login_attempts`, `password_reset_tokens`, `password_reset_requests`, `files`.
- **Target Platform Integration Variants Required**:
  - **Camera**: The web `jsQR` solution must be replaced with `expo-camera` for native barcode scanning.
  - **Printing**: The web Web-Bluetooth ESC/POS implementation must be evaluated. Target platform will need `expo-print` (for HTML tickets) or a native Bluetooth module (`react-native-ble-plx`) for direct thermal printing.
  - **Billing (PayPal)**: Instead of a standard web redirect, mobile requires using `expo-web-browser` or `react-native-webview` to open the `approve_url` and intercept the deep link callback.
  - **File Downloads (Excel)**: Web relies on Blob URLs and `<a>` downloads. Mobile must use `expo-file-system` to save the generated report and `expo-sharing` to share/export it.
  - **Sound Effects**: Web uses WebAudio API (`lib/sounds.js`). Mobile will need `expo-av` or `expo-haptics` for scan feedback.

## 5. Port Requirements (Target Platform: Mobile/Expo)

### Navigation & Shell (expo-router)
- Setup `app/(auth)` for `login.tsx`, `register.tsx`, `forgot-password.tsx`.
- Setup `app/(tabs)` as the main layout (`_layout.tsx`) replacing `AppLayout.jsx`. Implement standard React Native Bottom Tabs.
- Implement Custom Headers in the `(tabs)` layout to include User Name, Admin badge, Logout button, and the Blocked/Trial banner.

### Screen Translations
- **`app/(tabs)/registrar.tsx`**: Port `QuickHarvest.jsx`. Use React Native `TextInput` with `keyboardType="numeric"`. Wrap in `KeyboardAvoidingView`. Add a modal/overlay for `expo-camera` to scan QRs. Call `POST /harvests`.
- **`app/(tabs)/asistencia.tsx`**: Port `Asistencia.jsx`. Use `ScrollView` and standard RN touchables. Call `POST /attendance/scan`.
- **`app/(tabs)/dia.tsx`**: Port `ListaDia.jsx`. Use `FlatList` to render the today's records mapped from `GET /dashboard`.
- **`app/(tabs)/reportes.tsx`**: Port `Reportes.jsx`. Call export endpoints (e.g., `GET /harvests/export`). Implement `expo-file-system` + `expo-sharing` to handle the Excel buffer download.
- **`app/(tabs)/modulos.tsx`**: Port `Modulos.jsx`. List settings natively using `SectionList` or mapped views.

### Auth & State
- Create an `AuthContext` wrapper in `app/_layout.tsx`.
- Store the authentication token securely using `expo-secure-store`.
- Configure the Axios instance to append `Authorization: Bearer <token>` instead of relying on cookies (since the backend already supports Bearer auth natively, avoiding React Native cookie syncing issues).

### Styling
- Convert Tailwind utility classes to React Native `StyleSheet.create` definitions.
- Implement responsive safe-areas (`react-native-safe-area-context`) for notches.

## 6. Open Questions / Risks
- **Bluetooth ESC/POS Printing**: Does V1 of the mobile app require direct Bluetooth thermal printing? If yes, `react-native-ble-plx` is required (which may prevent using standard Expo Go and require custom Dev Clients). If not, we can fallback to `expo-print`.
- **PayPal Return URL**: Deep-linking back to the app from the PayPal web flow requires defining an app scheme in `app.json` and updating the backend's return URL logic, or relying on Webhooks to update state and polling on the client side.
- **Camera Permissions**: Native mobile will explicitly request camera permissions on first scan. The flow needs proper error handling if the user denies the permission.
