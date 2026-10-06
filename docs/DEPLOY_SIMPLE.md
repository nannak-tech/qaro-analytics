# Deploy the easy way — one EC2, one command

The simplest path: **one EC2** runs Postgres + the ingest API + Caddy (auto-HTTPS) via Docker
Compose. No App Runner, no VPC connector, no RDS, no load balancer. Postgres stays internal to the
box; the API is served over HTTPS at `analytics.qaro.ae`.

*(The App Runner / managed path still exists in [AWS_SETUP.md](AWS_SETUP.md) if you prefer it later.)*

## Step 1 — Launch one EC2  (EC2 → Launch instances)
- Name `qaro-analytics`, AMI **Amazon Linux 2023**, type **t3.small**.
- Key pair: none (we use Session Manager).
- **Network:** any subnet with **Auto-assign public IP = Enable** (a public subnet).
- **Security group** (create `analytics-sg`), inbound:
  - **HTTP 80** from `0.0.0.0/0`  (Caddy needs it to get the TLS cert)
  - **HTTPS 443** from `0.0.0.0/0`
  - *(SSH not needed)*
- **Storage:** root **30 GB gp3** (holds Postgres data + images).
- **Advanced → IAM instance profile:** a role with **`AmazonSSMManagedInstanceCore`** (so you can
  open a shell via Session Manager — create it once in IAM if you don't have one).
- Launch.

## Step 2 — Stable IP + DNS
- EC2 → **Elastic IPs → Allocate → Associate** with the instance (so the IP survives restarts).
- Route 53 → `qaro.ae` zone → **A record** `analytics.qaro.ae` → the Elastic IP.

## Step 3 — Bring the stack up  (EC2 → the instance → Connect → Session Manager)
```bash
sudo dnf install -y docker git
sudo systemctl enable --now docker
# docker compose plugin
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

sudo git clone https://github.com/nannak-tech/qaro-analytics.git /opt/qaro-analytics
cd /opt/qaro-analytics
sudo cp deploy/.env.example deploy/.env
sudo nano deploy/.env            # set a strong POSTGRES_PASSWORD (APP_KEY + query key are prefilled)

sudo docker compose -f compose.prod.yml --env-file deploy/.env up -d --build
```
That's it. Postgres applies its schema on first boot; Caddy fetches the HTTPS cert for
`analytics.qaro.ae` (needs Step 2 DNS done first).

## Step 4 — Verify
```bash
curl https://analytics.qaro.ae/health      # {"status":"ok","postgres":true}
```
Tell me the domain's live and I'll run the full end-to-end check (send events → read funnel + ad
metrics). Then we move to wiring the tracker into `nannak-app`.

## Day-2
- **Logs:** `sudo docker compose -f compose.prod.yml logs -f ingest-api`
- **Update:** `sudo git -C /opt/qaro-analytics pull && sudo docker compose -f compose.prod.yml up -d --build`
- **Backups:** add the daily `pg_dump → S3` timer from [SELF_HOSTED_POSTGRES.md](SELF_HOSTED_POSTGRES.md)
  (point it at the `qaro-analytics-postgres-1` container), and/or enable EBS snapshots on the volume.
- **Restart policy:** all services are `restart: always`, so they come back after a reboot.
