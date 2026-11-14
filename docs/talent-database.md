# Talent Database

Built on v22. Adds `netlify/functions/talent.mjs` and the Talent Database page. Read only: nothing is written to the talent spreadsheet.

## Source
- Spreadsheet `1pOmWQVDkA7CHKX0f_ck4asltqWt0H-fPB8-YbL3Fnfs`, the tab with `gid=0`. Override with the environment variables `TALENT_SHEET_ID`, `TALENT_SHEET_GID` or `TALENT_SHEET_TAB` (tab name).
- **The spreadsheet must be shared with the Netlify service account as Viewer.** If it is not, the page says so and names the service account's email.
- The header row is detected among the first 10 rows (the row that names the most expected columns), so a title row above the headers is fine. All columns with a header or data are shown, in sheet order.

## Columns used for the charts
Matched by header name, Indonesian or English:

| Chart | Header names accepted |
|---|---|
| Gender | Jenis Kelamin, Gender |
| Education Background | Latar Belakang Pendidikan, Education Background, Pendidikan Terakhir, Pendidikan, Education |
| Major | Jurusan, Major |
| Year of Graduate | Year of Graduate, Tahun Lulus, Graduation Year |
| Age | Usia, Age, Umur |

A chart whose column is not found says so instead of guessing. To add a header name, edit `FIELDS` in `talent.mjs`.

## Charts
- Each chart is a ranked list of bars (name, bar, count and share), one colour, checked for contrast on the light and dark surfaces.
- Gender, Education and Major are ranked largest first; beyond 7 values the rest folds into "N others". Year of Graduate keeps year order (the 10 latest years, earlier ones folded). Age is grouped into bands: under 25, 25–29, 30–34, 35–39, 40–44, 45 and over.
- Charts always describe the rows currently shown in the table. Clicking a bar filters the table to that value; clicking it again removes the filter.

## Table filters
- Every column header has a filter button: sort A→Z or Z→A, search the values, tick or untick values, then OK. This mirrors the filter in Google Sheets.
- Active filters appear as chips above the table and can be removed one by one or all at once. A search box searches every column.
- Filtering, sorting and paging happen in the browser; the function returns up to 10,000 rows.

## Pipeline marks
- The first column shows "In pipeline" when a pipeline row with the same candidate name is still running, and "Processed before" when the matching row is completed, cancelled, failed, withdrawn or new job. Hovering shows the RFP code, position and status.
- Matching is by name only (case and punctuation ignored), against the `Candidates` column of `2026 Rec Pipeline`. Two different people with the same name cannot be told apart, and a name spelled differently is not matched.
- The mark is derived each time the page loads; it is not stored.

## Validation
- `node --check` passes. Exercised in Chrome against an in-memory stub with a mock talent tab: header detection below a title row, charts, bar-click filter, column filter, pipeline filter, search, sort, paging, dark theme.
- Not exercised against the real talent spreadsheet: it could not be opened from this environment, so its real header names are unverified.
