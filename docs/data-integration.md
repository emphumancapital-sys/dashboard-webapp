# EMP Phase 1 — Read-only data integration

## Included sources

The `data` Netlify Function exposes a read-only browser for 14 source tabs: 12 tabs in the primary workbook, Talent Database (`MASTER ALL`) in its own workbook, and Training (`2026`) in its own workbook.

| UI label | Spreadsheet source | Header | First data row |
|---|---|---:|---:|
| Request for Personnel (RFP) | Main / `2026 Rec Pipeline` | 1 | 2 |
| Psychotest (SPK) | Main / `SPK 2026` | 1 | 2 |
| Medical Check Up (MCU) | Main / `MCU 2026` | 1 | 3 |
| MCU Induction | Main / `MCU Induction 2026` | 1 | 2 |
| New Hire | Main / `New Hire 2026` | 1 | 2 |
| Contract Extension | Main / `Extend 2026` | 1 | 2 |
| Resignation | Main / `Resignation 2026` | 1 | 2 |
| Termination | Main / `Termination 2026` | 1 | 2 |
| Retirement | Main / `Retirement 2026` | 1 | 2 |
| Master All | Main / `Master All` | 1 | 2 |
| New Hire vs Exit | Main / `New Hire vs Exit` | 1 | 2 |
| Pivot Dashboard | Main / `Pivot Dashboard 2026` | 1 | 2 |
| Talent Database | External / `MASTER ALL` | 1 | 2 |
| Training Data | External / `2026` | 6 | 7 |

## Netlify environment variables

Existing variables remain in use. Optional overrides: `TALENT_DB_SPREADSHEET_ID` and `TRAINING_SPREADSHEET_ID`. Do not expose the service-account JSON in frontend code or commit it to GitHub.

Share both external spreadsheets with the service account `client_email` as Viewer. The main spreadsheet must remain accessible to the service account.

## Validation

After deployment, sign in as Admin. Each source appears in the sidebar. `GET /.netlify/functions/data?action=sources` returns per-source access status, row count, column count, headers, and errors. Open each menu to inspect paginated rows. This phase is read-only; no source sheet rows are modified.
