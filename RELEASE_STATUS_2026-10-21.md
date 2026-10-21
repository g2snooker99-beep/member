# G2 Member release status — 2026-10-21

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

These are actual PostgreSQL and Firebase cloud operations. Outage and lost acknowledgement are deliberate transport fault injections, not an actual Firebase service outage. Enrollment was programmatic: this does not establish camera scanning or real LINE browser login.

Member Render service is live at commit `5f61c9d23df6a6370746d607563c496590810ccc`. The latest deployment is `dep-dbc6gqhsrm7s73fqkvfg`.

## Remaining acceptance gates

1. Real test-account LINE LIFF browser login through LINE verification to Firebase Authentication; then registration and real QR-camera enrollment. The available browser controller currently reports a session mismatch when opening the test site, so no browser acceptance is claimed.
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
