#!/usr/bin/env bash
# Deploy the existing month scheduler only. Never run a closure manually or deploy other functions.
set -euo pipefail
g2_expected="${1:?Pass the tested Git commit SHA}"
test "$(git rev-parse HEAD)" = "$g2_expected"
if [ "$(gcloud auth list --filter=status:ACTIVE --format='value(account)')" != "g2snooker99@gmail.com" ]; then
 echo "STOP: select g2snooker99@gmail.com in Cloud Shell"; exit 1
fi
g2_env_json="$(mktemp /tmp/g2-cycle-env.XXXXXX)"
g2_job_json="$(mktemp /tmp/g2-cycle-job.XXXXXX)"
trap 'rm -f "$g2_env_json" "$g2_job_json"' EXIT
gcloud functions describe memberScheduledClose --gen2 --region=asia-southeast1 --project=member-3e17e --format=json > "$g2_env_json"
python3 - "$g2_env_json" <<'PY'
import json,re,sys
from pathlib import Path
config=json.loads(Path(sys.argv[1]).read_text())["serviceConfig"]
assert config["serviceAccountEmail"]=="g2-member-api@member-3e17e.iam.gserviceaccount.com","Unexpected runtime identity"
env=config.get("environmentVariables",{})
channel=env.get("MEMBER_LINE_CHANNEL_ID","")
owner=env.get("MEMBER_OWNER_LINE_UID","")
assert channel=="2010084269","Unexpected LINE channel"
assert re.fullmatch(r"U[0-9a-f]{32}",owner,re.I),"Pinned owner parameter unavailable"
assert env.get("MEMBER_MONTH_CLOSE_ADMIN_UID","") in ("",owner),"Existing close owner differs from pinned owner"
Path("functions/.env.member-3e17e").write_text(
 "MEMBER_LINE_CHANNEL_ID="+channel+"\nMEMBER_OWNER_LINE_UID="+owner+
 "\nMEMBER_MUTATIONS_ENABLED=true\nMEMBER_MONTH_CLOSE_ADMIN_UID="+owner+"\n"
)
print("Existing identity verified. Automatic close-and-open scheduler only.")
PY
npm --prefix functions install --omit=dev --no-audit --no-fund
firebase deploy --only functions:secure-member:memberScheduledClose --project member-3e17e --non-interactive
gcloud scheduler jobs describe firebase-schedule-memberScheduledClose-asia-southeast1 --location=asia-southeast1 --project=member-3e17e --format=json > "$g2_job_json"
g2_job_state="$(python3 - "$g2_job_json" <<'PY'
import json,sys
from pathlib import Path
job=json.loads(Path(sys.argv[1]).read_text())
assert job["schedule"]=="5 * * * *","Unexpected schedule"
assert job["timeZone"]=="Asia/Bangkok","Unexpected timezone"
assert job["state"] in ("ENABLED","PAUSED"),"Unexpected scheduler state"
print(job["state"])
PY
)"
if [ "$g2_job_state" = "PAUSED" ]; then
 gcloud scheduler jobs resume firebase-schedule-memberScheduledClose-asia-southeast1 --location=asia-southeast1 --project=member-3e17e --quiet
fi
echo "G2 automatic month cycle enabled. First check at the next HH:05 Bangkok time."
echo "No manual closure or customer point test was executed."
