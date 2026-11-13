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
| MCU Induction 2026 | Partial CRUD | Only column A (RFP Received) is editable; columns B:H are imported from another workbook and read-only. |

| Pivot Dashboard 2026 (excluded by user decision) | View only | Pivot/report output. |
| EMP User Management | System managed | Existing user-management workflow only. |
| EMP Activity Log | System managed | Append-only audit trail. |

`Offer` and `2026 TPC Pipeline` are not included because they are not confirmed as visible in the supplied workbook. All hidden tabs remain excluded regardless of whether they contain operational data.

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


## User-confirmed scope update

- `Dashboard 2026 (excluded by user decision)` is explicitly excluded from the app navigation and data sources.
- `MCU Induction 2026` is included as a partially editable source. Only column A (`RFP Received`) may be created/updated. Columns B:H are populated by `IMPORTRANGE` from another workbook and must never be written, cleared, or deleted by this application. Before enabling write operations, the backend must validate that the target range is exactly column A and reject any payload containing fields outside the allowlist.


## Latest user-confirmed scope

- Exclude `Dashboard 2026` completely from application navigation and data source registry.
- Include `MCU Induction 2026` as a partial-edit source: only column A (`RFP Received`) is writable. Columns B:H are imported from an external workbook through `IMPORTRANGE` and must remain read-only. Backend write handlers must reject any write range or payload that includes columns B:H.
