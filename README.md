# EMP — Human Capital Services

Standalone web application built with GitHub, Netlify Functions, and Google Sheets API. Google Apps Script is not used.

## Current release scope

- Admin sign-in and User Management.
- Read-only data browser for the current `Recruitment Pipeline.xlsx` workbook.
- Overview KPIs read from the workbook's `Dashboard 2026` summary area.
- Read-only operational tabs and report/log tabs listed in `docs/data-schema.md`.
- External Talent Database and Training workbooks are intentionally out of scope.
- No operational source-sheet writes, edits, deletes, imports, or exports.

## Architecture

- `public/`: static interface (HTML, CSS, vanilla JavaScript).
- `netlify/functions/`: server-side endpoints.
- `netlify/functions/_lib/sheets.mjs`: Google Sheets API client, request coalescing, retry, and short-lived warm-instance cache.
- Google service-account credentials remain in Netlify environment variables and are never sent to the browser.

## Environment variables

Set these in Netlify Site configuration → Environment variables:

| Variable | Purpose |
|---|---|
| `GOOGLE_SHEET_ID` | Main workbook ID; default is already configured in code |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full service-account JSON, stored as a secret |
| `JWT_SECRET` | Random secret of at least 32 characters |
| `BOOTSTRAP_ADMIN_USERNAME` | Optional initial admin username |
| `BOOTSTRAP_ADMIN_PASSWORD` | Optional initial admin password |
| `SESSION_COOKIE_NAME` | Optional session cookie name; defaults to `emp_session` |

Never commit `.env` or service-account credentials. The service account needs Editor access only because User Management and Activity Log are system-owned writable tabs; the operational/report tabs are read-only.

## Google Cloud setup

1. Enable Google Sheets API in the Google Cloud project used by the service account.
2. Create a service account and a JSON key.
3. Share the main workbook with the service-account email.
4. Store the JSON key in Netlify as `GOOGLE_SERVICE_ACCOUNT_JSON`.

## Deploy

1. Extract this ZIP into the repository root.
2. Commit and push the files to the intended branch.
3. Connect the repository to Netlify.
4. Build command: `npm run build`.
5. Publish directory: `public`.
6. Functions directory: `netlify/functions` (configured in `netlify.toml`).
7. Configure the environment variables and deploy.

## Local development

```bash
npm install
cp .env.example .env
# Fill in private values, then:
npx netlify dev
```

Do not commit `.env`.

## Data mapping and performance

See `docs/data-schema.md` and `docs/data-integration.md` for exact workbook tabs, header/data rows, schema exceptions, and read strategy.

- Source discovery reads header rows only in one batch request.
- A full source tab is fetched only when opened.
- Dashboard reads its required workbook ranges in one batch request.
- Full-tab values are cached for 60 seconds per warm Netlify Function instance; this is best-effort, not a global persistent cache.
- Concurrent reads for the same range are coalesced.
- Search and pagination run on cached data.
- 429 and transient 5xx errors use bounded exponential backoff.

## Security notes

- Passwords are salted and hashed using Node.js `scrypt`.
- Session cookie is HttpOnly, Secure, SameSite=Lax, and signed using `JWT_SECRET`.
- Only Active Admin users can access the current release.
- This release does not include login throttling, password reset, MFA, or a full security audit. Restrict site access appropriately because employee data is confidential.
