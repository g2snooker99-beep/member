# Staging owner binding

Operator-only, one-shot `approve-test-owner.js` can bind the already signed-in owner to the test backend. It is not exposed by an HTTP route and cannot run against production.

Required configuration on the existing Member test API:
- G2_FIREBASE_PROJECT_ID=g2-member-test; G2_MEMBER_ENABLED=false
- G2_MEMBER_API_ORIGIN=https://g2-member-test-api.onrender.com
- G2_TEST_OWNER_UID: exactly the user-approved LINE owner UID
- MEMBER_OWNER_LINE_UID: the same pinned UID
- G2_TEST_OWNER_APPROVAL_RUN_ID: unique UUID
- G2_TEST_OWNER_APPROVAL_MODE: inspect (default, no writes) or apply (explicit operator binding)

The module verifies a recent, enabled Firebase Auth browser sign-in and the registered deterministic test member ID. It refuses inactive/conflicting profiles, unrelated staff ACLs, revoked access, wrong projects/origins and emulator settings. Apply changes only the owner's role, server ACL, test audit receipt and owner public-board projection. Scores, member ID, lifetime hours and other profile fields stay unchanged. No custom auth tokens or claims are minted.

After success, the startup hook calls the normal service session implementation and records its actual staff/admin capabilities. Clear G2_TEST_OWNER_UID, G2_TEST_OWNER_APPROVAL_RUN_ID and G2_TEST_OWNER_APPROVAL_MODE after verifying success; retain MEMBER_OWNER_LINE_UID as the server's owner pin. Refresh the signed-in browser to load current capabilities. Replaying the same receipt never restores revoked access.

Do not grant any other staff accounts without the owner's reviewed staff list. This test binding does not certify the production login, approve production IAM, or authorize a production deploy.
