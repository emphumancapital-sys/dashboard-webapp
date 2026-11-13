# Hiring Pipeline (kanban)

Built on the v4 UI build. Adds `netlify/functions/pipeline.mjs`, a new Hiring Pipeline page in `public/`, and four `export` keywords in `_lib/sheets.mjs`. No existing endpoint or payload changed.

## Source
- Tab: `2026 Rec Pipeline` (A:AI, header row 1). Columns are found by header name, with the documented column letter as fallback.
- A request is on the board when `RFP Process` (column Q) reads as ongoing (`On Going`, `Ongoing`, `In Progress`, `Open`, ...) and in the Completed list when it reads as completed (`Completed`, `Done`, `Closed`, ...). Rows with any other value (for example cancelled) are not shown.

## Stages
| Board column | Sheet column | Written by the app |
|---|---|---|
| Sourcing | none of the stage columns filled | n/a |
| 1st Interview | U `1st Intv` | date |
| 2nd Interview | V `2nd Intv` | date |
| Offering In | W `Offering In` | date |
| Offering Done | X `Offering Done` | date |
| Psikotest | Y `Psychological Test`, Z `Psikotest Vendor`, AA `Psikotest Results` | never (formula, from SPK 2026) |
| MCU | AB `MCU`, AC `MCU Results` | never (formula, from MCU 2026) |
| Join Date | AD `Join Date` | date |

A request's stage is the right-most stage column that holds a value. The sheet is the only source of truth; the app stores nothing of its own.

## Moving a card
- Three ways: the next-stage button on the card, drag and drop, or the `...` menu. Each opens a small dialog with a date picker (default today) and writes that date to the stage column as an ISO date with `USER_ENTERED`, the same way the record form writes dates. The cell keeps its own display format.
- Stages can be skipped. Skipped columns stay empty.
- Moving back clears the dates of the later manual stages, after a warning that lists them. The target's existing date is left untouched unless you change it.
- Cards cannot be dropped on Psikotest or MCU, and cannot move back before them once the sheet has Psikotest or MCU data.
- Clicking a card opens its details, where every manual stage date can be set, changed or cleared.

## Completing
- `Complete` (on Join Date cards) or `Mark as completed` (in the details) sets `RFP Process` for that row. `Reopen` in the Completed list sets it back.
- The value written is taken from the column's dropdown options, or else from the spelling most used in existing rows. If neither has a matching value the app refuses and writes nothing.
- If `RFP Process` is a formula in that row the app refuses and says so.

## Safeguards
- Every write first re-reads the target row and checks that its RFP Code still matches the card. If the sheet was sorted or rows were deleted in the meantime, the write is refused with a prompt to refresh.
- Every target cell is checked for a formula before writing.
- Each change is recorded in `EMP Activity Log` under module `Hiring Pipeline`.

## API
- `GET pipeline[?refresh=1]` returns stages, cards (ongoing and completed) and the status values found.
- `PATCH pipeline` `{ rowNumber, code, values: { first: "2026-11-13", offerIn: "" } }` sets or clears manual stage dates.
- `POST pipeline` `{ rowNumber, code, action: "complete" | "reopen" }`.

## Validation
- `node --check` passes for `pipeline.mjs`, `_lib/sheets.mjs`, `public/app.js`.
- Exercised in Chrome against an in-memory spreadsheet stub that runs the real `pipeline.mjs`: forward move, skip, drag and drop, backward move, blocked moves, detail edit, complete, reopen, formula-managed status, changed-row refusal, search, filter, dark theme, 390px viewport.
- Not exercised against the live Google Sheet. The header names, the status wording and which columns are formulas come from `docs/crud-schema.json` and were not checked against the live sheet.

## Send to pipeline (added after the first kanban build)
- An RFP reaches the board only when it is sent. In the Request for Personnel table each row has a send icon; rows already in the pipeline show a check mark instead. The Hiring Pipeline toolbar also lists RFPs that are in `RFP 2026` but not yet in `2026 Rec Pipeline`, each with a Send button.
- `POST pipeline` `{ action: "send", rfpRowNumber, code }` creates one row in `2026 Rec Pipeline` at the first free row: formula columns are copied down from the previous row, every RFP column with a same-named non-formula column in the pipeline tab is copied (RFP Received through Initiator), and `RFP Process` is set to the sheet's own "ongoing" spelling.
- An RFP whose code already exists in the pipeline tab is refused.
- After writing, the new row's RFP Code is read back. If it is not the code that was sent, the written values are cleared again and the user is told. The RFP Code formula in the pipeline tab was not available when this was built, so this check is what protects against a position-dependent formula.
- One RFP is one pipeline row.

## Form presets for the RFP tabs
Defined in `netlify/functions/_lib/presets.mjs` and applied to `RFP 2026` and `2026 Rec Pipeline` by header name.

| Field | Behaviour |
|---|---|
| Required Person | Shown disabled, always `1` on create. Remove the `required person` line in `presets.mjs` to open it again. |
| Location | `Field`, `Office`. Anything else is rejected by the server. |
| Grade Level | `Non Staff`, `Staff`, `Senior Staff`, `Manager`, followed by any other value already used in the column. |
| Point of Hire | Searchable list of Indonesian cities plus cities already used in the column. A city that is not listed can be typed and is stored in Title Case. |

- Values are matched case-insensitively to the standard spelling, so `jakarta` and `JAKARTA` are stored as `Jakarta`.
- Existing rows keep their current values until they are edited. An old value stays selectable in the edit form for that row.
- These presets replace the sheet's own dropdown rule for the same columns inside the app. If those columns have a dropdown in the sheet with different options, Sheets will flag the new values there until the sheet's dropdown is updated to match.

## Merged cells (fix for "You can't perform a paste that partially intersects a merge")
- Cause: when a row is created, formula columns are copied down from the row above with a Sheets `copyPaste`. Sheets rejects a paste that covers only part of a merged range, and the whole batch fails. Nothing had been written at that point.
- `copyFormulaColumnsFromPrevious` in `_lib/sheets.mjs` now reads the tab's merged ranges first. A formula cell inside a one-row merge is copied as the whole merged range; a source row merged across several rows is skipped in favour of an earlier formula row. This also applies to Add Record on every tab that copies formulas down.
- If the target row itself has a merge that the copy cannot respect, or a merge that would swallow a value, the request is refused with the exact range (for example `B46:C47`) so it can be unmerged in the sheet.
- Copying format and data validation onto a newly appended row is now best effort when the row above touches a merge.

## What the pipeline features can and cannot change in `2026 Rec Pipeline`
- Never done by the app: inserting or deleting rows, sorting, merging or unmerging, changing cell formats, column widths, conditional formatting or dropdown rules of existing rows.
- New rows always go below the last existing record, for Send to pipeline and for Add Record on every tab. An empty row in the middle of the data is never reused, and a row below the data that holds anything in a non-formula column (notes, totals) is skipped rather than written over. Formulas are copied with `PASTE_FORMULA` only (no formatting).
- If a send is refused after the row was prepared, the values are cleared and formula cells that were empty before are cleared again, leaving the row as it was.
- Kanban moves write one date cell (U, V, W, X or AD), clear later date cells on a backward move, and Complete/Reopen writes one cell in Q.
- Values are entered with `USER_ENTERED`, so how a date looks depends on the format of the cell it lands in.
