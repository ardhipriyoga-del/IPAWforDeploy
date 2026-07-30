import { Router, type IRouter } from "express";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchGAS(
  url: string,
  options: RequestInit,
): Promise<{ ok: boolean; status: number; body: string }> {
  const ctrl = new AbortController();
  // 22 s — safely under the 26 s Netlify Function timeout cap
  const timeout = setTimeout(() => ctrl.abort(), 22_000);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal, redirect: "follow" });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Detect Google login/auth redirect ─────────────────────────────────────────
// Only match real Google OAuth / sign-in pages, NOT generic GAS JSON responses.
function isGoogleAuthPage(body: string, finalUrl?: string): boolean {
  // Check URL-based clues (most reliable)
  if (finalUrl) {
    const u = finalUrl.toLowerCase();
    if (
      u.includes("accounts.google.com") ||
      u.includes("servicelogin") ||
      u.includes("signin/identifier")
    ) {
      return true;
    }
  }

  // Body-based: only match very specific OAuth page signatures
  if (
    body.includes("accounts.google.com/signin") ||
    body.includes("accounts.google.com/ServiceLogin") ||
    body.includes("accounts.google.com/o/oauth2") ||
    body.includes('id="identifierId"') ||
    body.includes("Sign in - Google Accounts")
  ) {
    return true;
  }

  return false;
}

// ── GAS fetch that also returns final URL after redirects ─────────────────────
async function fetchGASWithUrl(
  url: string,
  options: RequestInit,
): Promise<{ ok: boolean; status: number; body: string; finalUrl: string }> {
  const ctrl = new AbortController();
  // 22 s — safely under the 26 s Netlify Function timeout cap
  const timeout = setTimeout(() => ctrl.abort(), 22_000);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal, redirect: "follow" });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body, finalUrl: res.url };
  } finally {
    clearTimeout(timeout);
  }
}

// ── GET /api/cloud/status — cek konektivitas ke GAS ──────────────────────────
router.get("/cloud/status", async (req, res) => {
  const targetUrl = req.query.url as string | undefined;
  if (!targetUrl) {
    res.status(400).json({ error: "Missing required query param: url" });
    return;
  }

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const r = await fetch(`${targetUrl}?action=status`, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
        },
      });
      clearTimeout(timeout);
      const body = await r.text();

      // If GAS redirects to Google login → treat as offline/unreachable
      if (isGoogleAuthPage(body, r.url)) {
        res.json({ online: false, reason: "auth_required" });
        return;
      }

      // Any HTTP 200 response from GAS (including error JSON) means the script is reachable
      if (r.status === 200) {
        res.json({ online: true });
        return;
      }

      // HTTP 302/301 to google auth already handled above via r.url check
      // For other non-200 responses, try a plain GET to the base URL
      const r2 = await fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(10_000), // 10 s hard cap on fallback check
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      const body2 = await r2.text();
      if (isGoogleAuthPage(body2, r2.url)) {
        res.json({ online: false, reason: "auth_required" });
      } else {
        res.json({ online: r2.status < 500 });
      }
    } catch {
      clearTimeout(timeout);
      res.json({ online: false });
    }
  } catch {
    res.json({ online: false });
  }
});

// ── Strip large binary fields agar URL tidak melebihi batas ──────────────────
// GAS menggunakan doGet dengan ?data=<encoded_json> untuk menyimpan backup.
// Field base64 (PDF, foto) bisa sangat besar dan membuat URL terlalu panjang.
function stripLargeBinaryFields(
  database: Record<string, any[]>,
): Record<string, any[]> {
  const result: Record<string, any[]> = {};
  for (const [store, rows] of Object.entries(database)) {
    if (!Array.isArray(rows)) {
      result[store] = [];
      continue;
    }
    if (store === "operanShifts") {
      // pdfBase64 bisa ratusan KB per record
      result[store] = rows.map(({ pdfBase64: _pdf, ...rest }: any) => rest);
    } else if (store === "pendings") {
      // fotoBase64 bisa besar jika ada foto lampiran
      result[store] = rows.map(({ fotoBase64: _foto, ...rest }: any) => rest);
    } else if (store === "activityLogs") {
      // Batasi ke 500 log terbaru agar tidak terlalu besar
      result[store] = rows.slice(-500);
    } else {
      result[store] = rows;
    }
  }
  return result;
}

