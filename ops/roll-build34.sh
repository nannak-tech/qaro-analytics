#!/usr/bin/env bash
# Roll the web fleet to build 34 (already baked + snapshot-verified).
# AMI ami-00408666ce66a0424 = build 34 (thirdflow fix + web OS capture + apple-pay merge).
# Keeps build 33 (LT v226) as rollback. Safe: MinHealthyPercentage 100 (adds new
# before removing old), then invalidates CloudFront and verifies the live version.
set -euo pipefail
REGION=ap-south-1
AMI=ami-00408666ce66a0424
LT=lt-0fbbc1c5257033d63
ASG=nannak-prod-ap-south-1-backend-template
DIST=E1FEL410YI1R8Q

NEWV=$(aws ec2 create-launch-template-version --region "$REGION" --launch-template-id "$LT" \
  --source-version '$Default' --launch-template-data "{\"ImageId\":\"$AMI\"}" \
  --query 'LaunchTemplateVersion.VersionNumber' --output text)
aws ec2 modify-launch-template --region "$REGION" --launch-template-id "$LT" --default-version "$NEWV" \
  --query 'LaunchTemplate.[LaunchTemplateName,DefaultVersionNumber]' --output text
echo "LT v$NEWV is default (AMI $AMI); prior version kept as rollback"

RID=$(aws autoscaling start-instance-refresh --region "$REGION" --auto-scaling-group-name "$ASG" \
  --preferences '{"MinHealthyPercentage":100,"InstanceWarmup":90}' --query 'InstanceRefreshId' --output text)
echo "instance refresh: $RID"
for i in $(seq 1 60); do
  read S P < <(aws autoscaling describe-instance-refreshes --region "$REGION" --auto-scaling-group-name "$ASG" \
    --instance-refresh-ids "$RID" --query 'InstanceRefreshes[0].[Status,PercentageComplete]' --output text)
  echo "[$i] $S $P%"
  case "$S" in Successful) break;; Failed|Cancelled) echo "REFRESH $S — aborting"; exit 1;; esac
  sleep 15
done

INV=$(aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/*' --query 'Invalidation.Id' --output text)
aws cloudfront wait invalidation-completed --distribution-id "$DIST" --id "$INV" && echo "CloudFront invalidated"

echo "live version.json: $(curl -s --max-time 10 https://app.qaro.ae/version.json)"
echo "main.dart.js: $(curl -s --max-time 10 -o /dev/null -w '%{http_code} %{size_download} bytes' https://app.qaro.ae/main.dart.js)"
