/**
 * Client-side TrakCare HTML parsers.
 * Runs in the browser (DOMParser + regex), no Node.js dependencies.
 * Used in offline mode (file:// protocol) where backend proxy is unavailable.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RawInpatientPatient {
  noRM: string;
  episodeNo: string;
  namaPasien: string;
  ward: string;
  roomName: string;
  roomType: string;
  bedCode: string;
  dpjp: string;
  dob: string;
  sexDesc: string;
  payor: string;
  admissionDate: string;
}

export interface RawIGDPatient {
  nama: string;
  noRM: string;
  dokter: string;
  lokasi: string;
  timerOutpatient: string;
  timerTransfer: string;
  timerColor: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseWardRoom(text: string): { ward: string; room: string; bed: string } {
  const parts = text.split(/ PK /);
  if (parts.length >= 3) {
    return {
      ward: parts[0].trim(),
      room: `PK ${parts[1].trim()}`,
      bed: `PK ${parts.slice(2).join(' PK ').trim()}`,
    };
  } else if (parts.length === 2) {
    return { ward: parts[0].trim(), room: `PK ${parts[1].trim()}`, bed: '' };
  }
  return { ward: text.trim(), room: text.trim(), bed: '' };
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

// ── Inpatient parser (DOMParser) ──────────────────────────────────────────────
// Parses the standard dailyinpatient table (ALL, medical=Y, nurse=Y, pharmacy=Y)

export function parseInpatientHTML(html: string): RawInpatientPatient[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const patients: RawInpatientPatient[] = [];

  doc.querySelectorAll('tbody tr').forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 8) return;

    // col[0]: Ward PK Room PK Bed
    const wardRoomText = (cells[0].textContent ?? '').replace(/\s+/g, ' ').trim();

    // col[1]: Room type/class
    const roomType = cells[1].textContent?.trim() ?? '';

    // col[2]: NoRM <br> EpisodeNo
    const mrnParts = cells[2].innerHTML
      .replace(/<br\s*\/?>/gi, '|')
      .split('|')
      .map(s => s.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    const noRM = mrnParts[0] ?? '';
    const episodeNo = mrnParts[1] ?? '';
    if (!noRM) return;

    // col[3]: Patient name
    const namaPasien = cells[3].textContent?.trim() ?? '';

    // col[4]: DOB <br> Sex
    const dobParts = cells[4].innerHTML
      .replace(/<br\s*\/?>/gi, '|')
      .split('|')
      .map(s => s.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    const dob = dobParts[0] ?? '';
    const sexDesc = dobParts[1] ?? '';

    // col[5]: Payor
    const payor = cells[5].textContent?.trim() ?? '';

    // col[6]: LOS → derive admission date
    const losMatch = cells[6].textContent?.match(/(\d+)/);
    const losDays = losMatch ? parseInt(losMatch[1], 10) : 0;
    const admissionDate = losDays > 0
      ? new Date(Date.now() - losDays * 86_400_000).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    // col[7]: DPJP
    const dpjp = cells[7].textContent?.trim() ?? '';

    const { ward, room, bed } = parseWardRoom(wardRoomText);

    patients.push({
      noRM, episodeNo, namaPasien,
      ward, roomName: room, roomType, bedCode: bed,
      dpjp, dob, sexDesc, payor, admissionDate,
    });
  });

  return patients;
}

// ── IGD parser (regex on raw HTML) ────────────────────────────────────────────
// Mirrors the backend regex parser exactly (same source HTML format).

export function parseIGDHTML(html: string): RawIGDPatient[] {
  const patients: RawIGDPatient[] = [];
  const cardBlocks = html.split('<div class="col-md-3 mb-4">').slice(1);

  for (const block of cardBlocks) {
    if (!block.includes('background-color:lavender')) continue;

    // Extract the two timer cells
    const timerRegex = /<div class="col-6 text-center h1\s*([^"]*)">([\s\S]*?)<\/div>/gi;
    const timers: { colorClass: string; value: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = timerRegex.exec(block)) !== null && timers.length < 2) {
      timers.push({ colorClass: m[1].trim(), value: stripTags(m[2]).trim() });
    }
    if (timers.length < 2) continue;

    // Only include patient if TRANSFER INPATIENT timer is set
    const timerTransfer = timers[1].value;
    if (!timerTransfer || timerTransfer === '--') continue;

    // Extract patient info rows
    const infoRegex = /<div class="col-12 font-weight-bold[^"]*">([\s\S]*?)<\/div>/gi;
    const infos: string[] = [];
    let im: RegExpExecArray | null;
    while ((im = infoRegex.exec(block)) !== null) {
      const t = stripTags(im[1]).trim();
      if (t) infos.push(t);
    }
    if (infos.length < 2) continue;

    patients.push({
      nama: infos[0] ?? '',
      noRM: infos[1] ?? '',
      dokter: infos[2] ?? '',
      lokasi: infos[3] ?? '',
      timerOutpatient: timers[0].value,
      timerTransfer,
      timerColor: timers[1].colorClass,
    });
  }

  return patients;
}
