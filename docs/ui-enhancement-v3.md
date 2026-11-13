# UI Enhancement v3

Front-end pass on `public/` plus one backend addition (server-side sort). API routes, payload shapes and auth are unchanged.

## Layout and actions
- Every page uses one pattern: title on the left, primary action (`Add Record`, `Add Item`, `Add User`) on the right of the heading.
- Data toolbar: search (with clear button) and a sort chip on the left, record count on the right. The duplicate `Refresh` button was removed; the topbar refresh (new icon) refreshes whichever page is open.
- The mode pill now reflects the source (`Editable`, `Limited editing`, `Read only`) instead of always saying read-only.
- Row actions are icon buttons (edit, delete, activate/deactivate) with tooltips. On data tables they sit in a slim sticky edge so they stay reachable on wide sheets.
- Footer: `Showing 1–50 of 137`, rows-per-page (25/50/100/200, remembered in `localStorage` as `emp-page-size`) and a numbered pager.
- Skeleton rows on first load, dimmed table with a progress line on re-load, illustrated empty states, clickable URL cells.

## Sorting
- Default order is latest first (highest sheet row first) on every data table, and latest added first on Organization and Users.
- Click a column header to sort ascending, again for descending, a third time to return to latest first. The sort chip shows the active sort and can reverse or reset it.
- Data tables sort on the server across all pages: `GET data?source=…&sort=<sheet column index>&dir=asc|desc`. Column types (date, number, text) are inferred from the column's values so dates and numbers sort by value. Empty cells always sort last.
- Ambiguous numeric dates such as `03/04/2026` are read day-first unless the column contains a value that proves month-first. This matches `dashboard.mjs`.

## Forms and dialogs
- Modals have a fixed header and footer with a scrolling body; fields use one label/control spacing system in a two-column grid.
- The record form opens immediately with placeholders while the schema loads (schema is cached for 60 seconds per source).
- Custom dropdown replaces the system select (search appears above 7 options, keyboard navigation, clear option for non-required fields). The native `<select>` stays in the DOM as the source of truth.
- Custom date picker shows two months side by side, with month and year navigation, Today and Clear. Values are still submitted as ISO dates.
- Browser `confirm()` dialogs were replaced with an in-app confirmation dialog.
- Validation messages appear under the field; server errors appear above the footer next to the Save button.
- A modal with unsaved input is not dismissed by clicking outside it. `Esc` closes the open popover first, then the dialog.

## Record save behaviour
- Editing sends only the fields that changed. A cleared field is sent as an empty value so the cell is cleared. Previously every non-empty field was rewritten and a field could not be cleared.
- Creating a record is unchanged: non-empty fields are sent.

## Other
- Toasts appear top right, colour-coded (success green, error red, warning amber, info blue), stack, and pause on hover.
- `Master Data` navigation group is collapsed by default.

## Validation
- `node --check` passes for `public/app.js`, `netlify/functions/data.mjs`, `netlify/functions/_lib/sheets.mjs`.
- Exercised in Chrome against a local mock of the functions that runs the real `readTabFromSpreadsheet` sort code: add, edit, clear, delete, search, sort, paging, page size, view-only and partial sources, Organization, Users, dark theme, 390px viewport.
- Not exercised against the live Google Sheet or a Netlify deployment.
