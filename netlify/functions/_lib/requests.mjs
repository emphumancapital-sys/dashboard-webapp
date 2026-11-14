// Psikotest and MCU requests raised from the Hiring Pipeline board.
// A request is one dated line in the pipeline row's Remarks, so no extra tab or column is needed:
//   [Psikotest 20 Nov 2026] <test location> · <Seleksi|Promosi> · <Standard|Quick>
//   [MCU 14 Nov 2026] Form requested
// The surat pengantar is prepared before the invitation form has created the row in SPK 2026, so it waits here too:
//   [SPK 14 Nov 2026] <NO SPK> · <link to the letter>

// Google Forms the user fills after a request.
// `prefill` is optional: paste the link that Google Forms generates under "Get pre-filled link" and replace each sample
// answer with a token, for example ...viewform?usp=pp_url&entry.111={name}&entry.222={position}&entry.333={date}
// Tokens: {name} {position} {businessUnit} {type} {service} {location} {date} (date is yyyy-mm-dd).
export const FORMS = {
  // Filled from the card: Name, Job Title, Business Unit, Assessment Type, Assesment, Test Location, Test Date.
  // Left for the user: Email Kandidat (entry.142523084), Nomor Handphone (entry.142610512), Test Time (entry.586229805).
  psikotest: { label:"Candidate Assessment Registration", url:"https://forms.gle/XrF9pMHuYrUiTee2A",
    prefill:"https://docs.google.com/forms/d/e/1FAIpQLSfAxA4UchkyRkIGPeM9VqKqD7Flj9898a7MoIi4aUvIazugsw/viewform?usp=pp_url&entry.176743138={name}&entry.682929738={position}&entry.579222465={businessUnit}&entry.665727256={type}&entry.1786725779={service}&entry.1890372967={location}&entry.1965037313={date}" },
  // Filled from the card: Nama Lengkap, Business Unit.
  // Left for the user: Email (entry.266148378), Tanggal Lahir (entry.1210754655), Nomor Handphone (entry.1213261035), Lokasi MCU (entry.114928282), Tanggal MCU (entry.2145550743).
  mcu:       { label:"Recruitment - MCU 2026", url:"https://forms.gle/imwo28wuz1sVeFTb6",
    prefill:"https://docs.google.com/forms/d/e/1FAIpQLSdeftHMGmhHIovLVL0h-4xiY7Rn35VNC6sIy5zsez4A6sDF_Q/viewform?usp=pp_url&entry.1478693302={name}&entry.1304174290={businessUnit}" }
};
// Choices offered in the Psikotest request dialog. Locations match the invitation form's dropdown text exactly.
export const REQUEST_OPTIONS = {
  locations: [
    "Humanika Psychology Center (Jalan Arifin Ahmad No.4 Pekanbaru, Riau)",
    "Sekardiu Consulting",
    "PT. Selaras Reksapersona Konsultan (Plaza Ciputat Mas Blok B/B Jalan Ir. H. Juanda No. 5A, Ciputat 15412)",
    "Universitas Atma Jaya Kampus Semanggi, Fakultas Psikologi - Gedung Yustinus Lantai 12, Jl. Jend Sudirman No. 51, Jakarta Selatan"
  ],
  testTypes: ["Seleksi", "Promosi"],
  services: ["Standard", "Quick"]
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const tagDate = iso => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
function tagIso(text){ const m = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(String(text).trim()); if (!m) return ""; const month = MONTHS.findIndex(x => x.toLowerCase() === m[2].toLowerCase()); return month < 0 ? "" : `${m[3]}-${String(month + 1).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`; }
export function requestLine(kind, { date, location, testType, service, noSpk, link }){
  if (kind === "letter") return `[SPK ${tagDate(date)}] ${noSpk} · ${link}`;
  return kind === "mcu" ? `[MCU ${tagDate(date)}] Form requested` : `[Psikotest ${tagDate(date)}] ${location} · ${testType} · ${service}`;
}
// Latest request of each kind found in a Remarks cell.
export function parseRequests(remarks){
  const out = {};
  for (const raw of String(remarks ?? "").split(/\r?\n/)) {
    const m = /^\[(Psikotest|MCU|SPK) ([^\]]+)\]\s*(.*)$/.exec(raw.trim()); if (!m) continue;
    const dateIso = tagIso(m[2]); if (!dateIso) continue;
    if (m[1] === "SPK") { const bits = m[3].split(" · "), link = bits.length > 1 ? bits.pop() : ""; out.letter = { dateIso, dateLabel: m[2], noSpk: bits.join(" · "), link }; continue; }
    if (m[1] === "MCU") { out.mcu = { dateIso, dateLabel: m[2] }; continue; }
    const parts = m[3].split(" · "); const service = parts.length > 2 ? parts.pop() : "", testType = parts.length > 1 ? parts.pop() : "";
    out.psikotest = { dateIso, dateLabel: m[2], location: parts.join(" · "), testType, service };
  }
  return out;
}
export const personKey = v => String(v ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