// ── Normalise backup payloads from current and legacy clients ─────────────────
// Older deployments have sent the database under `data`/`backup`, as a JSON
// string, or with the singular `user` store name. Keep the safety check below
// strict: a payload is only accepted when a non-empty users array is found.
function normaliseBackupDatabase(payload: any): Record<string, any[]> {
  const seen = new Set<object>();
  // Prefer the actual database envelope so a compatibility `users` field at
  // the request root cannot cause the other stores to be dropped.
  const queue: unknown[] = [
    payload?.database,
    payload?.data,
    payload?.backup,
    payload?.payload,
    payload?.body,
    payload,
  ];

  while (queue.length > 0) {
    let candidate = queue.shift();

    // Some serverless clients wrap or stringify the body more than once.
    for (let depth = 0; depth < 3 && typeof candidate === "string"; depth += 1) {
      try {
        candidate = JSON.parse(candidate);
      } catch {
        candidate = null;
        break;
      }
    }

    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }

    const object = candidate as Record<string, unknown>;
    if (seen.has(object)) continue;
    seen.add(object);

    const normalised: Record<string, any[]> = {};
    for (const [key, value] of Object.entries(object)) {
      if (Array.isArray(value)) normalised[key] = value;
    }

    // Accept case variations and the legacy singular store name.
    const usersEntry = Object.entries(object).find(
      ([key, value]) =>
        Array.isArray(value) &&
        ["users", "user", "masterusers", "masteruser", "master user"].includes(
          key.replace(/[_-]/g, " ").toLowerCase(),
        ),
    );
    if (usersEntry) normalised.users = usersEntry[1] as any[];

    if (Array.isArray(normalised.users) && normalised.users.length > 0) {
      return normalised;
    }

    // Continue through common wrapper names, including nested legacy envelopes.
    for (const key of ["database", "data", "backup", "payload", "body"]) {
      if (object[key] !== undefined) queue.push(object[key]);
    }
  }

  return {};
}

// ── POST /api/cloud/backup — kirim data ke GAS via GET ───────────────────────
// GAS menggunakan doGet dengan query param ?action=restore&apiKey=...&data=...
// untuk menyimpan backup ke Google Drive. doPost digunakan untuk restore (baca).
// Client mengirim POST ke server ini; server meneruskan ke GAS via GET.
router.post("/cloud/backup", async (req, res) => {
  const targetUrl = req.query.url as string | undefined;
  if (!targetUrl) {
    res.status(400).json({ error: "Missing required query param: url" });
    return;
  }

  try {
    // Parse body dari client
    const rawBody =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      res.status(400).json({ error: "Body yang dikirim bukan JSON yang valid" });
      return;
    }

    const apiKey: string = payload.apiKey ?? "";
    const database = normaliseBackupDatabase(payload);

    // Master User adalah bagian wajib dari backup. Jangan teruskan payload
    // parsial ke GAS karena restore berikutnya dapat menghapus akun lokal.
    if (!Array.isArray(database.users) || database.users.length === 0) {
      res.status(400).json({
        error: "Payload backup tidak memiliki Master User (users). Backup dibatalkan.",
      });
      return;
    }

    // Strip field binary besar agar payload sekecil mungkin
    const stripped = stripLargeBinaryFields(database);
    const bodyStr = JSON.stringify(stripped);

    // Kandidat action untuk operasi upload/simpan — dicoba berurutan sampai berhasil
    const UPLOAD_ACTIONS = ["save", "backup", "upload", "store", "write", "simpan"];

    let lastError = "GAS tidak mengenali action upload apapun";
    let successResult: any = null;

    for (const action of UPLOAD_ACTIONS) {
      const payload = JSON.stringify({ action, apiKey, database: stripped });

      const result = await fetchGASWithUrl(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
        },
        body: payload,
      });

      if (isGoogleAuthPage(result.body, result.finalUrl)) {
        res.status(403).json({
          error:
            'Google Apps Script memerlukan autentikasi. Pastikan script di-deploy dengan: "Execute as: Me" dan "Who has access: Anyone" (atau "Anyone, even anonymous").',
        });
        return;
      }

      let json: any = null;
      try { json = JSON.parse(result.body); } catch { /* non-JSON */ }

      // Jika GAS mengembalikan "Unknown action: X", coba action berikutnya
      const errText: string = json?.error || json?.message || "";
      if (errText.toLowerCase().startsWith("unknown action")) {
        lastError = errText;
        continue;
      }

      // Respons non-200 yang bukan "Unknown action" → error nyata, stop
      if (!result.ok) {
        const preview = result.body.slice(0, 300).replace(/\s+/g, " ").trim();
        res.status(502).json({
          error: `GAS merespons HTTP ${result.status} dengan action "${action}". ${json?.error || json?.message || preview}`,
        });
        return;
      }

      if (json && json.success === false) {
        res.status(502).json({
          error: json.message || json.error || `GAS menolak upload dengan action "${action}"`,
        });
        return;
      }

      // Berhasil — catat action yang bekerja dan selesai
      successResult = { success: true, action, detail: json };
      break;
    }

    if (!successResult) {
      res.status(502).json({
        error: `GAS tidak mengenali action upload apapun (dicoba: ${UPLOAD_ACTIONS.join(", ")}). Periksa kode doPost di Google Apps Script. Error terakhir: ${lastError}`,
      });
      return;
    }

    res.json(successResult);
  } catch (err: any) {
    const message =
      err?.name === "AbortError"
        ? "Request ke Google Apps Script timeout (>30 detik)"
        : err?.message ?? "Unknown error";
    res.status(502).json({ error: message });
  }
});

