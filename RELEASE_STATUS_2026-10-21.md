# Secure Member implementation and deployment hold

The feature branch now contains executable LINE-to-Firebase custom login,
server-authorized staff grants and revocation, idempotent manual points,
resumable monthly lock/snapshot/rewards, and reward redemption restricted to
the following Bangkok month. All client writes are denied. Current server
roles are read in each privileged transaction, so old token claims cannot
preserve revoked staff access.

`firebase.json` now selects the secure client and rules. Existing legacy
`public/` pages remain source history only; they must never be redeployed.
Secure client configuration is intentionally empty: fill in an isolated test
Firebase project and test LIFF before any cloud deployment. No live Firebase
deployment has been performed in this task.

## Verified evidence

- Initial Member emulator run: 9/9 security/auth/transaction/month-close tests.
- POS CI: 242 discovered Python tests, 202 executed/40 intentionally skipped
  in the dependency-light job; 11/11 JavaScript checks.
- Disposable PostgreSQL: 35/35 integration tests.
- Actual Firestore emulator + PostgreSQL: 5/5 tests, including two workers,
  Firebase outage, lost acknowledgement followed by month closure, closed
  month rejection, and an injected historic trial bill.
- All emulator tests use `demo-g2-member`, dummy users and no cloud credentials.
- Render staging public configuration confirms `awards_enabled=false`.
- Staging PostgreSQL real-award outbox is empty. Historic trial bill
  `B261021015307` is present and permanently rejected by producer and worker.
- Staging outbox does not yet contain migration 003 delivery columns.

Follow-up CI adds explicit staff assignment/revocation, reward redemption and
paid-checkout reconciliation tests; inspect the latest branch Actions result.

## Required connections and unfinished release gates

1. Sign into Firebase Console with access to `member-3e17e`. Verify actual
   deployed rules, IAM, Auth and functions; current browser stops at Google
   sign-in. No service-account credentials were requested or exposed.
2. Provide a separate cloud Firebase test project, test LIFF/LINE Login
   channel, and dedicated least-privilege identities. Emulator success does
   not establish cloud IAM/custom-token signing/LINE browser success.
3. Back up Member data/rules, map legacy nonzero `monthlyPoints` to an explicit
   `pointsMonth`, and verify restore. New code refuses to silently discard
   legacy/unclosed balances. Confirm the owner/admin role from trusted data.
4. Retire or migrate every legacy monthly reset/reward writer from the POS
   functions codebase. Deploying an additional codebase does not remove them.
   The new scheduler runs at 00:05 Bangkok on the first day, using a configured
   active admin UID; absent configuration fails closed.
5. Apply additive outbox migration 003 only to the verified test database;
   inject/schedule approved checkout reconciler and delivery worker with the
   dedicated writer. Production automatic delivery remains unwired/off.
6. Complete browser LINE login, camera QR scan workflow, checkout cancellation/
   editing/moving/merging regressions, paid-source revalidation at delivery,
   monitoring, backup/restore and rollback before release. The secure client now supports camera scanning, reward QR and a current
   public leaderboard projection; real browser/camera acceptance remains pending.

## Owner approval reserved

Only after every gate passes: approve coordinated Firebase rollout, POS
Production/main release, and changing `G2_MEMBER_ENABLED` to true. This task
does not grant that approval. Never import preview drafts or the 37-point
trial bill into a real award queue. Production/main and customer scores were
not modified by this task.
