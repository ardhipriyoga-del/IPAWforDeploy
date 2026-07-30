import { Router, type IRouter } from "express";

const router: IRouter = Router();

const KTM_URL =
  "https://appsprn.emc.id/trakcare/dashboard/list/trakcareANLT/type/ktm/hospital/4";

// ── HTML parsers ──────────────────────────────────────────────────────────────

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

export interface KTMPatient {
  noRM: string;
  episodeNo: string;
  namaPasien: string;
  ruangan: string;
  kelas: string;
  dpjp: string;
  tanggalKTM: string;
  jamKTM: string;
  tanggalJamKTM: string;
  ward: string;
}

function parseKTMPatients(html: string): KTMPatient[] {
  const patients: KTMPatient[] = [];

  // Try to find tbody
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const bodyContent = tbodyMatch ? tbodyMatch[1] : html;

  // Extract table rows
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(bodyContent)) !== null) {
    const rowHTML = rowMatch[1];

    // Skip header rows
    if (/<th[^>]*>/i.test(rowHTML)) continue;

    // Extract cells
    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowHTML)) !== null) {
      cells.push(cellMatch[1]);
    }

    if (cells.length < 4) continue;

    // Try to parse common KTM table formats
    // Format 1: [No, RM/Episode, Nama, Ruangan/Kelas, DPJP, Tanggal KTM]
    // Format 2: [Ward, Class, MRN/Ep, Nama, DOB/Sex, Payor, Tgl KTM, DPJP]

    // Detect format by cell count
    if (cells.length >= 6) {
      // Assume: col[0]=no/ward, col[1]=RM, col[2]=nama, col[3]=ruangan, col[4]=dpjp, col[5]=tanggal
      // Try extracting RM (look for numeric-like value)
      let noRM = "";
      let episodeNo = "";
      let namaPasien = "";
      let ruangan = "";
      let kelas = "";
      let dpjp = "";
      let tanggalJamKTM = "";
      let ward = "";

      // Try RM/Episode pattern in various cells
      for (let i = 0; i < cells.length; i++) {
        const text = stripTags(cells[i]).trim();
        const parts = splitByBr(cells[i]);

        // MRN usually looks like 7-8 digit number
        if (!noRM && /^\d{6,8}$/.test(text)) {
          noRM = text;
          if (parts[1]) episodeNo = parts[1];
          continue;
        }
        if (!noRM && parts.length >= 2 && /^\d{6,8}$/.test(parts[0])) {
          noRM = parts[0];
          episodeNo = parts[1];
          continue;
        }
      }

      // Parse based on cell positions for common TrakCare KTM layout
      // Typical layout: Ward+Room | Class | MRN\nEpisode | Nama | DOB\nGender | Payor | Tgl KTM | DPJP
      if (cells.length >= 8) {
        const wardText = stripTags(cells[0].replace(/<br\s*\/?>/gi, " ")).trim();
        ward = wardText.split(/\s+PK\s+/)[0] || wardText;
        kelas = stripTags(cells[1]).trim();
        const mrnParts = splitByBr(cells[2]);
        noRM = mrnParts[0] || "";
        episodeNo = mrnParts[1] || "";
        if (!noRM) continue;
        namaPasien = stripTags(cells[3]).trim();
        dpjp = stripTags(cells[7]).trim();
        // Tanggal KTM might be in cells[6] (after payor)
        tanggalJamKTM = stripTags(cells[6]).trim();
        ruangan = wardText;
      } else if (cells.length >= 6) {
        // Simpler format
        // col[0] = no (skip), col[1] = ward/ruangan, col[2] = RM/Ep, col[3] = nama, col[4] = dpjp, col[5] = tgl
        ruangan = stripTags(cells[1]).trim() || stripTags(cells[0]).trim();
        const mrnParts = splitByBr(cells[2]);
        noRM = mrnParts[0] || "";
        episodeNo = mrnParts[1] || "";
        if (!noRM) {
          // Try col[0] if it starts with digit
          const col0 = stripTags(cells[0]).trim();
          if (/^\d{6,8}/.test(col0)) {
            noRM = col0.match(/\d{6,8}/)?.[0] || col0;
          }
        }
        if (!noRM) continue;
        namaPasien = stripTags(cells[3]).trim();
        dpjp = stripTags(cells[4]).trim();
        tanggalJamKTM = stripTags(cells[5]).trim();
      }

      if (!noRM) continue;

      // Parse date/time
      let tanggalKTM = "";
      let jamKTM = "";
      if (tanggalJamKTM) {
        // Common formats: "2025-01-15 14:30" or "15/01/2025 14:30" or "15-01-2025"
        const dtMatch = tanggalJamKTM.match(/(\S+)\s+(\d{2}:\d{2})/);
        if (dtMatch) {
          tanggalKTM = dtMatch[1];
          jamKTM = dtMatch[2];
        } else {
          tanggalKTM = tanggalJamKTM;
        }
      }

      patients.push({
        noRM,
        episodeNo,
        namaPasien,
        ruangan,
        kelas,
        dpjp,
        tanggalKTM,
        jamKTM,
        tanggalJamKTM: tanggalJamKTM || `${tanggalKTM} ${jamKTM}`.trim(),
        ward,
      });
    }
  }

  return patients;
}

// ── GET /api/trakcare/ktm ─────────────────────────────────────────────────────
router.get("/trakcare/ktm", async (req, res) => {
  const ward = (req.query.ward as string | undefined) ?? "";
  const targetUrl = `${KTM_URL}?ward=${encodeURIComponent(ward)}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      res
        .status(502)
        .json({ error: `TrakCare responded with HTTP ${response.status}` });
      return;
    }

    const html = await response.text();
    const patients = parseKTMPatients(html);

    res.json({
      patients,
      total: patients.length,
      fetchedAt: new Date().toISOString(),
      source: targetUrl,
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
