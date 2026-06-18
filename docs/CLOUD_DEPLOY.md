# Cloud Deployment

This guide deploys Thot on a small VPS with Docker Compose and Caddy-managed HTTPS.

## Cheapest Options

- Lowest cost: Oracle Cloud Always Free, when capacity is available. Good for experiments, less predictable for a personal production relay.
- Cheapest predictable paid VPS: a small Hetzner Cloud instance in Europe is usually the best value. A 2 vCPU / 4 GB RAM instance is more than enough for a personal relay because the heavy agent work runs on your desktop.
- Simpler but usually more expensive: DigitalOcean basic droplets.

## VPS Setup

Use Ubuntu 24.04 LTS and open only ports `22`, `80`, and `443`.

Install Docker:

```sh
sudo apt update
sudo apt install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
```

Configure the firewall:

```sh
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Clone or copy the repository:

```sh
git clone https://github.com/YOUR_USER/Thot.git
cd Thot
```

Create the environment:

```sh
cp .env.example .env
nano .env
```

Set strong values:

```env
POSTGRES_USER=agentrelay
POSTGRES_PASSWORD=use-a-long-random-password
POSTGRES_DB=agentrelay
DATABASE_URL=postgres://agentrelay:use-a-long-random-password@postgres:5432/agentrelay
REDIS_URL=redis://redis:6379
JWT_SECRET=use-a-different-long-random-secret
RELAY_PUBLIC_URL=https://relay.example.com
```

Point a DNS `A` record to the VPS public IP:

```text
relay.example.com -> YOUR_VPS_IPV4
```

Create the Caddyfile:

```sh
cp Caddyfile.example Caddyfile
nano Caddyfile
```

Replace `relay.example.com` with your real domain.

Start the relay:

```sh
docker compose -f docker-compose.cloud.yml up -d --build
docker compose -f docker-compose.cloud.yml logs -f backend
```

Check the health endpoint:

```sh
curl https://relay.example.com/health
```

Create the first account:

```sh
curl -X POST https://relay.example.com/api/auth/register \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"change-me-now"}'
```

## Desktop Host

On your desktop machine:

```powershell
npm install
$env:RELAY_URL="https://relay.example.com"
$env:RELAY_EMAIL="you@example.com"
$env:RELAY_PASSWORD="change-me-now"
npm run dev:desktop
```

Persist the printed `DEVICE_ID` for future runs:

```powershell
$env:DEVICE_ID="printed-device-id"
```

## Android

In the app, use:

```text
https://relay.example.com
```

Then log in, refresh devices, choose the desktop, choose the demo agent, and send a command.

## Backups

Run database backups regularly:

```sh
docker compose -f docker-compose.cloud.yml exec postgres \
  pg_dump -U agentrelay agentrelay > agentrelay-$(date +%F).sql
```

Keep backup copies outside the VPS.
