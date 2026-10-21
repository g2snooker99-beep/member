# G2 Member release status — 2026-10-21

## Browser and camera checkout acceptance — verified 15:31 Bangkok

The user completed actual LINE login, registered a profile in g2-member-test,
scanned the staging table QR on a phone, and checked out from the POS browser.
The user then supplied a Member-page screenshot showing Winzy.A at 1 monthly
point and a +1 transaction. Its member ID matched the prior registration.

The test-only profile was admitted by an operator-configured, one-shot startup
helper after checking real Firebase Auth sign-in, exact UID/member ID, active
member role, zero starting balances and no prior allowlist record. This grants
no staff/admin privileges and changes no balances. Receipt:
`browserTestApprovals/d5cbe9fa-51b4-43bd-b86e-fb87c971a426`.
Restart does not re-enable an admission that has since been revoked.

To avoid a 55-minute wait, the existing synthetic table was explicitly aged to
70 minutes. The one-shot PostgreSQL receipt preserves old/new starts; session
and round markers were changed atomically, membership retained and old QR
links revoked. This is simulated elapsed time, not a wall-clock endurance test.
Clock receipt: `90ce0698-0e82-42ee-8ea1-dd4f2cb8cc32`. An initial attempt stopped
before mutation because session initialization had not completed; scheduling
was moved after request initialization and the subsequent cloud run passed.

Verified staging PostgreSQL results for new bill `B261021082941`:
- Exactly one matching award, points=1, state=delivered, attempts=1.
- Round closed and the table's active session removed.
- No historic preview/bill was used as an award source.
- Venue checkout notifications and relay side effects are suppressed only for
  synthetically named tables with all isolated-staging configuration guards.

Latest deployed feature code for these changes:
- Member: `a147f8ae2b23453e2d034c1d8ddcc36075a94a7c`.
- POS staging: `9e6a6ea9ca4c15603e94fa5bccfed04031062ec2`.

Focused checks passed: browser-admission isolation/replay tests, synthetic-table
side-effect boundaries, clock-fixture identity/time/project guards, and syntax
checks. Previously completed integration/cloud suites were not rerun merely to
repeat the same evidence. Fresh browser admin/staff/reward flows, final release
CI and the remaining production gates below are still required.

## Verified cloud evidence

Verified against Render application logs and staging PostgreSQL, without repeating completed tests. Test run: `35b990d5-1a95-44da-bb10-08936cf8eb56`. All recipients are synthetic fixtures in `g2-member-test`.

Render Member rehearsal passed:
- Real Firebase custom-token sign-in and ID-token verification.
- Forged administrator role rejected; revoked staff immediately rejected.
- Real HTTP grants total 37 points; concurrent requests and subsequent replay retain 37 points.
- Actual Firestore rules reject direct client point edits.
- Isolated month-close fixture: reset, repeat close, and retrospective award/reopen rejection.
- Restart recognizes the completed receipt and does not repeat awards.

POS staging rehearsal passed, confirmed independently in `g2_sandbox_rehearsals`:
- Actual Flask open-table and staff-authorized QR routes.
- Synthetic member enrollment through the trusted round store, including duplicate join rejection.
- Actual paid checkout while the receiver transport is deliberately unavailable.
- PostgreSQL retains the pending award.
- Real Firestore commit followed by deliberately lost acknowledgement; retry retains one award.
- Checkout invalidates the QR.
- New dummy bill `B261021072126`, table 11, one eligible hour, final balance 1 point.
- Queue currently has one delivered row. No venue notifications were sent by this rehearsal.

These earlier PostgreSQL and Firebase cloud rehearsals used programmatic enrollment. Outage and lost acknowledgement were deliberate transport fault injections, not an actual Firebase service outage. Later browser/camera acceptance is recorded separately above.

The earlier receiver deployment was `5f61c9d23df6a6370746d607563c496590810ccc`. Current feature deployments are recorded above.

## Remaining acceptance gates

1. LINE/browser/registration/camera enrollment and checkout acceptance is now complete as recorded above. The browser controller remains unavailable; acceptance is supported by the user's screenshots and independently verified server/database evidence. Remove temporary rehearsal configuration and review test-only helpers before any production rollout.
2. Verify test owner bootstrap from independently verified LINE identity; exercise actual admin/staff browser flows and reward redemption.
3. Complete checkout cancellation/edit/move/merge regression acceptance and confirm production timestamp handling.
4. Back up production Member data, rules and configuration; rehearse restore and explicitly migrate legacy balances to their correct month without dropping points.
5. Retire every legacy Admin SDK reset/reward writer. Roll out secure frontend and Firestore rules together only after approval; do not deploy rules alone against legacy pages.
6. Establish continuously scheduled production queue delivery, monitoring and recovery; free Render idle services are not a production worker guarantee.
7. Recheck feature-branch CI for final release commits. Previous emulator/CI evidence remains separate from cloud/browser acceptance.

## Production hold and rollback

Do not change POS Production/main, enable `G2_MEMBER_ENABLED=true`, write customer points, or change `member-3e17e` rules without explicit owner approval. Historic trial bill `B261021015307` remains excluded and must never be imported from previews.

For the eventual approved rollout: record deployment/configuration versions and backup/restore evidence first; stop legacy monthly writers; deploy the coordinated secure member frontend/backend/rules; verify read-only and synthetic canary behavior; approve activation separately. If canary or delivery checks fail, keep awards disabled, pause consumers, preserve outbox/receipts and restore compatible application/configuration versions. Do not delete receipts or replay all bills: reconcile by immutable award IDs before resuming. Restore data only from a verified backup under a separately reviewed recovery procedure.

This document records verified evidence and outstanding work; it is not production approval.