// ── GET /api/cloud/restore — ambil data dari GAS ─────────────────────────────
// GAS baru menggunakan doPost dengan action:'restore' untuk operasi download.
// Route ini menerima GET dari client, lalu meneruskan ke GAS via POST.
router.get("/cloud/restore", async (req, res) => {
  const targetUrl = req.query.url as string | undefined;
  if (!targetUrl) {
    res.status(400).json({ error: "Missing required query param: url" });
    return;
  }

  // Ekstrak apiKey dari query param url jika ada, atau gunakan default
  let baseUrl = targetUrl;
  let apiKey = "IPAW-EMC";
  try {
    const parsed = new URL(targetUrl);
    const qApiKey = parsed.searchParams.get("apiKey");
    if (qApiKey) apiKey = qApiKey;
    // Kirim ke base URL GAS (tanpa query params) via POST
    parsed.search = "";
    baseUrl = parsed.toString();
  } catch { /* pakai targetUrl apa adanya */ }

  const postBody = JSON.stringify({ action: "restore", apiKey });

  try {
    const result = await fetchGASWithUrl(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
        Accept: "application/json, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: postBody,
    });

    if (isGoogleAuthPage(result.body, result.finalUrl)) {
      res.status(403).json({
        error:
          'Google Apps Script memerlukan autentikasi. Pastikan script di-deploy ulang dengan pengaturan: "Execute as: Me" dan "Who has access: Anyone" (atau "Anyone, even anonymous"). Hubungi admin untuk update deployment GAS.',
      });
      return;
    }

    if (!result.ok) {
      res.status(502).json({ error: `GAS merespons HTTP ${result.status}` });
      return;
    }

    // Parse JSON; jika gagal coba ekstrak dari body
    let json: any;
    try {
      json = JSON.parse(result.body);
    } catch {
      const match = result.body.match(/(\{[\s\S]*\})/);
      if (match) {
        try { json = JSON.parse(match[1]); } catch { /* still failed */ }
      }
      if (!json) {
        const preview = result.body.slice(0, 300).replace(/\s+/g, " ").trim();
        res.status(502).json({
          error: `Respons dari GAS bukan JSON yang valid. (Pratinjau: ${preview})`,
        });
        return;
      }
    }

    // Normalise: GAS mungkin mengembalikan { success, database } atau { success, data }
    if (json && json.success && json.database !== undefined) {
      res.json({ success: true, data: json.database, metadata: json.metadata });
    } else {
      res.json(json);
    }
  } catch (err: any) {
    const message =
      err?.name === "AbortError"
        ? "Request ke Google Apps Script timeout (>30 detik)"
        : err?.message ?? "Unknown error";
    res.status(502).json({ error: message });
  }
});

export default router;
