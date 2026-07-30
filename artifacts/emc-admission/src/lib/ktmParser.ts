/**
 * Client-side KTM HTML parser.
 *
 * Port dari artifacts/api-server/src/routes/ktm.ts agar monitoring KTM bisa
 * melakukan direct browser fetch ke TrakCare tanpa memerlukan backend proxy.
 *
 * Digunakan ketika hasTrakCareProxy() = false (misal Netlify tanpa internal server)
 * dan browser pengguna terhubung ke jaringan internal RS EMC.
 */

export interface KTMPatientParsed {
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

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function splitByBr(html: string): string[] {
  return html
    .replace(/<br\s*\/?>/gi, '|')
    .split('|')
    .map((s) => stripTags(s).trim())
    .filter(Boolean);
}

export function parseKTMPatients(html: string): KTMPatientParsed[] {
  const patients: KTMPatientParsed[] = [];

  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const bodyContent = tbodyMatch ? tbodyMatch[1] : html;

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(bodyContent)) !== null) {
    const rowHTML = rowMatch[1];
    if (/<th[^>]*>/i.test(rowHTML)) continue;

    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowHTML)) !== null) {
      cells.push(cellMatch[1]);
    }

    if (cells.length < 4) continue;

    if (cells.length >= 6) {
      let noRM = '';
      let episodeNo = '';
      let namaPasien = '';
      let ruangan = '';
      let kelas = '';
      let dpjp = '';
      let tanggalJamKTM = '';
      let ward = '';

      for (let i = 0; i < cells.length; i++) {
        const text = stripTags(cells[i]).trim();
        const parts = splitByBr(cells[i]);
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

      if (cells.length >= 8) {
        const wardText = stripTags(cells[0].replace(/<br\s*\/?>/gi, ' ')).trim();
        ward = wardText.split(/\s+PK\s+/)[0] || wardText;
        kelas = stripTags(cells[1]).trim();
        const mrnParts = splitByBr(cells[2]);
        noRM = mrnParts[0] || '';
        episodeNo = mrnParts[1] || '';
        if (!noRM) continue;
        namaPasien = stripTags(cells[3]).trim();
        dpjp = stripTags(cells[7]).trim();
        tanggalJamKTM = stripTags(cells[6]).trim();
        ruangan = wardText;
      } else if (cells.length >= 6) {
        ruangan = stripTags(cells[1]).trim() || stripTags(cells[0]).trim();
        const mrnParts = splitByBr(cells[2]);
        noRM = mrnParts[0] || '';
        episodeNo = mrnParts[1] || '';
        if (!noRM) {
          const alt = splitByBr(cells[1]);
          noRM = alt[0] || '';
          episodeNo = alt[1] || '';
          ruangan = stripTags(cells[0]).trim();
        }
        if (!noRM) continue;
        namaPasien = stripTags(cells[3]).trim();
        dpjp = cells.length > 4 ? stripTags(cells[4]).trim() : '';
        tanggalJamKTM = cells.length > 5 ? stripTags(cells[5]).trim() : '';
        ward = ruangan;
      }

      if (!noRM) continue;

      let tanggalKTM = '';
      let jamKTM = '';
      if (tanggalJamKTM) {
        const parts = tanggalJamKTM.split(/\s+/);
        if (parts.length >= 2) {
          tanggalKTM = parts.slice(0, -1).join(' ');
          jamKTM = parts[parts.length - 1];
        } else {
          tanggalKTM = tanggalJamKTM;
        }
      }

      patients.push({
        noRM,
        episodeNo,
        namaPasien,
        ruangan: ruangan || ward,
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
