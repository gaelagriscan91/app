# Cross-Platform Port Blueprint: AgriScan

## 1. Detection
- **Source Platform**: Web (React, Tailwind, Shadcn UI) detected in `/app/frontend`. Evidence includes `package.json`, `tailwind.config.js`, and pages mapped to React Router.
- **Target Platform**: Mobile (React Native, Expo) detected in `/app/mobile`. Evidence includes `app.json`, `metro.config.js`, and Expo Router file structure under `/app`.
- **Assumption**: Based on the extensive web implementation and the mobile app containing React Native components, the intent is to map the original React web app to its Expo mobile counterpart, sharing the backend.

## 2. Existing App Map (Web)
### Screens / Routes
- **Auth**: `/login`, `/register`, `/forgot-password`, `/reset-password`
- **Dashboard/Core**: Wrapper protecting authenticated routes via `AppLayout.jsx` (Header with User info, Admin badge, Blocked banner).
- **Tabs**:
  - `/registrar` (`RegistrarCosecha.jsx` -> `QuickHarvest.jsx`): Core harvest registration. QR scanning, piece/weight modes, pricing, and live records view.
  - `/asistencia` (`Asistencia.jsx`): Check-in / out flow. Configures session (Rancho, Block, Variety) before operations.
  - `/dia` (`ListaDia.jsx`): List of daily harvest records and attendance.
  - `/reportes` (`Reportes.jsx`): Export capabilities (Excel), historical receipts, and payroll summaries.
  - `/modulos` (`Modulos.jsx`): Admin hub for Employees (Workers), Crews, Recycle bin (Trash), and Settings/Paywall.

### Components & State
- **Contexts**: `AuthContext` (session management and paywall triggers).
- **Key UI Patterns**: Custom `ConfirmHost` dialog replacing native alerts; `PaywallDialog` for PayPal sub handling; `QrScanner` using HTML5 video stream and jsQR.

### Primary User Flows
1. **Auth & Access**: Standard JWT login. Blocked/Trial accounts hit a PayPal paywall overlay.
2. **Operations Prep**: User defines Rancho/Block settings in `Asistencia`.
3. **Registration**: Scan worker QR -> Input amounts -> Send to backend. Multi-worker shared pieces supported.
4. **Closing**: Export day’s summary via Excel or print ESC/POS tickets directly.

## 3. Shared Backend API Surface
The FastAPI backend (`/app/backend/server.py`) uses Bearer JWT. The new mobile app must route all requests to the existing endpoints:

- **Auth**: 
  - `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`
  - `GET /api/auth/me`
- **Core Entities (Workers, Parcels, Products)**: 
  - `GET|POST|PUT|DELETE /api/workers`, `POST /api/workers/resolve`, `POST /api/workers/{wid}/regenerate-qr`
  - `GET|POST|PUT|DELETE /api/crews`, `/api/parcels`, `/api/products`
- **Operations (Harvests & Check-in)**: 
  - `GET|PUT /api/checkin-session`
  - `GET|POST|PUT|DELETE /api/harvests`, `GET /api/harvests/daily`, `GET /api/harvests/reset-check`, `POST /api/harvests/reset`
  - `GET|POST|DELETE /api/attendance`
- **Reports & Billing**: 
  - `GET /api/dashboard`, `GET /api/harvests/export`, `GET /api/payroll/export`, `GET /api/receipts/export`
  - `GET|POST|DELETE /api/receipts/history`, `GET|DELETE /api/receipts/trash`, `POST /api/receipts/trash/{hid}/restore`
  - `GET /api/billing/status`, `POST /api/billing/subscribe`, `POST /api/billing/cancel`

## 4. Data Models & Integrations
- **MongoDB Models**: `users`, `workers`, `crews`, `parcels`, `products`, `harvests`, `checkin_sessions`, `attendance`, `receipts_history`, `receipts_trash`.
- **Integrations Needing Target Variants**:
  - **Camera**: Move from web `jsQR` to mobile `expo-camera`.
  - **Printing**: Move from web Web-Bluetooth to `expo-print` (system print) or native thermal print integration.
  - **Excel/Export**: Move from standard web downloads (Blob) to `expo-file-system` and `expo-sharing`.
  - **Billing**: Mobile apps cannot easily use web popups for PayPal. Requires deep linking or WebView interception.
  - **Sounds**: Move from `WebAudio` to `expo-haptics` and `expo-av`.

## 5. Port Requirements (Target Platform: Expo Mobile)
- **Routing**: Use Expo Router (`app/(auth)` and `app/(tabs)`). Tabs must implement the 5 main flows (`registrar`, `asistencia`, `dia`, `reportes`, `modulos`).
- **Auth**: Replace HTTP Only cookie dependencies with `expo-secure-store` holding the Bearer token and manually attaching it via an Axios interceptor.
- **Components**: Translate Shadcn UI and Tailwind classes to React Native `StyleSheet`, `View`, `Text`, `TouchableOpacity`. Replace fixed headers with Safe Area aware components (`react-native-safe-area-context`).
- **QR Scanner**: Build a native QR Scanner view with `expo-camera`, ensuring proper unmounting when navigating away.
- **Offline/Sync**: Considering recent mobile codebase updates, wrap the `saveHarvest` and `attendance` operations in an offline queue that replays when `NetInfo` indicates connectivity.

## 6. Open Questions / Risks
- **App Store Compliance**: Implementing a direct PayPal link in the mobile app may violate iOS App Store and Google Play billing guidelines. Does the app strictly target internal Enterprise distribution (APK/IPA sideloading) to bypass IAP rules?
- **Offline Reliability**: For offline harvest captures, how should concurrent edits or deletes be synced if multiple supervisors edit the same worker's data?
- **Direct Bluetooth Thermal Printing**: Expo Go doesn't support direct Bluetooth. Has a custom dev client been generated to test `react-native-ble-plx`, or is the fallback system share sheet sufficient for V1?
