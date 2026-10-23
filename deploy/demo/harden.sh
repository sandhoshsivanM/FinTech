#!/usr/bin/env bash
# One-time VM setup for the demo (Ubuntu 24.04 on Oracle Cloud), run with sudo:
#   sudo deploy/demo/harden.sh
# Installs Docker, turns on automatic security updates, allows only SSH and
# HTTPS in, and turns off password logins.
set -euo pipefail

apt-get update
apt-get install -y docker.io docker-compose-v2 unattended-upgrades iptables-persistent git curl openssl
systemctl enable --now docker
usermod -aG docker "${SUDO_USER:-ubuntu}"
dpkg-reconfigure -f noninteractive unattended-upgrades

# Oracle's Ubuntu images reject everything but SSH in iptables; open 80 and
# 443 for Caddy (Let's Encrypt needs 80) and nothing else.
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null ||
    iptables -I INPUT 5 -m state --state NEW -p tcp --dport "$port" -j ACCEPT
done
iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p udp --dport 443 -j ACCEPT
netfilter-persistent save

# Keys only.
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh

echo "Done. Log out and back in once so the docker group applies."
