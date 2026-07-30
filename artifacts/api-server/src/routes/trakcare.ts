import { Router, type IRouter } from "express";

const router: IRouter = Router();

const TRAKCARE_URL =
  "https://apps.emc.id/trakcare/dashboard/dailyinpatient/trakcareANLT/hospital/4";

// ── HTML parsers (regex-based, no DOM needed in Node.js) ─────────────────────

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function splitByBr(html: string): string[] {
  return html
    .replace(/<br\s*\/?>/gi, "|")
    .split("|")
    .map((s) => stripTags(s).trim())
    .filter(Boolean);
}

function parseWardRoom(text: string): {
  ward: string;
  room: string;
  bed: string;
} {
  // Format: "{WardName} PK {RoomCode} PK {BedCode}"
  // e.g. "Jasmine PK 520 PK B2 - II"  → ward:"Jasmine", room:"PK 520", bed:"PK B2 - II"
  // e.g. "Ruang Pelayanan Intensive PK ICU PK B2 - ICU"
  const parts = text.split(/ PK /);
  if (parts.length >= 3) {
    return {
      ward: parts[0].trim(),
      room: `PK ${parts[1].trim()}`,
      bed: `PK ${parts.slice(2).join(" PK ").trim()}`,
    };
  } else if (parts.length === 2) {
    return {
      ward: parts[0].trim(),
      room: `PK ${parts[1].trim()}`,
      bed: "",
    };
  }
  return { ward: text.trim(), room: text.trim(), bed: "" };
}

interface TrakCarePatient {
  noRM: string;
  episodeNo: string;
  namaPasien: string;
  dob: string;
  sexDesc: string;
  payor: string;
  dpjp: string;
  ward: string;
  roomName: string;
  roomType: string;
  bedCode: string;
  admissionDate: string;
}

function parsePatients(html: string): TrakCarePatient[] {
  const patients: TrakCarePatient[] = [];

  // Extract tbody
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return patients;

  // Extract each row
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(tbodyMatch[1])) !== null) {
    const rowHTML = rowMatch[1];

    // Extract each cell
    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowHTML)) !== null) {
      cells.push(cellMatch[1]);
    }

    if (cells.length < 8) continue;

    // col[0]: Ward Room Bed (plain text after stripping)
    const wardRoomText = stripTags(
      cells[0].replace(/<br\s*\/?>/gi, " ")
    ).trim();

    // col[1]: Class / Kelas
    const roomType = stripTags(cells[1]).trim();

    // col[2]: MRN<br>Episode
    const mrnParts = splitByBr(cells[2]);
    const noRM = mrnParts[0] ?? "";
    const episodeNo = mrnParts[1] ?? "";
    if (!noRM) continue;

    // col[3]: Nama
    const namaPasien = stripTags(cells[3]).trim();

    // col[4]: DOB<br>Sex
    const dobParts = splitByBr(cells[4]);
    const dob = dobParts[0] ?? "";
    const sexDesc = dobParts[1] ?? "";

    // col[5]: Payor
    const payor = stripTags(cells[5]).trim();

    // col[6]: LOS — calculate admission date
    const losMatch = stripTags(cells[6]).match(/(\d+)/);
    const losDays = losMatch ? parseInt(losMatch[1], 10) : 0;
    const admissionDate =
      losDays > 0
        ? new Date(Date.now() - losDays * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0]
        : new Date().toISOString().split("T")[0];

    // col[7]: DPJP
    const dpjp = stripTags(cells[7]).trim();

    const { ward, room, bed } = parseWardRoom(wardRoomText);

    patients.push({
      noRM,
      episodeNo,
      namaPasien,
      dob,
      sexDesc,
      payor,
      dpjp,
      ward,
      roomName: room,
      roomType,
      bedCode: bed,
      admissionDate,
    });
  }

  return patients;
}

// ── GET /api/trakcare/patients ────────────────────────────────────────────────
router.get("/trakcare/patients", async (req, res) => {
  const targetUrl = (req.query.url as string | undefined) || TRAKCARE_URL;
  try {
    const response = await fetch(targetUrl, {
      headers: { Accept: "text/html" },
      // 15-second timeout
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      res
        .status(502)
        .json({ error: `TrakCare responded with HTTP ${response.status}` });
      return;
    }

    const html = await response.text();
    const patients = parsePatients(html);

    res.json({
      patients,
      total: patients.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    const message =
      err?.name === "TimeoutError"
        ? "Request ke TrakCare timeout (>15 detik)."
        : err?.message ?? "Unknown error";
    res.status(502).json({ error: message });
  }
});

// ── IGD Emergency Waiting Time ────────────────────────────────────────────────

const IGD_URL =
  "https://apps.emc.id/trakcare/dashboard/dailyemergencywaitingtime/trakcareANLT/hospital/4";

interface IGDPatient {
  nama: string;
  noRM: string;
  dokter: string;
  lokasi: string;
  timerOutpatient: string;
  timerTransfer: string;
  timerColor: string; // 'merah' | 'kuning' | 'hijau' | 'hitam' | ''
}

function parseIGDPatients(html: string): IGDPatient[] {
  const patients: IGDPatient[] = [];

  // Split by card boundary
  const cardBlocks = html.split('<div class="col-md-3 mb-4">').slice(1);

  for (const block of cardBlocks) {
    if (!block.includes("background-color:lavender")) continue;

    // Extract two timer cells (col-6 text-center h1 [colorClass])
    const timerRegex =
      /<div class="col-6 text-center h1\s*([^"]*)">([\s\S]*?)<\/div>/gi;
    const timers: { colorClass: string; value: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = timerRegex.exec(block)) !== null && timers.length < 2) {
      timers.push({ colorClass: m[1].trim(), value: stripTags(m[2]).trim() });
    }

    if (timers.length < 2) continue;

    // Patient has SPRI only when TRANSFER INPATIENT timer is not "--"
    const timerTransfer = timers[1].value;
    if (!timerTransfer || timerTransfer === "--") continue;

    // Extract patient info rows (col-12 font-weight-bold)
    const infoRegex =
      /<div class="col-12 font-weight-bold[^"]*">([\s\S]*?)<\/div>/gi;
    const infos: string[] = [];
    let im: RegExpExecArray | null;
    while ((im = infoRegex.exec(block)) !== null) {
      const t = stripTags(im[1]).trim();
      if (t) infos.push(t);
    }

    if (infos.length < 2) continue;

    patients.push({
      nama: infos[0] ?? "",
      noRM: infos[1] ?? "",
      dokter: infos[2] ?? "",
      lokasi: infos[3] ?? "",
      timerOutpatient: timers[0].value,
      timerTransfer,
      timerColor: timers[1].colorClass,
    });
  }

  return patients;
}

