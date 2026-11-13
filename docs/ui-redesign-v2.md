# UI Redesign v2

Visual and interaction update only. `netlify/functions/*`, element IDs, API calls and data mapping are unchanged.

- Light and dark theme with a switch (topbar and login page). The choice is saved in `localStorage` (`emp-theme`) and follows the OS setting on first visit.
- Collapsible sidebar (topbar button; saved as `emp-side`), collapsible groups, "Find a sheet" filter (press `/`).
- Data page: single compact heading row, toolbar row, and the table fills the remaining viewport height. First column is sticky.
- Table interactions: smooth row hover, click to select a row, double-click a cell to copy it.
- Shared components: buttons, badges, inputs, cards, tables, icons (one stroke width and size scale).
- Soft glass is used only on topbar, sidebar, modal, toast and login preview. Data panels stay opaque for legibility.
- Motion respects `prefers-reduced-motion`.
