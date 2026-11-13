# GitHub + Netlify deployment checklist

- [ ] Enable Google Sheets API in the service-account project.
- [ ] Share the main Recruitment Pipeline workbook with the service-account email.
- [ ] Confirm service-account access to the main workbook.
- [ ] Keep service-account JSON and JWT secret in Netlify environment variables only.
- [ ] Set `GOOGLE_SHEET_ID` (optional because the current workbook ID is the code default).
- [ ] Set `GOOGLE_SERVICE_ACCOUNT_JSON`.
- [ ] Set `JWT_SECRET` (at least 32 random characters).
- [ ] Set `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` only if seeding an initial admin is required.
- [ ] Push the repository to the intended GitHub branch.
- [ ] Confirm Netlify deploy succeeds.
- [ ] Test sign-in and User Management.
- [ ] Confirm source discovery reports accessible tabs and flags only schema exceptions.
- [ ] Test each data tab, search, and pagination.
- [ ] Check desktop and mobile layouts.
- [ ] Restrict access to the intended organization.

Operational source tabs are read-only. User Management and Activity Log are the only system-owned tabs that the app may write.
