python - <<'PY'
import os,json
from urllib.parse import urlparse
u=os.environ.get('DATABASE_URL','')
if urlparse(u).scheme not in ('postgres','postgresql'):
    print(json.dumps({'postgres_configured':False})); raise SystemExit(0)
import psycopg2
c=psycopg2.connect(u,connect_timeout=10)
c.set_session(readonly=True)
try:
    with c.cursor() as q:
        q.execute("SELECT current_database(),current_setting('TimeZone'),to_regclass('g2_sandbox_rehearsals') IS NOT NULL")
        name,tz,sandbox=q.fetchone()
        q.execute('SELECT count(*) FROM bills')
        print(json.dumps({'database':name,'database_timezone':tz,'sandbox_tables':sandbox,'bills':q.fetchone()[0],'runtime_timezone':os.environ.get('TZ'),'production_pos_liff':os.environ.get('G2_MEMBER_LIFF_ID'),'commit':os.environ.get('RENDER_GIT_COMMIT'),'writes':0}))
finally:
    c.rollback(); c.close()
PY
