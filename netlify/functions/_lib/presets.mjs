// Form presets for the RFP tabs: fixed choices so values are entered in one format.
// Keyed by normalised header name; applied only to sources that set `presets:true` in data.mjs.
export const CITIES = ["Ambon","Balikpapan","Banda Aceh","Bandar Lampung","Bandung","Banjarbaru","Banjarmasin","Banyuwangi","Batam","Batulicin","Baubau","Bekasi","Bengkulu","Bima","Bintuni","Bitung","Bogor","Bontang","Bukittinggi","Cilacap","Cilegon","Cimahi","Cirebon","Denpasar","Depok","Dumai","Gorontalo","Gresik","Jakarta","Jambi","Jayapura","Jember","Karawang","Kediri","Kendari","Ketapang","Kolaka","Kotabaru","Kudus","Kupang","Labuan Bajo","Lubuklinggau","Luwuk","Madiun","Magelang","Makassar","Malang","Mamuju","Manado","Manokwari","Mataram","Maumere","Medan","Merauke","Metro","Mojokerto","Morowali","Muara Teweh","Nabire","Nunukan","Padang","Palangka Raya","Palembang","Palopo","Palu","Pangkalan Bun","Pangkalpinang","Parepare","Pasuruan","Pekalongan","Pekanbaru","Pematangsiantar","Pontianak","Probolinggo","Purwakarta","Purwokerto","Salatiga","Samarinda","Sampit","Sangatta","Semarang","Serang","Sidoarjo","Singaraja","Singkawang","Sintang","Sofifi","Sorong","Sorowako","Sukabumi","Sumbawa Besar","Surabaya","Surakarta","Tangerang","Tangerang Selatan","Tanjung","Tanjung Redeb","Tanjung Selor","Tanjungpinang","Tarakan","Tasikmalaya","Tegal","Tenggarong","Ternate","Tidore","Timika","Tomohon","Weda","Yogyakarta"];
export const FIELD_PRESETS = {
  "location":        { options:["Field","Office"] },
  // mergeExisting: values already used in the sheet column are offered too, after the standard ones.
  "grade level":     { options:["Non Staff","Staff","Senior Staff","Manager"], mergeExisting:true },
  // allowCustom: a city that is not listed can still be typed; it is stored in Title Case.
  "point of hire":   { options:CITIES, mergeExisting:true, allowCustom:true },
  // fixed: one RFP is one person for now. Remove this line to open the field again.
  "required person": { fixed:"1" }
};
export const normHeader = v => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const presetFor = header => FIELD_PRESETS[normHeader(header)] || null;
export function titleCase(value){ return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|[\s\-/(])([a-zÀ-ɏ])/g, (m, a, b) => a + b.toUpperCase()); }
// Standard options first, then other values found in the column (matched case-insensitively so "JAKARTA" does not duplicate "Jakarta").
export function presetOptions(preset, existing = []){
  const options = [...(preset.options || [])], seen = new Set(options.map(o => o.toLowerCase()));
  if (preset.mergeExisting) for (const raw of existing) { const v = String(raw ?? "").trim(); if (v && !/^#/.test(v) && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); options.push(v); } }
  return options;
}
// Returns the value to store, or throws when a fixed-choice field got something else.
export function normalizePresetValue(preset, value, options, label){
  const text = String(value ?? "").trim().replace(/\s+/g, " "); if (!text) return "";
  const match = options.find(o => o.toLowerCase() === text.toLowerCase());
  if (match) return match;
  if (preset.allowCustom) return titleCase(text);
  throw new Error(`Invalid option for ${label}. Choose one of: ${(preset.options || []).join(", ")}.`);
}
