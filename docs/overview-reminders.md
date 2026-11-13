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
