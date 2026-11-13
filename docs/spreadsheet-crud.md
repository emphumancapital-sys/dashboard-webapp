# Spreadsheet CRUD implementation

## Scope
Writes are enabled only for the six operational tabs configured in `netlify/functions/data.mjs`:
- `2026 Rec Pipeline`
- `SPK 2026`
- `MCU 2026`
- `Extend 2026`
- `New Hire 2026`
- `2026 TPC Pipeline`

All other tabs remain read-only, including master/reference data, movement summaries, pivot/report tabs, and deletion logs. External spreadsheets are out of scope.

## Behavior
- Add, update, and delete write directly to the main Google Spreadsheet.
- Writes require an authenticated Admin session.
- The backend uses a strict source allowlist and validates row boundaries.
- Updates write editable cells only; formula columns are protected.
- New rows inherit row formatting and copy the latest formula in each configured formula column. The backend does not copy stale user-entered values from a previous row.
- Changes invalidate the in-memory read cache so the next table refresh reads current sheet values.
- Date-like columns use native date inputs and are submitted as ISO dates.
- URL columns use URL inputs; table URLs render as active links.
- Payment columns use Paid / Unpaid options.

## Formula protection
The current workbook contains formulas in:
- `2026 Rec Pipeline`: B, C, AB, AF, AH
- `SPK 2026`: E, G, H, I (some rows use imported formulas)
- `MCU 2026`: O (imported formula values)
- `2026 TPC Pipeline`: A, B, T

Those fields are not editable in the record form. Add is intentionally disabled for SPK and MCU because their imported/formula-fed columns are driven by upstream forms/spreadsheets; existing records can still be edited in non-formula fields and deleted.

## Required deployment permission
The Google service account must have **Editor** access to the main workbook for Add / Edit / Delete. Viewer access is sufficient only for read-only mode. Do not expose the service account JSON or private key in the repository.

## Important operational note
Test Add / Edit / Delete on a non-critical test row or a copy of the workbook before production use. The implementation has been syntax-checked and the package build command passes, but live writes have not been exercised against the user's Google Spreadsheet from this environment.
