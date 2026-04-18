# Security

## Threat model (high level)

| Asset | Primary threats |
|---|---|
| Bid documents & commercial data | Leak to competitors; unauthorised internal access |
| Employee PII (PAN, bank, Aadhaar in CVs) | Unauthorised access, regulatory breach |
| Financial data (budgets, invoices, UTRs) | Fraud, tampering, repudiation |
| Vendor data | Tampering with bank details (classic invoice fraud) |
| Audit trail | Tampering to hide actions |

## Controls

### Authentication
- Keycloak OIDC for all users
- Password policy: min 12 chars, breach-database check via HaveIBeenPwned API
- TOTP MFA required for: Finance, BU Heads, Super Admin
- Step-up MFA (re-authenticate) before: editing vendor bank details, paying expense sheets, approving above ₹10L

### Authorization
- Role-Based Access Control (RBAC) + **BU scope**
- OPA / policy-as-code for route-level rules that depend on data (e.g., PM can approve only for their project)
- Default-deny: a user sees only what they're explicitly allowed to

### Sessions
- JWT access token: 15 min TTL
- Refresh token: 12 hours (rotated on use)
- Idle timeout: 15 min for Finance role, 30 min for others
- Device binding (optional) for Finance and Super Admin

### Data protection
- At rest: AES-256 via AWS KMS on RDS, EBS, S3
- Column-level encryption for: `vendor.bank_account_no`, `employee.pan`, `employee.aadhaar_hash`
- In transit: TLS 1.2+ only, HSTS on web, modern cipher suites
- Mutual TLS between API gateway and integration partners (accounting, banking)

### Secrets
- HashiCorp Vault; no secrets in code or images
- `.env` only for local dev
- Periodic rotation (quarterly) for database and integration credentials

### Input handling
- Zod validation on every request (body, query, params, headers)
- Parameterised queries via Prisma (never string-concat)
- File upload: MIME sniff + virus scan (ClamAV) + max size + extension allow-list
- Rate limit: 100 req/min per user; 10 req/min on auth endpoints

### Audit
- Every write emits an event to `audit_log` table
- Append-only archive to S3 (Object Lock in compliance mode)
- Retention: 7 years (financial + bid data)
- Fields captured: actor, role, action, resource, before, after, correlation_id, ip, user_agent, at

### Vulnerability management
- **SAST**: SonarQube in CI
- **SCA**: Dependabot + Snyk (weekly scan, blocking on critical)
- **DAST**: OWASP ZAP against staging, weekly
- **Container scanning**: ECR image scan pre-promotion
- **VAPT**: quarterly by CERT-In empanelled auditor
- Bug bounty / responsible-disclosure policy published

### Network
- Private subnets for app and DB tiers
- Public subnet only for ALB
- Security groups least-privilege; no world-open DB ports
- Egress only via NAT gateway with allow-list where possible

### Compliance commitments
- ISO 27001 — roadmap to cert by end of Year 2
- SOC 2 Type II — roadmap
- CERT-In directives — 6-hour incident reporting playbook in place
- Data Protection Act (DPDP 2023) — DPO appointed, consent + purpose documented

### What we won't do
- No third-party analytics trackers in the app
- No storage of unmasked card details (ever)
- No shared admin credentials (every admin has their own)
- No plaintext password storage or logging

## Incident response

- On-call rotation; PagerDuty-equivalent set up
- Sev 1 (data breach / outage) — acknowledge ≤ 15 min, regulator notify ≤ 6h
- Postmortem required within 5 business days, blameless

## Secure-by-default patterns for Claude Code

When writing new features, apply by reflex:

- Every new route → Zod schema on input, auth middleware on output
- Every new table → `business_unit_id`, `created_at`, `updated_at`, `deleted_at`, soft-delete by default
- Every new write → audit event with before/after diff
- Every file upload → virus scan + content-type validation
- Every external integration → mTLS or signed webhook with timestamp + nonce replay protection
- Every user-facing error → no stack traces, no internal IDs in messages
- Every data export → require explicit permission `export:<resource>`
