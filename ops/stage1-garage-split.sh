#!/usr/bin/env bash
# Stage 1 — stop recovery/car-wash providers being shown as garages on qaro.ae.
# Runs on the production qaro-seo box (i-0a5c556e531cac8cc) via SSM.
# SAFE + REVERSIBLE: backs up data/garages.json and lib/garages.js to .bak-<ts>
# before any change. Rollback = restore those two .bak files + restart qaro-seo.
#
# What it does on the box:
#   1. Split data/garages.json by the DB's establishment_type:
#        garages.json  -> type 2 (real garages) + unclassified
#        recovery.json -> type 4 (recovery / roadside, incl. TRT #269)
#        carwash.json  -> type 3 (car wash / cleaning)
#      => the ~100 non-garages drop out of /garages, schema and the sitemap.
#   2. Patch garageRedirect() so old /garage/<slug> URLs 301 instead of 404:
#        recovery -> /services/towing-service, car wash -> /services/car-wash
#   3. node --check, restart qaro-seo, confirm /healthz = 200.
set -euo pipefail
REGION=ap-south-1
IID=i-0a5c556e531cac8cc
HERE="$(cd "$(dirname "$0")" && pwd)"

TMB64=$(base64 < "$HERE/.typemap.json" | tr -d '\n')

read -r -d '' STAGE1_PY <<'PY' || true
import json, time, os, shutil
CODE='/opt/qaro/app/code'; DATA='/opt/qaro/app/data'
tm={int(k):int(v) for k,v in json.load(open('/tmp/typemap.json')).items()}
gj=json.load(open(os.path.join(DATA,'garages.json')))
gs=gj['garages'] if isinstance(gj,dict) else gj
ts=time.strftime('%Y%m%d-%H%M%S')
shutil.copy(os.path.join(DATA,'garages.json'), os.path.join(DATA,'garages.json.bak-'+ts))
garages=[];recovery=[];carwash=[];other=[]
for g in gs:
    t=tm.get(int(g['id']))
    if t==2: garages.append(g)
    elif t==4: recovery.append(g)
    elif t==3: carwash.append(g)
    else: other.append(g)
def wrap(lst,note): return {'_comment':note,'generated_at':ts,'garages':lst}
json.dump(wrap(garages+other,'Garages (establishment_type=2) + unclassified. Split '+ts),open(os.path.join(DATA,'garages.json'),'w'),ensure_ascii=False,indent=1)
json.dump(wrap(recovery,'Recovery & roadside (establishment_type=4). Split '+ts),open(os.path.join(DATA,'recovery.json'),'w'),ensure_ascii=False,indent=1)
json.dump(wrap(carwash,'Car wash & cleaning (establishment_type=3). Split '+ts),open(os.path.join(DATA,'carwash.json'),'w'),ensure_ascii=False,indent=1)
print('SPLIT garages=%d recovery=%d carwash=%d other=%d'%(len(garages),len(recovery),len(carwash),len(other)))
p=os.path.join(CODE,'lib','garages.js'); src=open(p).read(); shutil.copy(p,p+'.bak-'+ts)
anchor="const BY_ID = new Map(GARAGES.map((g) => [g.id, g]));"
assert anchor in src,'anchor missing'
if 'RECOVERY_IDS' not in src:
    src=src.replace(anchor, anchor+"\nconst RECOVERY_IDS = new Set((load('recovery.json', 'garages') || []).map((g) => String(g.id)));\nconst CARWASH_IDS = new Set((load('carwash.json', 'garages') || []).map((g) => String(g.id)));",1)
old="""function garageRedirect(slug) {
  if (BY_SLUG.has(slug)) return null;
  const id = (/-(\\d+)$/.exec(String(slug)) || [])[1];
  const g = id && BY_ID.get(id);
  return g ? profileUrl(g) : null;
}"""
new="""function garageRedirect(slug) {
  if (BY_SLUG.has(slug)) return null;
  const id = (/-(\\d+)$/.exec(String(slug)) || [])[1];
  if (!id) return null;
  const g = BY_ID.get(id);
  if (g) return profileUrl(g);
  if (RECOVERY_IDS.has(id)) return '/services/towing-service';
  if (CARWASH_IDS.has(id)) return '/services/car-wash';
  return null;
}"""
assert old in src,'garageRedirect block not found'
src=src.replace(old,new,1); open(p,'w').write(src); print('PATCHED garages.js; backup .bak-'+ts)
print('SAMPLE_GARAGE_SLUG='+(garages[0]['slug'] if garages else 'none'))
PY
S1B64=$(printf '%s' "$STAGE1_PY" | base64 | tr -d '\n')

read -r -d '' REMOTE <<EOF || true
set -e
printf %s $TMB64 | base64 -d > /tmp/typemap.json
printf %s $S1B64 | base64 -d > /tmp/stage1.py
cd /opt/qaro/app/code
python3 /tmp/stage1.py
echo "=== node --check ==="; node --check lib/garages.js && echo SYNTAX_OK
chown qaro:qaro lib/garages.js ../data/garages.json ../data/recovery.json ../data/carwash.json 2>/dev/null || true
systemctl restart qaro-seo
sleep 3
echo "healthz: \$(curl -s -o /dev/null -w '%{http_code}' localhost:3000/healthz)"
echo "trt-redirect: \$(curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}' localhost:3000/garage/trt-car-recovery-dubai-269)"
rm -f /tmp/typemap.json /tmp/stage1.py
EOF
RB64=$(printf '%s' "$REMOTE" | base64 | tr -d '\n')

CID=$(aws ssm send-command --region "$REGION" --instance-ids "$IID" \
  --document-name AWS-RunShellScript \
  --parameters "commands=printf %s $RB64 | base64 -d | sudo bash" \
  --query 'Command.CommandId' --output text)
echo "command: $CID"
for i in $(seq 1 40); do
  st=$(aws ssm get-command-invocation --region "$REGION" --command-id "$CID" --instance-id "$IID" --query 'Status' --output text 2>/dev/null || true)
  case "$st" in Success|Failed) break;; esac; sleep 3
done
echo "STATUS=$st"
aws ssm get-command-invocation --region "$REGION" --command-id "$CID" --instance-id "$IID" --query 'StandardOutputContent' --output text
echo "--- stderr ---"
aws ssm get-command-invocation --region "$REGION" --command-id "$CID" --instance-id "$IID" --query 'StandardErrorContent' --output text | tail -5
