# EMP HCS CRUD foundation — visible tabs only

## Scope decision
Only worksheets whose `sheetState` is `visible` in the supplied workbook are in scope. Hidden worksheets are excluded from navigation and all CRUD operations.

## Classification

| Worksheet | Classification | Reason |
|---|---|---|
| RFP 2026 | CRUD candidate | Main RFP request source; generated RFP Code and formula-linked fields must remain protected. |
| 2026 Rec Pipeline | CRUD candidate | Recruitment pipeline; multiple formula-derived fields and cross-sheet dependencies. |
| SPK 2026 | CRUD candidate | Operational SPK records; dropdowns and date validations. |
| MCU 2026 | CRUD candidate | Operational MCU records; generated timestamp/email fields need protection. |
| Extend 2026 | CRUD candidate | Operational extension records; formula, date and checkbox fields. |
| New Hire 2026 | CRUD candidate | Handover tracking; formula-derived columns. |
| New Hire vs Exit | CRUD candidate | Simple A:C employee movement table. |
| Data Valid Employees | View only | Employee master/reference data; do not assume it is safe to mutate. |
| MCU Induction 2026 | Blocked | Header contains an IMPORTRANGE/#REF! error. |
| Dashboard 2026 | View only | Formula-driven dashboard. |
| Pivot Dashboard 2026 | View only | Pivot/report output. |
| EMP User Management | System managed | Existing user-management workflow only. |
| EMP Activity Log | System managed | Append-only audit trail. |

`Offer`, `2026 TPC Pipeline`, `Pivot Dashboard 2026`, `RFP Deletion`, and `Resource Deletion` are excluded because they are not confirmed as visible in the supplied audit. `EMP User Management` and `EMP Activity Log` are app-managed system tabs, not ordinary data-navigation sources. All hidden tabs remain excluded regardless of whether they contain operational data.

## Safety rules for implementation

1. Do not use a global shared dropdown list. Each validation belongs to its own worksheet and column/range.
2. Read validation metadata from Google Sheets for the exact target column/range. The audit confirms lists differ between tabs and, in some cases, between ranges in the same tab.
3. Never trust the sampled formula-column list as a complete formula map. Before update, inspect `userEnteredValue.formulaValue` for every target cell. Reject writes to formula cells.
4. For append, inspect the destination row and the preceding template row. Formula cells must be copied with formula-aware `copyPaste`/`PASTE_FORMULA` behavior or explicitly seeded using verified formulas. Do not generate RFP Code in JavaScript.
5. Do not mutate a row until the backend has verified the spreadsheet service account has Editor permission. Reads may work with Viewer access; writes will not.
6. Delete must be an explicit row deletion with a confirmation step and an activity-log entry. Never clear a guessed row based only on filtered table position.
7. Use stable row numbers/record identity from the backend, not the current page index.
8. Preserve raw URL values in Sheets and render them as safe external links in the UI. Validate `https:`/`http:` URLs server-side.
9. Date fields must be sent as ISO date values and written with `USER_ENTERED` only after date parsing/validation; booleans remain booleans.
10. Invalidate relevant read caches after every successful write.

## Formula risk notes

- `RFP 2026`: column A generates RFP Code; B, C, R, S are formula-derived in sampled rows. Column A2 and A3 show different sequence offsets; do not reproduce the sequence in application code. Resolve with live-sheet formula inspection before append.
- `2026 Rec Pipeline`: column A looks up RFP Code from RFP 2026; B, C, Y:AC, AF, AH are formula-derived in sampled rows. Preserve formula dependencies.
- `SPK 2026`: formulas exist in the sheet; runtime cell-level protection is required.
- `MCU 2026`: formulas exist in the sheet; runtime cell-level protection is required.
- `Extend 2026`: formulas exist in the sheet; runtime cell-level protection is required.
- `New Hire 2026`: formulas exist in the sheet; runtime cell-level protection is required.

## Current implementation status

This package adds the audited schema foundation only. It does not yet enable write operations. CRUD endpoints should be added only after the schema and per-row formula protections are implemented and tested against a live Editor-authorized spreadsheet. This avoids accidental changes to formulas or linked recruitment records.


## Repository 1.2 audit correction

The data-source registry has been aligned to the 10 visible business tabs confirmed by the latest audit. The app-managed user and activity sheets remain in their dedicated modules. The data page continues to be read-only in this patch; CRUD write endpoints and forms have not yet been implemented. Technical source metadata chips above the table are hidden while the record count and refresh action remain visible.
