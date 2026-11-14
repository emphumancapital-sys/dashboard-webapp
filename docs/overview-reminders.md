# Overview reminders

Built on the v10 build. Adds `netlify/functions/contracts.mjs`, changes `dashboard.mjs` and the Overview page.

## Upcoming Contract End Dates
- Source: `Extend 2026`, end date from `END CONTRACT`, status from `STATUS` (column O).
- A row is done when STATUS reads `Sent to C&B` or `Resign`. Done rows stay listed, muted and without actions, until the end date passes. They are information only.
- Rows that are not done are listed first, nearest end date on top, for the next 90 days.
- A contract whose end date has passed without being marked done stays at the top as overdue for 30 days. Before this build it disappeared the day after the end date.
- The heading shows how many need action and how many are done.

## Setting the status from Overview
- `Sent to C&B` button on each row that needs action; `Resign` is in the `...` menu next to it.
- `POST contracts` `{ rowNumber, employee, action: "sent" | "resign" }` writes one cell in column O.
- The value written uses the spelling already in the sheet (dropdown option, or existing rows). If none exists the app refuses and writes nothing.
- Before writing, the row is re-read and its NAME must match the row that was clicked; a formula in the STATUS cell is refused.
- There is no undo in the app. To reverse, change STATUS in the sheet.
- Each change is logged in `EMP Activity Log` under `Contract Extension`.

## Joining Soon
- Source: `New Hire 2026`, column `Join Date`. Lists people joining today through the next 7 days, soonest first. Read only.

## Validation
- `node --check` passes for `dashboard.mjs`, `contracts.mjs`, `public/app.js`.
- Exercised in Chrome against an in-memory spreadsheet stub running the real `dashboard.mjs` and `contracts.mjs`: due, overdue, sent and resign rows, marking Sent to C&B and Resign, changed-row refusal, joiners window, 390px viewport.
- Not exercised against the live Google Sheet. Header names come from `docs/crud-schema.json`.

## Upcoming Interviews (added after the first reminders build)
- Source: `2026 Rec Pipeline`, columns `1st Intv` and `2nd Intv`. Lists interviews dated today through the next 7 days, soonest first, with a 1st/2nd tag, candidate, position, business unit and RFP code.
- Rows whose `Status` is Failed or whose `RFP Process` is completed or cancelled are left out.
- An interview appears here once its date is set, for example by moving a card to 1st Interview on the Hiring Pipeline board with a future date.

## Layout and wording
- Order of the Overview panels: Upcoming Contract End Dates and Upcoming Interviews first, then Latest RFP Records and Activity Log, then Joining Soon and Activity History.
- Panels with nothing to show use an empty state, and their count pill is hidden.
- Explanatory subtitles and source footers were removed from the contract, interview and joining panels; each keeps only its time window. The overdue count moved into the contract panel's pill.

## Later layout changes
- Panel order: contracts and interviews, then Latest RFP Records and Joining Soon, then Activity Log and Activity History side by side.
- Activity Log and Activity History are collapsible and closed by default. The open or closed state is remembered per browser in `localStorage` (`emp-collapsed`). The "View 10-day history" link was removed because the two panels now sit next to each other.
- In the contract panel, "Sent to C&B" is an icon button with a tooltip; the other status stays in the `...` menu.
- Icon-only row actions across the app now show an in-app tooltip instead of the browser's native one.

## Contract details
- The row action for Sent to C&B is a check icon (with tooltip), not a send icon.
- Clicking a contract row, or "View details" in its `...` menu, opens a dialog with every filled column of that row from `Extend 2026`, the end date and the current status.
- The dialog has a `Sent to C&B` button and a `Mark as Resign` link for rows that still need action. Using them there does not ask for a second confirmation; the row icon still does.

## Upcoming Schedule (replaces Upcoming Interviews)
- Lists every dated step from today through the next 14 days.
- Interviews and offerings come from `2026 Rec Pipeline`: `1st Intv`, `2nd Intv`, `Offering In`, `Offering Done`.
- Psikotest comes from `SPK 2026`, column `TEST` (name from `NAMA PESERTA`, position from `POSISI`, business unit from `B.U`).
- MCU comes from `MCU 2026`, column `Tanggal MCU` (name from `Nama Lengkap`, business unit from `Business Unit`). A time in the cell is ignored.
- If one of those two tabs or its date column cannot be found, the rest of the Overview still loads and a warning names what is missing.
- Entries are grouped by day (Today, Tomorrow, In N days) and show the candidate (or the position when no candidate is filled), the step, position and business unit.
- Pipeline rows whose `Status` is Failed or whose `RFP Process` is completed or cancelled are left out. Psikotest and MCU rows are not filtered by status. A cell that does not hold a date is skipped.
- Clicking an entry opens a dialog with the step, its date and every filled column of that row. For pipeline entries, "Open in Hiring Pipeline" jumps to the same request's card details on the board. For Psikotest and MCU entries the button opens that tab's table, filtered to the person.

## Overview, later additions
### Registered marks on contract rows
- A contract row shows a "Psikotest" and/or "MCU" mark when the person is already registered. The mark comes from the row's own `PSIKOTEST` and `MCU` columns in `Extend 2026`; if those are empty, from a row with the same name in `SPK 2026` or `MCU 2026`. Hovering shows the value.

### Open RFPs (replaces Latest RFP Records)
- **No candidate**: pipeline rows that are still running and have an empty `Candidates` cell, plus RFPs in `RFP 2026` that have no live row in the pipeline yet.
- **In process**: pipeline rows with a candidate and no `Join Date`.
- Left out of both: rows whose `Status` is Withdraw, Failed or New Job, and rows whose `RFP Process` is completed or cancelled.
- Each entry opens its details. "Find candidate" goes to the new Talent Database page, which is a placeholder for now. "Open in Hiring Pipeline" opens the card.
- On the board, rows with Status Withdraw or New Job are now treated like Failed: they leave the board and appear in the Failed list. The app itself still only writes `Failed`.

### Joining Soon and the onboarding guide
- Source is now the pipeline's `Join Date` (column AD), today through the next 7 days, instead of `New Hire 2026`.
- Each entry opens its details. "Send Onboarding Guide" opens Zimbra (`https://mail.emp.id`) on the compose screen with the subject filled in; the dialog names the mailbox to sign in with. The app never handles the password and does not send the email itself.
- "Mark as sent" records `[Onboarding 14 Nov 2026] Guide sent` in the row's Remarks. The entry then shows "Guide sent", and the task leaves Action Needed. The line is removed from Remarks after the join date has passed.
- Unsent guides for the next 7 days are also listed in Action Needed.
