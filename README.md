# EMP — Human Capital Services | Netlify + GitHub (Phase 1)

This is a standalone web application. **Google Apps Script is not used.**

## Architecture

- GitHub: source-code repository
- Netlify: static hosting and serverless API functions
- Google Sheets API: reads the existing HCS workbook and stores EMP system users/activity
- Browser: talks only to Netlify Functions; Google credentials never reach the browser

## Included in Phase 1

- Sign-in page
- Admin-only Overview
- User Management
- Contract expiry dashboard alert (next 90 days)
- RFP aging dashboard alert (30+ days for PKWT Addition, PKWT Replacement, TPC to PKWT)
- Activity Log and 10-day history
- Mobile-responsive layout

## Important: bootstrap admin credentials

The first admin is created from Netlify environment variables:
- `BOOTSTRAP_ADMIN_USERNAME`
- `BOOTSTRAP_ADMIN_PASSWORD`

The example values in `.env.example` are placeholders. If you choose `admin` / `admin` for a local-only smoke test, replace them with a strong password before any public deployment. The app hashes passwords with Node.js `scrypt`; plaintext passwords are not written to the spreadsheet.

## 1. Google Cloud setup (one-time)

1. Open Google Cloud Console and create/select a project.
2. Enable **Google Sheets API**.
3. Create a Service Account and generate a JSON key.
4. Copy the service-account email.
5. Share the existing spreadsheet with that email as **Editor**.
6. Keep the JSON key private. Do not upload it to GitHub.

The spreadsheet ID is already set as the default from the link supplied in the project. You can override it with `GOOGLE_SHEET_ID`.

## 2. Create GitHub repository

1. Create an empty repository.
2. Extract this ZIP.
3. Upload all files and folders at the repository root (not the ZIP itself).
4. Commit: `Initial EMP Netlify Phase 1`.

## 3. Deploy to Netlify

1. In Netlify choose **Add new site → Import an existing project**.
2. Connect the GitHub repository.
3. Build command: `npm run build`
4. Publish directory: `public`
5. Netlify reads `netlify.toml` for Functions directory.

## 4. Configure Netlify environment variables

In Netlify → Site configuration → Environment variables, add:

| Variable | Value |
|---|---|
| `GOOGLE_SHEET_ID` | `17Iz_3lQyCkYLR5E-MyKkyQ_j21Qwda2zaUJf_CW2VYk` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full service-account JSON, minified to one line |
| `JWT_SECRET` | Random secret, at least 32 characters |
| `BOOTSTRAP_ADMIN_USERNAME` | Initial admin username |
| `BOOTSTRAP_ADMIN_PASSWORD` | Strong initial admin password |

Optional source-tab overrides:
- `SHEET_REC_PIPELINE`
- `SHEET_NEW_HIRE`
- `SHEET_EXTEND`
- `SHEET_RESIGNATION`
- `SHEET_TERMINATION`
- `SHEET_RETIREMENT`

After setting variables, trigger a new deploy.

## 5. First run

The first authenticated request creates two system-owned tabs in the same spreadsheet:
- `EMP User Management`
- `EMP Activity Log`

It seeds the first Admin from the bootstrap environment variables. The service account must have Editor access because user management and activity log write to these two system tabs.

Existing business master tabs are read-only in Phase 1. Their names, headers, order, and existing rows are not rewritten.

## 6. Local development

```bash
npm install
cp .env.example .env
# Fill in valid local values; keep .env private
npx netlify dev
```

Netlify CLI loads local environment variables. Never commit `.env`.

## Security notes

- No Google API key or service-account JSON is embedded in frontend code.
- Session cookie is HttpOnly, Secure, SameSite=Lax, and signed by `JWT_SECRET`.
- Passwords are stored as salted scrypt hashes.
- Only Active Admin users can access the current phase.
- This starter does not yet include production-grade login throttling, password reset, MFA, or a full security audit. Add these before broad organizational rollout.
- Use HTTPS (Netlify default) and restrict site access appropriately if the application contains confidential employee information.

## Data mapping notes

Dashboard source tabs default to the names listed above. Header matching is defensive. Confirm exact column labels in the live workbook before relying on contract/RFP alerts operationally. Missing mappings appear as dashboard warnings rather than fabricated values.

## Phase 1 boundary

No employee CRUD, recruitment CRUD, import/export, email reminders, or scheduled automations yet. These are intentionally deferred until the spreadsheet schema is validated. Export/import in later phases must preserve the original master headers and column ordering.

## Phase 1 data-sync hardening (November 2026)

The dashboard endpoint now reads each Phase 1 source independently. A missing or inaccessible tab is reported as a source warning and no longer causes all dashboard metrics to fail. The Overview reports per-tab row counts and the detected header list when a required mapping is missing.

Phase 1 Overview sources:
- `2026 Rec Pipeline` — RFP aging reminders (exact normalized types: PKWT Addition, PKWT Replacement, TPC to PKWT; age >= 30 days).
- `New Hire 2026` — new-hire record count, join count for current year, contract-end reminders.
- `Extend 2026` — contract-end reminders.
- `Resignation 2026`, `Termination 2026`, `Retirement 2026` — movement record counts.
- `EMP Activity Log` — recent activity (last 10 days).

The original Recruitment Pipeline uses header terminology including `Req Date` / `RFP Received`, `Contract Type`, and `RFP Process`; these are explicitly supported. Date parsing supports Google Sheets serial dates and common `dd/MM/yyyy` values.

Important: the dashboard cannot verify the live workbook from this package alone. After deploying this update, inspect the source diagnostics shown in the Overview. If a source is unavailable, confirm the exact tab name and share the spreadsheet with the service-account email as Viewer (Editor is only needed for system-owned EMP tabs/user management). Do not paste the service-account JSON or secrets into GitHub.
