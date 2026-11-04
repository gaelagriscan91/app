import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { API_BASE } from "@/src/api/client";
import { tokenStore } from "@/src/api/tokenStore";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Download an authenticated Excel export from the backend and open the share sheet.
 * `endpoint` is relative to /api (e.g. "/harvests/export").
 */
export async function downloadAndShareExcel(
  endpoint: string,
  params: Record<string, string | number | undefined>,
  filename: string,
) {
  const token = await tokenStore.getAccess();
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const url = `${API_BASE}${endpoint}${qs ? `?${qs}` : ""}`;
  const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory || "";
  const fileUri = `${dir}${filename}`;
  const res = await FileSystem.downloadAsync(url, fileUri, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status >= 400) throw new Error(`Export falló (${res.status})`);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(res.uri, { mimeType: XLSX_MIME, dialogTitle: "Compartir Excel", UTI: "org.openxmlformats.spreadsheetml.sheet" });
  }
  return res.uri;
}
