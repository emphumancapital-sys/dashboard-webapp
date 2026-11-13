# Main workbook data integration

The current Phase 1 data browser is based only on the main `Recruitment Pipeline.xlsx` workbook. External Talent Database and Training workbooks are intentionally excluded from this release.

## Read strategy

- Source discovery checks tab titles (metadata cached for five minutes) and reads only each tab's header row using one `spreadsheets.values.batchGet` request for the main spreadsheet.
- Full tab contents are fetched only when a user opens that tab.
- Dashboard data is read in one batch request for the six operational tabs plus the `Dashboard 2026` summary range.
- Values are requested with `FORMATTED_VALUE` so displayed dates, currency, percentages, and IDs follow the spreadsheet's visible formatting.
- Full-tab reads are cached in warm Netlify Function memory for 60 seconds. This is best-effort per instance, not a globally shared cache.
- Identical concurrent range reads are coalesced. Search and pagination run against the cached response and do not call Google Sheets again during the cache window.
- Manual refresh bypasses the short-lived data cache.
- 429 and transient 5xx responses use bounded exponential backoff with jitter.

## Main workbook sources

| UI label | Exact tab | Header row | Data starts | Read range |
|---|---|---:|---:|---|
| Request for Personnel | `2026 Rec Pipeline` | 1 | 2 | A:AI |
| Psychotest (SPK) | `SPK 2026` | 1 | 2 | A:Q |
| Medical Check Up (MCU) | `MCU 2026` | 1 | 2 | A:P |
| MCU Induction | `MCU Induction 2026` | 1 | 2 | A:H; schema review required |
| Contract Extension | `Extend 2026` | 2 | 3 | A:U |
| New Hire | `New Hire 2026` | 1 | 2 | A:Q |
| TPC Pipeline | `2026 TPC Pipeline` | 1 | 2 | A:U |
| Offer Tracking | `Offer` | 2 | 3 | A:H; schema review required |
| Employee Database | `Data Valid Employees` | 3 | 4 | A:N |
| New Hire vs Exit | `New Hire vs Exit` | 1 | 2 | A:C |
| Pivot Dashboard 2026 | `Pivot Dashboard 2026` | 3 | 4 | AX:BC |
| RFP Deletion Log | `RFP Deletion` | 1 | 2 | A:Q |
| Resource Deletion Log | `Resource Deletion` | 1 | 2 | A:AG |

`Dashboard 2026` is used as a KPI summary source for the Overview and is read from `B5:L25`. It is not exposed as a flat data table because it contains multiple side-by-side summary blocks rather than one rectangular table.

## Known source-structure exceptions

- `MCU Induction 2026`: row 1 contains `RFP Received` and `#REF!`; it does not currently provide a reliable table header. The tab is detected as accessible but the table is withheld until its header is corrected in the workbook.
- `Offer`: row 2 contains a company value in column A alongside field labels in columns B–G. The header is not a consistent row-wide table header, so the table is withheld until the source is normalized.
- `New Hire vs Exit`: the primary table is A:C (`EMPLOYEE NAME`, `REASON`, `DATE`). Other cells on the same row are not included in this table range.
- `Pivot Dashboard 2026`: the relevant visible summary blocks begin at AX3:BC; blank spacer columns are omitted from the displayed table when they contain no values.
- `RFP Deletion` and `Resource Deletion`: blank header cells with actual values are retained as generated labels such as `Column 13`; no source data is discarded to hide incomplete headers.

## Read-only boundary

The 13 operational/report tabs above are read-only. User Management and Activity Log remain system-owned tabs used by the app. No operational source tab is created, renamed, reformatted, or written by the data browser.
