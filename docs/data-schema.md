# EMP Phase 1 — Data Schema

## Existing master sheets (read-only)

The current backend defaults to these sheet names, based on the legacy workbook configuration:
- 2026 Rec Pipeline
- SPK 2026
- MCU 2026
- MCU Induction 2026
- New Hire 2026
- Extend 2026
- Resignation 2026
- Termination 2026
- Retirement 2026
- Master All
- New Hire vs Exit
- Pivot Dashboard 2026

Phase 1 dashboard currently reads:
- `2026 Rec Pipeline`
- `New Hire 2026`
- `Extend 2026`
- `Resignation 2026`
- `Termination 2026`
- `Retirement 2026`

No existing master tab is edited.

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

## Header matching

Contract end date candidates include `Contract End Date`, `End Date`, `Contract Expiry`, `Expiry Date`, `Tanggal Akhir Kontrak`, `Tanggal Berakhir Kontrak`, and `PKWT End`.

RFP request date candidates include `Request Date`, `RFP Date`, `Tanggal Request`, `Tanggal RFP`, `Received Date`, and `Open Date`.

RFP recruitment type candidates include `Recruitment Type`, `Request Type`, `Contract Type`, `Jenis Recruitment`, and `Employment Type`.

Only `PKWT Addition`, `PKWT Replacement`, and `TPC to PKWT` are included in RFP aging. Alerts are shown at age >= 30 days.

Confirm exact spreadsheet headers before using these metrics as operational triggers.
