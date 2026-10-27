#!/usr/bin/env bash
# Deploy only the read-only club callable, then Hosting. Never deploy Rules/POS/awards.
set -euo pipefail
g2_expected="${1:?Pass the tested Git commit SHA}"
test "$(git rev-parse HEAD)" = "$g2_expected"
g2_account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)')"
if [ "$g2_account" != "g2snooker99@gmail.com" ]; then
  echo "STOP: select g2snooker99@gmail.com in Cloud Shell"; exit 1
fi
g2_env_json="$(mktemp /tmp/g2-club-env.XXXXXX)"
trap 'rm -f "$g2_env_json"' EXIT
# Reuse the existing callable's non-secret LINE/owner parameters without printing them.
gcloud functions describe memberSession --gen2 --region=asia-southeast1 --project=member-3e17e --format=json > "$g2_env_json"
python3 - "$g2_env_json" <<'PY'
import json,re,sys
from pathlib import Path
data=json.loads(Path(sys.argv[1]).read_text())
config=data["serviceConfig"]
assert config["serviceAccountEmail"]=="g2-member-api@member-3e17e.iam.gserviceaccount.com","Unexpected runtime identity"
env=config.get("environmentVariables",{})
channel=env.get("MEMBER_LINE_CHANNEL_ID","")
owner=env.get("MEMBER_OWNER_LINE_UID","")
assert channel=="2010084269","Unexpected LINE channel"
assert re.fullmatch(r"U[0-9a-f]{32}",owner,re.I),"Existing owner parameter unavailable"
Path("functions/.env.member-3e17e").write_text(
 "MEMBER_LINE_CHANNEL_ID="+channel+"\nMEMBER_OWNER_LINE_UID="+owner+
 "\nMEMBER_MUTATIONS_ENABLED=false\nMEMBER_MONTH_CLOSE_ADMIN_UID=\n"
)
print("Existing project/LINE/owner verified. Read-only function deployment only.")
PY
npm --prefix functions install --omit=dev --no-audit --no-fund
firebase deploy --only functions:secure-member:memberClubData --project member-3e17e --non-interactive
# A failed callable deployment stops here, keeping the previous customer site.
firebase deploy --only hosting --project member-3e17e --non-interactive
echo "G2 Sport Club deployment complete."
