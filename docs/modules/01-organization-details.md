# Module 1 — Organization Details

**Purpose:** Single source of truth for the company's legal, statutory, financial and capability data, plus the Business Unit structure that drives approvals and reporting.

**Primary users:** Compliance Officer, Super Admin, BU Head (read-only), all other roles (read via auto-populated forms).

## Core entities

| Entity | Notes | Status |
|---|---|---|
| `Company` | Single row; legal name, CIN, addresses, logo URI, **PAN, GSTIN, bank details** | **Shipped** |
| `CompanyDocument` | Attachable documents with name, file, sort order; drag-to-reorder | **Shipped** |
| `User` | Platform user with Keycloak external ID, email, phone, status; **multi-role assignment** via `user_role` join table | **Shipped** |
| `Role` | Named roles with display name, description, permissions JSON, system flag | **Shipped** |
| `BusinessUnit` | BU name, BU Head (dropdown filtered by `bu_head` role), cost centre, description, approval thresholds, status | **Shipped** |
| `BusinessUnitMember` | User ↔ BU ↔ Role membership | **Shipped** (schema + API) |
| `StatutoryRegistration` | Type (PAN, GSTIN, TAN, EPF, ESIC, PT, Udyam), number, validity, certificate file | Schema only |
| `Certification` | Name (ISO 9001 etc.), scope, validity, certificate file | Schema only |
| `Empanelment` | Agency, category, empanelment no., validity, rate contract ref | Schema only |
| `DSC` | Serial no., holder (`user_id`), validity, status (active/expired/revoked), usage log | Schema only |
| `DirectorKMP` | Name, DIN, designation, shareholding %, start/end date | Not started |
| `TurnoverRecord` | Financial year, revenue (paise), net-worth, auditor, certificate file | Schema only |
| `PastProject` | Title, client, order value, start, completion %, completion certificate | Schema only |
| `Employee` | User ref, code, role, qualifications, skills, CV file, availability | Schema only |
| `BankAccount` | Bank, account no., IFSC, purpose (EMD / receivables / payroll) | Schema only |

## Functional requirements

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-1.1 | Maintain single Company Profile used across all documents and bids. **Includes financial info (PAN, GSTIN, bank details) and document attachments with drag-reorder.** | P0 | **Shipped** |
| FR-1.2 | Maintain statutory registrations with validity and certificate upload | P0 | Schema only |
| FR-1.3 | Certifications with validity and expiry alerts at 90/60/30 days | P0 | Schema only |
| FR-1.4 | Empanelments with validity and rate-contract reference | P0 | Schema only |
| FR-1.5 | DSCs with serial number, holder, validity and usage log | P0 | Schema only |
| FR-1.6 | Directors / KMP master with DIN and shareholding | P0 | Not started |
| FR-1.7 | Audited turnover and net-worth per FY with certificate | P0 | Schema only |
| FR-1.8 | Past-performance repository with completion certificate | P0 | Schema only |
| FR-1.9 | Employee master with CV, skills, qualifications, availability | P0 | Schema only |
| FR-1.10 | One-click Eligibility Pack generator for a given tender | P1 | Not started |
| FR-1.11 | Version control on every change (actor, timestamp, reason). **Implemented via `audit_log` table — every write records action, actor, before/after JSON, correlation ID, IP.** | P0 | **Shipped** |
| FR-1.12 | Role-based write access: Compliance + Super Admin only. **User-Role multi-assignment shipped; RBAC enforcement per-endpoint is TBD.** | P0 | Partial |
| FR-1.13 | Expiry dashboard with traffic lights across all validity-bearing records | P1 | Not started |
| FR-1.14 | Bank-account master tagged by purpose. **Primary bank account fields on Company Profile shipped; separate BankAccount CRUD TBD.** | P1 | Partial |
| FR-1.15 | **Business Unit master** with BU Head (dropdown of users with `bu_head` role), cost centre, default approvers. **BU Head name shown in list.** | P0 | **Shipped** |
| FR-1.16 | Every Opportunity, Project, Expense Sheet and MR tagged to one BU | P0 | Schema enforced |

## Shipped API endpoints

```
# Company Profile
GET    /api/v1/company                          # singleton get (404 if none)
PATCH  /api/v1/company                          # upsert (201 on first call, 200 after)

# Company Documents
GET    /api/v1/company-documents                # list (sorted by sort_order)
POST   /api/v1/company-documents                # upload (multipart: name + file)
GET    /api/v1/company-documents/:id/download   # download/view file
PATCH  /api/v1/company-documents/:id            # rename and/or replace file
DELETE /api/v1/company-documents/:id            # soft delete
PUT    /api/v1/company-documents/reorder        # bulk reorder { ids: [...] }

# Business Units
GET    /api/v1/business-units                   # cursor-paginated, ?status, ?q
POST   /api/v1/business-units
GET    /api/v1/business-units/:id
PATCH  /api/v1/business-units/:id
DELETE /api/v1/business-units/:id               # soft delete, refs-guard

# Roles
GET    /api/v1/roles                            # cursor-paginated, ?q
POST   /api/v1/roles
GET    /api/v1/roles/:id
PATCH  /api/v1/roles/:id
DELETE /api/v1/roles/:id                        # soft delete, system-role guard

# Users
GET    /api/v1/users                            # cursor-paginated, ?status, ?q
POST   /api/v1/users                            # accepts roleIds[]
GET    /api/v1/users/:id                        # includes roles + BU memberships
PATCH  /api/v1/users/:id                        # accepts roleIds[]
DELETE /api/v1/users/:id                        # soft delete
```

## Shipped Angular pages

| Route | Component | Features |
|---|---|---|
| `/admin/company-profile` | `CompanyProfileComponent` | Two-column form (org + financial), document card grid with file-type icons, drag-reorder, upload/view/change/delete |
| `/admin/business-units` | `BuListComponent` + `BuFormDialogComponent` | Table with BU Head name column, form dialog with BU Head dropdown (filtered by `bu_head` role) |
| `/admin/users` | `UsersComponent` | Table with Roles chip column, form dialog with multi-select role assignment |
| `/admin/roles` | `RolesComponent` | Table with system/custom tag, form dialog, system role protection |

## Business rules to preserve

- Every creatable entity at company level gets a **BU tag** if multi-BU is enabled; the Company itself is not BU-scoped.
- Expiry calculation: `days_to_expiry = validity_end - today`; alert bands at 90/60/30/7 days; expired items shown red.
- `BusinessUnit.bu_head_user_id` is mandatory; cannot be deleted while projects/opportunities reference it — require re-assignment first.
- BU Head dropdown is filtered to users who have the `bu_head` role — assign the role first in Users management.
- A User can have multiple roles (global, not per-BU). Roles are synced on create/update via the `user_role` join table.
- Company Documents support drag-to-reorder; `sort_order` is persisted. New documents append to the end.
- Deleting an employee with open approvals pending triggers re-routing to their reporting manager.
