# Self-hosted Postgres (analytics store) on EC2

The cheapest in-house option: one dedicated EC2 running the Postgres container with a persistent
EBS data volume and daily S3 backups. Keep it **separate** from the app's MySQL RDS so heavy
analytics queries never touch production. App Runner reaches it privately over the VPC connector —
no public IP needed.

## 1. Launch the instance

- **AMI:** Amazon Linux 2023
- **Type:** `t3.small` (2 vCPU / 2 GB) to start — fine for early volume; resize later.
- **VPC/subnet:** the **prod VPC**, a **private subnet** in an AZ your App Runner VPC connector will use.
- **No public IP.**
- **Extra EBS volume:** 50 GB `gp3` for the database (separate from the root disk → easy to snapshot/grow).
- **Security group `analytics-pg-sg`:** inbound **TCP 5432** from the **App Runner VPC connector's SG**
  (add that rule after you create the connector). No other inbound.
- **IAM role:** attach a role allowing `s3:PutObject` to your backups bucket (for the backup cron).
- **Access to administer:** use **SSM Session Manager** (no SSH/bastion needed).

## 2. Install Docker + mount the data volume

SSM into the instance, then:

```bash
sudo dnf install -y docker awscli
sudo systemctl enable --now docker

# Identify the extra EBS (often /dev/nvme1n1). Format ONLY if brand new/empty:
lsblk
sudo mkfs -t xfs /dev/nvme1n1
sudo mkdir -p /pgdata
echo '/dev/nvme1n1 /pgdata xfs defaults,nofail 0 2' | sudo tee -a /etc/fstab
sudo mount -a
sudo chown 999:999 /pgdata        # the postgres uid inside the official image
```

## 3. Run Postgres

```bash
sudo docker run -d --name qaro-pg --restart always \
  -e POSTGRES_USER=ingest \
  -e POSTGRES_PASSWORD='CHANGE_ME_STRONG' \
  -e POSTGRES_DB=qaro_analytics \
  -v /pgdata:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:16-alpine \
  -c shared_buffers=512MB -c effective_cache_size=1500MB -c max_connections=100
```

## 4. Apply the schema (no external access needed)

Pull the schema straight from the repo and pipe it into the container:

```bash
curl -fsSL https://raw.githubusercontent.com/nannak-tech/qaro-analytics/main/db/postgres/schema.sql \
  | sudo docker exec -i qaro-pg psql -U ingest -d qaro_analytics

# verify
sudo docker exec -it qaro-pg psql -U ingest -d qaro_analytics -c '\dt'   # events, app_keys, campaigns, ...
```

## 5. Daily backup to S3

```bash
sudo tee /usr/local/bin/qaro-pg-backup.sh >/dev/null <<'SH'
#!/bin/sh
set -e
TS=$(date +%F_%H%M)
F=/tmp/qaro_analytics_$TS.sql.gz
docker exec qaro-pg pg_dump -U ingest qaro_analytics | gzip > "$F"
aws s3 cp "$F" s3://YOUR_BACKUP_BUCKET/qaro-analytics/pg/ --only-show-errors
rm -f "$F"
SH
sudo chmod +x /usr/local/bin/qaro-pg-backup.sh

# run daily at 02:15 via a systemd timer
sudo tee /etc/systemd/system/qaro-pg-backup.service >/dev/null <<'SVC'
[Service]
Type=oneshot
ExecStart=/usr/local/bin/qaro-pg-backup.sh
SVC
sudo tee /etc/systemd/system/qaro-pg-backup.timer >/dev/null <<'TMR'
[Timer]
OnCalendar=*-*-* 02:15:00
Persistent=true
[Install]
WantedBy=timers.target
TMR
sudo systemctl enable --now qaro-pg-backup.timer
```

(Also enable **EBS snapshots** on the `/pgdata` volume via Data Lifecycle Manager for a second line
of recovery.)

## 6. Connection string

```
POSTGRES_URL = postgres://ingest:CHANGE_ME_STRONG@<instance-private-ip>:5432/qaro_analytics
```

Put this in the App Runner env (`POSTGRES_URL`). Because it's a private IP over TLS-less in-VPC
traffic, set **`PGSSL=disable`** in App Runner (the SG already restricts access to the connector).

## 7. Let me verify

To check it from my side end-to-end (insert + funnel + ad metrics), add a **temporary** inbound
rule on `analytics-pg-sg`: **TCP 5432 from my IP /32** (I'll confirm the IP), then remove it after —
same pattern as the main DB. Or run the smoke test yourself:

```bash
sudo docker exec -it qaro-pg psql -U ingest -d qaro_analytics \
  -c "insert into events(event_id,event_name,anonymous_id,session_id) \
      values(gen_random_uuid(),'app_open','a','s'); select count(*) from events;"
```

## Ops notes

- **Single point of failure:** this is one node. For HA later, move to RDS Postgres or add a replica.
- **Resize:** grow the gp3 volume online; bump the instance type if CPU/RAM gets tight.
- **Upgrades:** `docker pull postgres:16-alpine` → stop/rm/run with the same `-v /pgdata` (data persists).
  Major-version jumps (16→17) need a `pg_dump`/restore or `pg_upgrade` — plan those.
