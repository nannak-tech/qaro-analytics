# AWS setup — ingest stack, step by step (console)

Order matters (each step depends on the previous). Region: use the same as your app (e.g.
`ap-south-1`). End state: Postgres on EC2 (private) ← App Runner (ingest-api) ← `analytics.qaro.ae`.

Secrets generated this session (keep handy):
- `APP_KEY` = `qaro_e59b4dd89e5b00c63f797e01eb2ad0cd13b68ef5db1834b5`
- `INTERNAL_QUERY_KEY` = `iq_e631832fd441e28452b7a0e24e9c461c9bef48c6795dd339`

---

## Step 1 — Security group for Postgres  (EC2 → Security Groups → Create)
- Name: `analytics-pg-sg`, VPC: your **prod VPC** (`vpc-01218a495ebfaad69`).
- **Inbound: leave empty for now** (we add the App Runner source in Step 6).
- Outbound: default (all). Create.

## Step 2 — IAM role for the EC2  (IAM → Roles → Create role)
- Trusted entity: **AWS service → EC2**.
- Attach policies: **`AmazonSSMManagedInstanceCore`** (for Session Manager) and, for backups,
  a small inline policy allowing `s3:PutObject` on `arn:aws:s3:::YOUR_BACKUP_BUCKET/*`.
- Name: `analytics-pg-ec2-role`. Create.

## Step 3 — Launch the Postgres EC2  (EC2 → Instances → Launch instances)
- Name: `qaro-analytics-pg`.
- AMI: **Amazon Linux 2023**. Type: **t3.small**.
- Key pair: "Proceed without a key pair" (we use SSM, not SSH).
- **Network settings → Edit:**
  - VPC: prod VPC. Subnet: a **private** subnet (e.g. `private-subnet-1`, ap-south-1a).
  - Auto-assign public IP: **Disable**.
  - Firewall: **Select existing security group → `analytics-pg-sg`**.
- **Configure storage:** keep root 8 GB; **Add volume** → 50 GB **gp3** (this is `/pgdata`).
- **Advanced → IAM instance profile:** `analytics-pg-ec2-role`.
- Launch.

## Step 4 — Configure Postgres on the box  (EC2 → the instance → Connect → Session Manager)
Run the commands from **[SELF_HOSTED_POSTGRES.md](SELF_HOSTED_POSTGRES.md)** steps 2–5:
install Docker, format+mount the extra EBS at `/pgdata`, `docker run postgres:16-alpine`
(set a strong `POSTGRES_PASSWORD`), apply the schema from the repo, enable the daily backup timer.
Note the instance's **private IP** (EC2 → the instance → Details) — you'll need it for `POSTGRES_URL`.

## Step 5 — App Runner VPC connector  (App Runner → Networking, or created inline in Step 7)
- App Runner → **VPC connectors → Create** (or create it inline while making the service).
- Name: `analytics-vpc-connector`. VPC: prod VPC.
- Subnets: the **private subnets** in the AZs you'll run in (same VPC as the EC2).
- Security group: create/pick `apprunner-connector-sg` (outbound all; no inbound needed). Create.

## Step 6 — Let App Runner reach Postgres  (EC2 → Security Groups → `analytics-pg-sg` → Edit inbound)
- Add rule: **Type MySQL/Aurora? No — Type: PostgreSQL (TCP 5432)**, **Source: `apprunner-connector-sg`**.
- Save. (Now only the App Runner connector can reach 5432.)

## Step 7 — Create the App Runner service  (App Runner → Create service)
1. **Source:** *Source code repository* → **Add new** → **GitHub** → connect your GitHub
   (authorize the AWS Connector for GitHub) → repo **`nannak-tech/qaro-analytics`**, branch **`main`**.
2. **Deployment trigger:** Automatic.
3. **Configure build:** *Use a configuration file* (it reads `ingest-api/apprunner.yaml`).
   Set **Source directory: `ingest-api`**.
4. **Service settings:**
   - Service name: `qaro-analytics-ingest`.
   - Port: **4100** (matches apprunner.yaml).
   - **Environment variables:**
     | Key | Value |
     |-----|-------|
     | `POSTGRES_URL` | `postgres://ingest:<PW>@<ec2-private-ip>:5432/qaro_analytics` |
     | `PGSSL` | `disable` |
     | `DEV_APP_KEYS` | `qaro-customer:qaro_e59b4dd89e5b00c63f797e01eb2ad0cd13b68ef5db1834b5` |
     | `INTERNAL_QUERY_KEY` | `iq_e631832fd441e28452b7a0e24e9c461c9bef48c6795dd339` |
5. **Networking → Outgoing traffic:** **Custom VPC** → select `analytics-vpc-connector`.
6. **Health check:** Protocol **HTTP**, Path **`/health`**.
7. Create & deploy. When it's green, copy the **Default domain**
   (`https://xxxx.ap-south-1.awsapprunner.com`).

## Step 8 — Custom domain  (App Runner → the service → Custom domains)
- **Link domain** → `analytics.qaro.ae`. App Runner shows CNAME/validation records.
- Route 53 → the `qaro.ae` hosted zone → add those **CNAME** records. Wait for "Active".

## Step 9 — Verify (I'll run this, or you can)
```bash
curl https://analytics.qaro.ae/health          # {"status":"ok","postgres":true}
```
Then I send a test event + read back the funnel / ad metrics (or add a temporary `5432 from my IP`
rule on `analytics-pg-sg` and I verify straight against Postgres).

---

### Gotchas
- **App Runner can't reach the DB** → the connector SG isn't in the PG SG's inbound (Step 6), or
  the connector's subnets can't route to the EC2's subnet. Keep them in the same VPC/AZs.
- **Health check failing** → check `POSTGRES_URL` + `PGSSL=disable`; App Runner logs show the pg error.
- **GitHub connection** → the first App Runner build needs the "AWS Connector for GitHub" authorized
  on the `nannak-tech` org.
