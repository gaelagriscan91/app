import { storage } from "@/src/utils/storage";

// Plain key names only ([A-Za-z0-9._-]) so expo-secure-store accepts them on device.
// Backed by the template `storage` singleton: Keychain/SecureStore on native,
// localStorage on the web preview (index.web.ts) — so auth works on both surfaces.
const ACCESS = "auth_token";
const REFRESH = "refresh_token";

export const tokenStore = {
  getAccess: () => storage.secureGet<string | null>(ACCESS, null),
  getRefresh: () => storage.secureGet<string | null>(REFRESH, null),
  save: async (access: string, refresh: string) => {
    await Promise.all([storage.secureSet(ACCESS, access), storage.secureSet(REFRESH, refresh)]);
  },
  clear: async () => {
    await Promise.all([storage.secureRemove(ACCESS), storage.secureRemove(REFRESH)]);
  },
};
