# Hostinger VPS Deployment Guide for Walkie Talkie

This guide provides step-by-step instructions for deploying Walkie Talkie to an Ubuntu Hostinger VPS using Docker Compose, Caddy (automated Let's Encrypt SSL), self-hosted LiveKit WebRTC, and private PostgreSQL.

---

## 1. Prerequisites & Hostinger VPS Sizing

- **Recommended VPS Plan**: Hostinger KVM 2 or KVM 4 (minimum 2 vCPU, 4GB RAM recommended for LiveKit media encoding/transmitting).
- **Operating System**: Ubuntu 22.04 LTS or Ubuntu 24.04 LTS.
- **Example Domain**: `example.com` (Subdomains: `talk.example.com` and `rtc.example.com`).
- **Example VPS Public IP**: `203.0.113.10`.

---

## 2. DNS Configuration

Log in to your DNS provider (Hostinger DNS Zone Editor, Cloudflare, etc.) and add two **A records**:

| Type | Name | Content / Value | TTL | Proxy Status |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `talk` (or `talk.example.com`) | `203.0.113.10` (Your VPS IP) | Auto / 300 | **DNS Only** (No Cloudflare Orange Cloud) |
| **A** | `rtc` (or `rtc.example.com`) | `203.0.113.10` (Your VPS IP) | Auto / 300 | **DNS Only** (Crucial for WebRTC UDP/TURN) |

> [!IMPORTANT]
> If using Cloudflare DNS, set the Proxy status to **DNS Only** (Grey Cloud) for both subdomains. Cloudflare HTTP proxying buffers WebSockets and does not forward raw WebRTC UDP traffic on ports 7882 and 50000-60000.

---

## 3. Hostinger Firewall & Ubuntu UFW Setup

LiveKit requires specific TCP and UDP ports for signaling, WebRTC media transport, and TURN relay.

### Port Requirements Matrix (Verified against LiveKit Official Docs)

| Port / Protocol | Service | Direction | Purpose |
| :--- | :--- | :--- | :--- |
| **22 / TCP** | OpenSSH | Inbound | VPS remote administration |
| **80 / TCP** | HTTP | Inbound | Let's Encrypt HTTP-01 challenge & HTTPS redirect |
| **443 / TCP & UDP** | HTTPS / HTTP3 | Inbound | Caddy reverse proxy for frontend, API, and WebRTC signal |
| **7881 / TCP** | LiveKit WebRTC TCP | Inbound | WebRTC TCP fallback for restrictive corporate/mobile networks |
| **7882 / UDP** | LiveKit ICE UDP | Inbound | Primary WebRTC UDP connection negotiation |
| **50000-60000 / UDP** | LiveKit RTC Media | Inbound | High-performance WebRTC voice transport packet range |
| **3478 / UDP & TCP** | LiveKit TURN | Inbound | Built-in TURN relay for symmetric NAT mobile users |

### Apply UFW Rules on Ubuntu

SSH into your Hostinger VPS:

```bash
ssh root@203.0.113.10
```

Run the following commands:

```bash
# Allow SSH first so you do not lock yourself out!
sudo ufw allow 22/tcp

# Allow Web & SSL
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp

# Allow LiveKit WebRTC media & fallback ports
sudo ufw allow 7881/tcp
sudo ufw allow 7882/udp
sudo ufw allow 50000:60000/udp
sudo ufw allow 3478/udp
sudo ufw allow 3478/tcp

# Enable Firewall
sudo ufw enable
sudo ufw status verbose
```

> [!NOTE]
> Also verify the **Hostinger hPanel Firewall** (if active under VPS > Security > Firewall) to ensure that the above ports are open at the hypervisor level.

---

## 4. Install Docker & Docker Compose on Ubuntu

Run on your VPS:

```bash
# Remove older packages
sudo apt update && sudo apt install -y ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Set up repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine and Docker Compose plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable and start Docker service
sudo systemctl enable docker
sudo systemctl start docker
```

---

## 5. Deploy Walkie Talkie

### 1. Copy Repository to VPS

You can either clone your repository or copy the directory:

```bash
mkdir -p /opt/walkie-talkie
cd /opt/walkie-talkie
# Clone your git repository here:
# git clone <your-repo-url> .
```

### 2. Configure Environment (`.env`)

Copy `deploy/.env.example` to `deploy/.env`:

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env
```

Update the following values:
- `APP_DOMAIN`: `talk.yourdomain.com`
- `RTC_DOMAIN`: `rtc.yourdomain.com`
- `VPS_PUBLIC_IP`: Your VPS public IP
- `JWT_SECRET`: Generate a secure string (`openssl rand -hex 32`)
- `POSTGRES_PASSWORD`: Generate a secure database password
- `LIVEKIT_API_KEY`: e.g. `talk_api_key_walkie`
- `LIVEKIT_API_SECRET`: Generate a secure key (`openssl rand -hex 32`)

### 3. Configure LiveKit (`deploy/livekit.yaml`)

Edit `deploy/livekit.yaml`:

```bash
nano deploy/livekit.yaml
```

- Update `keys` with the identical `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` from `deploy/.env`.
- Under `rtc:`, set `node_ip: "YOUR_VPS_PUBLIC_IP"`.
- Under `turn:`, set `domain: "rtc.yourdomain.com"`.

### 4. Build and Start Containers

From `/opt/walkie-talkie/deploy`:

```bash
cd /opt/walkie-talkie/deploy
docker compose up -d --build
```

Docker Compose will:
1. Spin up PostgreSQL 16 (on private network).
2. Spin up LiveKit media server.
3. Build and launch the Node.js API with automated schema migrations.
4. Build the Vite PWA frontend and bundle with Nginx.
5. Launch Caddy, which automatically negotiates valid Let's Encrypt TLS certificates for `talk.yourdomain.com` and `rtc.yourdomain.com`.

### 5. Verify Container Health

```bash
docker compose ps
```

You should see all 5 containers with status `Up` (healthy).

Check Caddy certificate acquisition:
```bash
docker compose logs caddy
```

Check API startup:
```bash
docker compose logs api
```

---

## 6. Testing Connectivity from Outside the VPS

From your local machine (macOS/Linux terminal):

1. **Test HTTPS & Web API:**
   ```bash
   curl -I https://talk.yourdomain.com/api/health
   # Expected: HTTP/2 200 with {"status":"ok","app":"Walkie Talkie API"}
   ```

2. **Test LiveKit WebRTC Signaling Subdomain:**
   ```bash
   curl -I https://rtc.yourdomain.com
   # Expected: HTTP/2 200 or 404 (LiveKit root responds)
   ```

3. **Test WebRTC TCP Fallback Port (7881):**
   ```bash
   nc -zv 203.0.113.10 7881
   # Expected: Connection to 203.0.113.10 port 7881 [tcp/*] succeeded!
   ```

4. **Test TURN Port (3478):**
   ```bash
   nc -uv -z 203.0.113.10 3478
   # Expected: Connection to 203.0.113.10 port 3478 [udp/*] succeeded!
   ```

---

## 7. Database Backups and Restore

### Automated Nightly Backups (Cron)

Edit crontab on the VPS:

```bash
crontab -e
```

Add the following line to back up the database every day at 3:00 AM:

```cron
0 3 * * * /bin/bash /opt/walkie-talkie/deploy/scripts/backup.sh >> /var/log/walkie_backup.log 2>&1
```

### Manual Backup

```bash
/opt/walkie-talkie/deploy/scripts/backup.sh
```

Dumps will be saved to `/var/backups/walkietalkie/walkietalkie_backup_YYYYMMDD_HHMMSS.sql.gz`.

### Restoring from Backup

```bash
/opt/walkie-talkie/deploy/scripts/restore.sh /var/backups/walkietalkie/walkietalkie_backup_XXXX.sql.gz
```

---

## 8. Updating the Application

When you make changes to the code and want to deploy an update without data loss:

```bash
cd /opt/walkie-talkie
git pull origin main
cd deploy
docker compose build api frontend
docker compose up -d --no-deps api frontend
```

---

## 9. Inspecting Logs and Troubleshooting

- **API Logs**: `docker compose logs -f --tail=100 api`
- **LiveKit Server Logs**: `docker compose logs -f --tail=100 livekit`
- **Reverse Proxy Logs**: `docker compose logs -f --tail=100 caddy`
- **Database Logs**: `docker compose logs -f --tail=100 postgres`
