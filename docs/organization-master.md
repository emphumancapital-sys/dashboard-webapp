# Organization Master

## Scope
Admin-managed reference values for Department, Business Unit, and Position.

## Storage
- `EMP Organization Master`: canonical records (ID, Category, Name, Status, Created At, Updated At).
- `EMP Organization Lists`: hidden helper lists used by native Google Sheets data validation.

## Behavior
- Add and rename values; activate/deactivate existing values.
- Deactivation preserves historical records and removes the value from active dropdown lists.
- Active values are loaded into matching Add/Edit form fields.
- Backend routes require an active Admin account; hiding the navigation item is not the security boundary.
- Changes refresh native dropdown validation for matching column headers in configured visible business tabs.
- Existing records are not mass-updated when a reference label is renamed.

## Supported matching headers
- Department / Departemen
- Business Unit
- Position / Job Title / Jabatan

## Operational note
The first successful Admin request initializes the hidden Organization sheets. The Google service account must have Editor access to the main spreadsheet. Validate on a development copy before production use.
