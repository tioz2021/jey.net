#!/usr/bin/env bash
#
# Prepares a fresh Ubuntu 24.04 server for jey.net.
#
# Run as root on the server:
#
#   bash provision.sh                 # user, keys, swap, firewall, updates
#   ssh jey@<ip>                      # make sure key login works
#   bash provision.sh --harden-ssh    # then turn off password and root login
#
# The second step is separate on purpose: turning off password auth before
# the new user can log in would lock everyone out.
#
# The script is idempotent and can be re-run safely.

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-jey}"
TIMEZONE="${TIMEZONE:-Europe/Kyiv}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
HARDEN_SSH=0

for argument in "$@"; do
    case "$argument" in
        --harden-ssh) HARDEN_SSH=1 ;;
        *) echo "unknown argument: $argument" >&2; exit 2 ;;
    esac
done

say() { printf '\n==> %s\n' "$*"; }

require_root() {
    if [[ "${EUID}" -ne 0 ]]; then
        echo "run this script as root" >&2
        exit 1
    fi
}

require_ubuntu() {
    if ! grep -q '^VERSION_ID="24.04"' /etc/os-release; then
        echo "expected Ubuntu 24.04, got: $(. /etc/os-release && echo "$PRETTY_NAME")" >&2
        exit 1
    fi
}


set_timezone() {
    say "timezone: ${TIMEZONE}"

    local candidate="${TIMEZONE}"

    # Ubuntu 24.04 renamed Europe/Kiev to Europe/Kyiv; accept both.
    if ! timedatectl list-timezones | grep -qx "${candidate}"; then
        case "${candidate}" in
            Europe/Kiev) candidate="Europe/Kyiv" ;;
            Europe/Kyiv) candidate="Europe/Kiev" ;;
        esac
    fi

    if timedatectl list-timezones | grep -qx "${candidate}"; then
        timedatectl set-timezone "${candidate}"
        echo "timezone set to ${candidate}"
    else
        echo "warning: timezone ${TIMEZONE} is not available, leaving the default" >&2
    fi
}

harden_ssh() {
    say "hardening sshd"

    install -d -m 755 /etc/ssh/sshd_config.d

    # sshd takes the FIRST value it meets, and cloud images ship
    # 50-cloud-init.conf with `PasswordAuthentication yes`, so our file has
    # to sort before it.
    rm -f /etc/ssh/sshd_config.d/99-jey.conf
    cat > /etc/ssh/sshd_config.d/00-jey.conf <<'SSHD'
# Managed by jey.net provision.sh
# Root may still log in with a key (needed for package installs); passwords
# are disabled everywhere.
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
SSHD

    sshd -t
    systemctl reload ssh
    echo "password auth is disabled; root is reachable by key only"
}

main() {
    require_root
    require_ubuntu

    if [[ "${HARDEN_SSH}" -eq 1 ]]; then
        harden_ssh
        exit 0
    fi

    say "base packages"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y --no-install-recommends \
        ca-certificates curl ufw unattended-upgrades needrestart tzdata

    set_timezone

    say "deploy user: ${DEPLOY_USER}"
    if ! id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
        adduser --disabled-password --gecos "" "${DEPLOY_USER}"
    fi

    install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"

    if [[ -s /root/.ssh/authorized_keys ]]; then
        install -m 600 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" \
            /root/.ssh/authorized_keys "/home/${DEPLOY_USER}/.ssh/authorized_keys"
        echo "copied root's authorized_keys to ${DEPLOY_USER}"
    else
        echo "warning: /root/.ssh/authorized_keys is empty; add the public key manually" >&2
    fi

    say "restricted sudo for ${DEPLOY_USER}"
    cat > "/etc/sudoers.d/${DEPLOY_USER}" <<SUDOERS
# Managed by jey.net provision.sh
${DEPLOY_USER} ALL=(root) NOPASSWD: /bin/systemctl start jey-api, /bin/systemctl stop jey-api, /bin/systemctl restart jey-api, /bin/systemctl status jey-api, /bin/systemctl reload caddy, /bin/systemctl status caddy, /usr/bin/journalctl
SUDOERS
    chmod 440 "/etc/sudoers.d/${DEPLOY_USER}"
    visudo -cf "/etc/sudoers.d/${DEPLOY_USER}"

    say "swap: ${SWAP_SIZE}"
    if ! swapon --show | grep -q '/swapfile'; then
        if [[ ! -f /swapfile ]]; then
            fallocate -l "${SWAP_SIZE}" /swapfile
            chmod 600 /swapfile
            mkswap /swapfile
        fi
        swapon /swapfile
    fi
    if ! grep -q '^/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    echo 'vm.swappiness = 10' > /etc/sysctl.d/99-jey.conf
    sysctl --system >/dev/null
    swapon --show

    say "unattended upgrades"
    cat > /etc/apt/apt.conf.d/20auto-upgrades <<'UPGRADES'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
UPGRADES
    systemctl enable --now unattended-upgrades

    say "file descriptor limits"
    cat > "/etc/security/limits.d/99-${DEPLOY_USER}.conf" <<LIMITS
${DEPLOY_USER} soft nofile 65535
${DEPLOY_USER} hard nofile 65535
LIMITS

    say "firewall"
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
    ufw status verbose

    say "done"
    cat <<SUMMARY

Next steps:
  1. In a second terminal:  ssh ${DEPLOY_USER}@<ip>
     (password login for ${DEPLOY_USER} is disabled by design, so use the key)
  2. When the key login works, disable password logins:
         bash provision.sh --harden-ssh
  3. Reboot once to confirm swap and services come back:
         reboot
SUMMARY
}

main
