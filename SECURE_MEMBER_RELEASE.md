# G2 Member secure release candidate

Current evidence: [release status](RELEASE_STATUS_2026-10-21.md).
Operator procedure and reserved approvals: [Thai go-live/rollback runbook](GO_LIVE_RUNBOOK_TH.md).

The feature branch contains authenticated LINE-to-Firebase custom login,
live server-owned staff ACL, idempotent manual grants, resumable month closure,
Top3/discount rewards and transactional one-use redemption. Client writes are denied.

Data tools provide encrypted typed exports, create-only test restores, private
additive migration plans, approved/hash-bound application with per-item receipts,
legacy reward/history compatibility and public leaderboard projections.
No migration resets member balances or replaces existing membership IDs.

Production writes in the Cloud Functions entry point default to disabled through
MEMBER_MUTATIONS_ENABLED=false, including scheduled closure. POS automatic awards
remain disabled. Staging Render transport is strictly bound to g2-member-test;
it must never be repointed to production.

Production release is NOT authorized and is not yet complete. Actual production
backup/restore evidence, verified owner/staff recertification, legacy writer
retirement, production POS wiring and runtime provisioning remain launch gates.
The source/operational distinction is explicit in the status and runbook.
