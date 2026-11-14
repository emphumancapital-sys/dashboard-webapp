# Psikotest and MCU requests, and Action Needed

Built on v17. Adds `netlify/functions/spk.mjs` and `netlify/functions/_lib/requests.mjs`; changes `pipeline.mjs`, `dashboard.mjs` and the front end. No new tab or column is created in the spreadsheet.

## Requesting from the board
- Psikotest and MCU are now reachable from a card: the next-stage button, drag and drop onto the column, or the `...` menu.
- The pipeline columns for Psikotest and MCU are still formulas and are never written. A card moves into those columns when `SPK 2026` or `MCU 2026` has the data; until then it shows a "requested" badge.
- Psikotest request dialog: Tanggal psikotest, Lokasi test (vendor, the four locations of the invitation form), Kategori Test (Seleksi / Promosi), Kategori Layanan (Standard / Quick).
- The request is stored as one dated line in the row's Remarks, like negotiation notes:
  `[Psikotest 10 Dec 2026] <location> · Seleksi · Quick` or `[MCU 14 Nov 2026] Form requested`.
- After a psikotest request the invitation step opens straight away: the candidate's data with copy buttons and a button that opens the invitation form. MCU does the same with the MCU form.

## Action Needed (Overview)
A full-width panel at the top of the Overview listing only what the user still has to do. Nothing is stored for it; it is recomputed from the sheet each time.

| Task | Appears when | Disappears when |
|---|---|---|
| Send psikotest invitation | a running pipeline row has a Psikotest request and `SPK 2026` has no row for that candidate from this round | the invitation form has created the row in `SPK 2026` |
| Permintaan Surat Pengantar Psikotes | a row in `SPK 2026` has a participant but `NO SPK` or `SPK` is empty | both are filled |
| Fill MCU form | a running pipeline row has an MCU request and `MCU 2026` has no row for that candidate dated on or after the request | the MCU form has created the row |

- Candidates are matched by name (case and punctuation ignored). A psikotest row counts only if its `TEST` date is within 60 days of the requested date, so an older test of a returning candidate does not hide a new task.
- `SPK 2026` rows whose test date is more than 30 days in the past are treated as history and not listed.
- Each task opens a dialog. The surat pengantar dialog edits `DATE`, `NO SPK`, `LOKASI TEST` and `SPK` (link) on that row; LOKASI TEST is pre-selected from the request.

## Writing the surat pengantar
- `POST spk` `{ rowNumber, name, values: { date, noSpk, location, link } }` writes only those four columns of one `SPK 2026` row, and only the values that changed.
- The row is re-read first and `NAMA PESERTA` must match; a formula in a target cell is refused; the link must start with `http://` or `https://`.

## Forms and prefill
- Form links live in `_lib/requests.mjs` (`FORMS`).
- Prefill is supported but not configured: the two links supplied were the form editor's prefill page, which needs the owner's sign-in and does not expose the field IDs. To enable it, open that page, fill in sample answers, click "Get link", and paste the generated link into `prefill` with each sample answer replaced by a token: `{name}` `{position}` `{businessUnit}` `{type}` `{service}` `{location}` `{date}`.
- Without prefill the dialog opens the plain form and offers each value with a copy button.

## Other
- Returning to the Overview now reloads it, so tasks and reminders reflect changes made on other pages.

## Validation
- `node --check` passes for all functions and `public/app.js`.
- Exercised in Chrome against an in-memory spreadsheet stub running the real functions: psikotest request, invitation dialog, MCU request by drag and drop, Action Needed list, saving a surat pengantar, tasks clearing after the form rows appear.
- Not exercised against the live Google Sheet or the live forms. Header names of `SPK 2026` and `MCU 2026` come from `docs/crud-schema.json`.

## Removing the request line when it is finished
- Psikotest is finished when the matching `SPK 2026` row has both `NO SPK` and the `SPK` link. MCU is finished when the MCU form has created the row in `MCU 2026`.
- The Overview response lists finished requests (`cleanup`). The front end then calls `POST pipeline` `{ action:"clearRequest", rowNumber, code, kind }` for each, which removes only the `[Psikotest …]` or `[MCU …]` line from that row's Remarks. Other lines (negotiation, failed) are kept; the cell is cleared only if nothing else is left.
- This happens when the Overview loads, including right after a surat pengantar is saved. Each removal is recorded in `EMP Activity Log`.
- Prefill is still not configured: the second pair of links (`…/viewform?usp=pp_url`) has no `entry.…=` parameters, which only appear after sample answers are filled in before "Get link".

## Prefill configured
- Both forms now open pre-filled from the card. Field IDs were taken from the pre-filled links supplied by the owner and are in `_lib/requests.mjs`.
- Psikotest invitation: Name, Job Title, Business Unit, Assessment Type, Assesment, Psychological Test Location and Psychological Test Date are filled. Email Kandidat, Nomor Handphone and Psychological Test Time are left for the user.
- MCU: Nama Lengkap and Business Unit are filled. Email, Tanggal Lahir, Nomor Handphone, Lokasi MCU and Tanggal MCU are left for the user.
- A value the card does not have is left out of the link. A Business Unit that is not one of the form's dropdown options is ignored by Google Forms and has to be chosen by hand.
- The sample answers in the supplied links (name, email, phone) are not stored anywhere.