// ── GET /api/trakcare/discharge ───────────────────────────────────────────────
// Generic discharge endpoint — callers pass the full target URL as ?url=<encoded>
router.get("/trakcare/discharge", async (req, res) => {
  const targetUrl = req.query.url as string | undefined;
  if (!targetUrl) {
    res.status(400).json({ error: "Missing required query param: url" });
    return;
  }
  try {
    const response = await fetch(targetUrl, {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      res.status(502).json({ error: `TrakCare responded with HTTP ${response.status}` });
      return;
    }
    const html = await response.text();
    const patients = parsePatients(html);
    res.json({ patients, total: patients.length, fetchedAt: new Date().toISOString() });
  } catch (err: any) {
    const message = err?.name === "TimeoutError"
      ? "Request ke TrakCare timeout (>15 detik)."
      : err?.message ?? "Unknown error";
    res.status(502).json({ error: message });
  }
});

// ── IGD Ward: ALL patients (no timerTransfer filter) ─────────────────────────

function parseAllIGDPatients(html: string): IGDPatient[] {
  const patients: IGDPatient[] = [];
  const cardBlocks = html.split('<div class="col-md-3 mb-4">').slice(1);

  for (const block of cardBlocks) {
    if (!block.includes("background-color:lavender")) continue;

    // Extract timer cells
    const timerRegex =
      /<div class="col-6 text-center h1\s*([^"]*)">([\s\S]*?)<\/div>/gi;
    const timers: { colorClass: string; value: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = timerRegex.exec(block)) !== null && timers.length < 2) {
      timers.push({ colorClass: m[1].trim(), value: stripTags(m[2]).trim() });
    }

    const timerOutpatient = timers[0]?.value ?? "--";
    const timerTransfer = timers[1]?.value ?? "--";

    // Extract patient info rows (col-12 font-weight-bold)
    const infoRegex =
      /<div class="col-12 font-weight-bold[^"]*">([\s\S]*?)<\/div>/gi;
    const infos: string[] = [];
    let im: RegExpExecArray | null;
    while ((im = infoRegex.exec(block)) !== null) {
      const t = stripTags(im[1]).trim();
      if (t) infos.push(t);
    }

    if (infos.length < 2) continue;

    patients.push({
      nama: infos[0] ?? "",
      noRM: infos[1] ?? "",
      dokter: infos[2] ?? "",
      lokasi: infos[3] ?? "",
      timerOutpatient,
      timerTransfer,
      timerColor: timers[1]?.colorClass ?? "",
    });
  }

  return patients;
}

// ── GET /api/trakcare/igd-ward ────────────────────────────────────────────────
// Returns ALL IGD patients (including those without timerTransfer) for IGD Ward.
router.get("/trakcare/igd-ward", async (req, res) => {
  const targetUrl = (req.query.url as string | undefined) || IGD_URL;
  try {
    const response = await fetch(targetUrl, {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      res
        .status(502)
        .json({ error: `TrakCare responded with HTTP ${response.status}` });
      return;
    }

    const html = await response.text();
    const patients = parseAllIGDPatients(html);

    res.json({
      patients,
      total: patients.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    const message =
      err?.name === "TimeoutError"
        ? "Request ke TrakCare timeout (>15 detik)."
        : err?.message ?? "Unknown error";
    res.status(502).json({ error: message });
  }
});

// ── GET /api/trakcare/igd-patients ────────────────────────────────────────────
router.get("/trakcare/igd-patients", async (req, res) => {
  const targetUrl = (req.query.url as string | undefined) || IGD_URL;
  try {
    const response = await fetch(targetUrl, {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      res
        .status(502)
        .json({ error: `TrakCare responded with HTTP ${response.status}` });
      return;
    }

    const html = await response.text();
    const patients = parseIGDPatients(html);

    res.json({
      patients,
      total: patients.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    const message =
      err?.name === "TimeoutError"
        ? "Request ke TrakCare timeout (>15 detik)."
        : err?.message ?? "Unknown error";
    res.status(502).json({ error: message });
  }
});

export default router;
