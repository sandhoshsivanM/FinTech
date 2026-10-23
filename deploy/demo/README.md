# Khazana Online: free demo backend

The whole backend on **one free VM** (Oracle Cloud Always Free, Ubuntu 24.04
ARM, 4 cores / 24 GB), so https://khazana-online.netlify.app can sign people in
and sync. **Demo-grade:** one machine, no backups, data may be wiped. The
production path stays AWS Mumbai (design doc §13: Terraform, KMS, S3, backups).

What makes a demo acceptable here: records are **end-to-end encrypted** on the
devices (ADR 0005, 0006). The server stores ciphertext it cannot read, so even a
compromised VM exposes no money data.

## What runs

| Container | Role | Public? |
|---|---|---|
| caddy | HTTPS (Let's Encrypt, automatic) → gateway | **80/443 only** |
| gateway | routes, CORS for the web app, rate limits | no |
| identity, devices, sync, notification, catalog, marketdata, reporting | the services | no |
| postgres (7 databases), rabbitmq | storage and messaging | no |

Left out: **admin** (it needs an OIDC provider), and attachments
(`Providers__Attachments=Disabled`: there's no object store). Pushes are logged,
not sent. All services run as `ASPNETCORE_ENVIRONMENT=Staging`, so the
development sign-in and other Development-only shortcuts are off.

About 1.8 GB of memory in use when idle (measured in Docker on ARM64).

## First time (on the VM)

```bash
git clone https://github.com/sandhoshsivanM/FinTech.git khazana && cd khazana
git checkout feature/safety-net-and-hardening
sudo deploy/demo/harden.sh        # Docker, auto-updates, firewall 22/80/443, keys-only SSH
exit                              # log in again so the docker group applies
deploy/demo/secrets.sh            # .env + Identity signing key; API host = api.<public-ip>.sslip.io
deploy/demo/up.sh                 # build, start, wait until https://<host>/v1/catalog answers
```

Also open TCP 80 and 443 in the instance's **VCN security list** (Oracle's
cloud firewall, separate from the VM's own).

Then point the web app at it: build `webapp-online/` with
`NEXT_PUBLIC_GATEWAY_URL=https://<host>` and deploy (see
`webapp-online/README.md`).

## Updating

```bash
deploy/demo/up.sh                 # git pull, rebuild what changed, restart, smoke check
```

## Secrets

`secrets.sh` writes `deploy/demo/.env` (passwords and keys, mode 600) and
`deploy/demo/secrets/identity-signing.pem`. Both are git-ignored and never
leave the VM. It refuses to run twice: new keys would sign everyone out and
make Identity's encrypted fields unreadable. Delete `.env` on purpose to start
over (and `docker compose ... down -v` to wipe the data with it).

## Checks

```bash
docker compose -f deploy/demo/compose.yaml --env-file deploy/demo/.env ps
curl -s -o /dev/null -w "%{http_code}\n" https://<host>/v1/catalog     # 200
nc -zv <public-ip> 5432                                                 # must fail
```

## If Oracle has no ARM capacity

Run the same compose on a Mac with Docker, then expose Caddy with a free
Cloudflare quick tunnel (`cloudflared tunnel --url https://localhost`). The Mac
must stay on, and the tunnel's URL changes each run (rebuild the web app with
the new one).
