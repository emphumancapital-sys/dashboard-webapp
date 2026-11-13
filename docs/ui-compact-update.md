# UI Compact Update

## What changed
- Reduced page heading vertical footprint across Overview, data pages, and User Management.
- Reduced topbar height and spacing above page content.
- Tightened title, subtitle, status pill, search toolbar, metadata chips, and table cell spacing.
- Removed the independently scrolling data-navigation region. Navigation items now use compact 34px rows and flow naturally inside the sidebar.
- Kept the sidebar footer/profile visible through flex layout; the sidebar itself only scrolls on short screens when necessary.
- Added short-viewport and mobile-specific adjustments.

## Design rationale
The update follows the general ClickUp pattern of persistent navigation, compact location context, and keeping frequent actions close to the working content. It does not copy ClickUp branding or product UI.

## Validation
- `node --check public/app.js`: passed
- `node --check netlify/functions/data.mjs`: passed
- `node --check netlify/functions/_lib/sheets.mjs`: passed
- `npm run build`: passed

Visual QA against a live Netlify deployment has not been performed in this environment.
