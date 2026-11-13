# EMP Phase 1 — Workbook schema reference

The authoritative source for the current release is the uploaded `Recruitment Pipeline.xlsx` workbook. The app uses exact tab names and explicit header/data row positions; it does not inherit legacy Apps Script mappings.

## Operational and report tabs

| UI label | Spreadsheet tab | Header row | Data start row | Notes |
|---|---|---:|---:|---|
| Request for Personnel | `2026 Rec Pipeline` | 1 | 2 | 35 columns, A:AI |
| Psychotest (SPK) | `SPK 2026` | 1 | 2 | 17 columns, A:Q |
| Medical Check Up (MCU) | `MCU 2026` | 1 | 2 | 16 populated headers, A:P |
| MCU Induction | `MCU Induction 2026` | 1 | 2 | Header contains `#REF!`; table withheld |
| Contract Extension | `Extend 2026` | 2 | 3 | 21 columns, A:U |
| New Hire | `New Hire 2026` | 1 | 2 | 17 columns, A:Q |
| TPC Pipeline | `2026 TPC Pipeline` | 1 | 2 | 21 columns, A:U |
| Offer Tracking | `Offer` | 2 | 3 | Mixed title/value and headers; table withheld |
| Employee Database | `Data Valid Employees` | 3 | 4 | Row 1–2 are summary information; 14 columns, A:N |
| New Hire vs Exit | `New Hire vs Exit` | 1 | 2 | Primary data table A:C |
| Pivot Dashboard 2026 | `Pivot Dashboard 2026` | 3 | 4 | Summary blocks in AX:BC |
| RFP Deletion Log | `RFP Deletion` | 1 | 2 | Incomplete header cells retained as generated column labels |
| Resource Deletion Log | `Resource Deletion` | 1 | 2 | Incomplete header cells retained as generated column labels |

## Overview KPI source

The Overview uses the `Dashboard 2026` worksheet's summary area (`B5:L25`) for these workbook-defined measures:

- All RFP, completed RFP, and completion rate
- All New Hire, completed New Hire, and completion rate
- All Extension, completed Extension, and completion rate
- Resignation, Termination, and Retirement counts

The Overview's recent RFP and upcoming contract-end tables are sourced from `2026 Rec Pipeline` and `Extend 2026`, respectively.

## System-owned tabs

### EMP User Management

| Column | Meaning |
|---|---|
| Username | Unique login identifier |
| Password Hash | Salted scrypt hash; never returned to frontend |
| Full Name | Display name |
| Role | Admin |
| Status | Active / Inactive |
| Created At | ISO timestamp |
| Updated At | ISO timestamp |

### EMP Activity Log

| Column | Meaning |
|---|---|
| Timestamp | ISO timestamp |
| Actor Username | Admin who performed action |
| Action | Added / Updated / Activated / Deactivated user |
| Module | User Management |
| Record ID | Username |
| Summary | Change summary |

External Talent Database and Training workbooks are out of scope for this release.
