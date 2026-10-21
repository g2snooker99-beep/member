# G2 Member — secure authentication/points migration (NOT DEPLOYED)

Current Firebase project: member-3e17e.

## Confirmed severe issue in live Firestore rules
The current firestore.rules grants public get/list and allows any unauthenticated
client to create or update ANY users/{id} document. It also allows anyone to
create a pointTransactions document. Client-side Admin PIN is embedded in
public/admin.html. This means a visitor can alter role, monthlyPoints,
lifetimeHours or fake an award via the Firebase web API, independent of POS.

Do NOT deploy an automatic point-award worker while these rules remain open.
Do NOT deploy firestore-secure-proposed.rules by itself: it intentionally
denies unauthenticated client access; current LINE LIFF pages would break.

## Planned release sequence (no live changes yet)
1. Back up Firestore collections users, pointTransactions, seasonResults and
   Firestore rules. Store backups privately, never GitHub/chat.
2. Create verified LINE -> Firebase Auth custom-token sign-in in a backend,
   using an authenticated LINE ID token with the correct LINE channel audience.
   Firebase Auth uid must equal the verified LINE user ID; restrict staff/admin
   claims to server-read roles, never trust browser-provided roles.
3. Convert registration, member card, leaderboard, staff-add-points, admin
   reset and point history pages to authenticated reads and backend writes.
   No direct monthlyPoints/lifetimeHours/role update from any web browser.
4. Publish a separate public leaderboard summary. The current public users
   read leaks members' phones and is not acceptable for a real rollout.
5. Implement server-only point-add and month-close operations. Monthly close:
   lock posAwardMonths/YYYY-MM BEFORE resetting/archiving points; capture
   winner snapshot; prevent any auto awards after closure. Do not use
   client-side hardcoded PIN for administrative authorization.
6. Test rules and auth in a cloned Firebase project with dummy members.
   Confirm that a non-member cannot edit points or impersonate staff.
7. Only after migrating ALL pages and verifying rule tests, deploy secure
   Firestore rules and client migration together in an approved release.
8. Provision separate least-privilege service identities for the POS Member
   reader and the award writer. Keep staging and live credentials isolated.

## Data model
- users/{verifiedLineUserId}: role, nickname, phone, monthlyPoints,
  pointsMonth, lifetimeHours, memberId
- pointTransactions/{id}: authoritative audit history
- posPointAwards/pos_{billId}_{lineUserId}: immutable server-only receipts
- posAwardMonths/{YYYY-MM}: server-only state 'open' | 'closed'
- seasonResults/{YYYY-MM}: final winners after month closure

The prepared proposed rules are in firestore-secure-proposed.rules, NOT
firebase.json's active firestore.rules file. They are intentionally
non-deployable until Firebase Auth custom tokens are integrated.

## Launch criteria
- POS staging tests pass; no customer points changed in staging
- Existing 37-point trial remains outside all real award outboxes
- Staff/manual topups and auto awards cannot race month closure
- Disaster recovery, outbox retry and audit reconciler tested against dummy data
- Owner approves backup, release window and rollback
