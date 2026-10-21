# Render test backend (no Firebase billing upgrade)

Deploy branch `feature/secure-pos-points`, never main. Runtime Node 22,
build `cd functions && npm install --omit=dev --no-audit --no-fund`,
start `node functions/render-http.js`, health `/health`, free Singapore.
The transport uses the same service/transactions/ACLs as Cloud Functions;
no Functions deploy is needed. Missing credentials returns 503 to every API.

## Required settings

- `G2_MEMBER_ENABLED=false` (never change for this rehearsal).
- `G2_FIREBASE_PROJECT_ID=g2-member-test`.
- `G2_MEMBER_API_ORIGIN=https://g2-member-test-api.onrender.com` (actual canonical service URL).
- `MEMBER_LINE_CHANNEL_ID=2010084269`.
- `MEMBER_OWNER_LINE_UID`: independently verified test operator LINE UID; never trust legacy users.role.
- `G2_TEST_FIREBASE_SERVICE_ACCOUNT_JSON`: new key for **g2-member-test only**.
- `G2_TEST_FIREBASE_WEB_CONFIG_JSON`: public Firebase web app config with projectId g2-member-test.
- `G2_TEST_LIFF_ID`: separate test LIFF pointed at this service root; openid scope required.

Never reuse the production reader key or default compute/appspot identity.
Keep private keys exclusively in Render Environment/secret files. Never commit,
paste into chat, or log them. Existing Firebase rules deny all client writes.

## User setup clicks

1. Google Cloud Console → select **g2-member-test** → IAM & Admin → Service Accounts
   → Create service account → name `g2-render-test`. Grant **Cloud Datastore User**
   and **Firebase Authentication Admin** only in this test project. Create a JSON
   key under this account's Keys tab. This account signs its own custom tokens;
   no Editor/Owner role is required. Review the key action before creating it.
2. Render → test API service → Environment → Edit → add
   `G2_TEST_FIREBASE_SERVICE_ACCOUNT_JSON`, paste JSON privately → Save, rebuild, deploy.
3. Firebase Console → **g2-member-test** → Project settings → General → Your apps
   → select the already registered `g2-render-test-web` (app ID
   `1:440696322754:web:2314128e8f65895dfa195b`, without Hosting). Its public web
   config is already saved in Render as `G2_TEST_FIREBASE_WEB_CONFIG_JSON`.
   Custom-token login does not require enabling a social sign-in provider.
4. LINE Developers → Login channel **2010084269** → LIFF → Add a **new test LIFF**
   → Endpoint URL = the test API root → scope **openid/profile**. Set
   `G2_TEST_LIFF_ID` in Render. Do not repoint the existing live Member LIFF.
5. Bootstrap the verified test owner in users and memberStaffAccess server-side.
   Do not bulk-approve roles from the legacy database. Point recipients must
   additionally have `sandboxMembers/{uid}={dummyOnly:true,enabled:true}` written
   by a trusted operator. Never mark customer accounts as dummy members.

## POS sandbox connection

Use only g2snooker-staging. Preserve its live read-only credential unchanged.
After validated test-only configuration, sandbox startup applies additive
metadata migration 003 under a PostgreSQL advisory lock. It checks
`current_database()` equals `g2snooker_staging_db` first, and queues no historic
bills. An optional manual command is `python -m member_integration.migrate_sandbox`.

Set the new test-only credential and `G2_FIREBASE_PROJECT_ID=g2-member-test`,
confirm `G2_MEMBER_POS_TIMEZONE` against POS timestamp storage, then set
`G2_MEMBER_SANDBOX_ENABLED=true` **only after credentials/fixtures are
ready**. Keep `G2_MEMBER_ENABLED=false`. Test membership lookup is allowlisted;
it never falls back to the live member reader. Paid checkout closes QR, produces
the immutable outbox and attempts one delivery. Signed staff can POST
`/__staging/member/sandbox/drain` with the canonical Origin and existing staff
bearer to reconcile/retry at most 20 rows. On Render free there is no guarantee
of continuous background delivery while idle; production scheduling is a release gate.

## Acceptance evidence still required before release

Real Render Admin SDK write to a dummy member; real LINE browser/custom-token
round trip; staff revocation; actual staging open-table → QR → join → checkout;
lost acknowledgement/retry and offline recovery; month boundary/closure.
Emulator tests are a prerequisite, not a substitute for this rehearsal.
Historic trial bill B261021015307 / 37 points remains blocked at producer and
worker. Never migrate preview drafts into the outbox. Do not deploy production
rules alone: replace legacy LIFF pages and retire old Admin SDK monthly writers
in the same separately approved release.
