import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const parts=[
 ['tmp/v4-worker/worker.mjs','/opt/aigf-v4-production/worker.mjs'],
 ['server/v4-runtime/package.json','/opt/aigf-v4-production/package.json'],
 ['server/v4-runtime/package-lock.json','/opt/aigf-v4-production/package-lock.json'],
 ['server/provisionV4ProductionRole.mjs','/opt/aigf-v4-production/provisionV4ProductionRole.mjs'],
 ['server/aigf-generation-v4-production.service','/etc/systemd/system/aigf-generation-v4-production.service']
];
const lines=[
"sudo bash -s <<'AIGF_V4_PRODUCTION_RESUME'",
"set -euo pipefail",
"umask 077",
"echo 'Resume staged production worker installation (no frontend activation)'",
"if systemctl is-active --quiet aigf-generation-v4-production.service; then echo PRODUCTION_WORKER_ALREADY_ACTIVE; exit 1; fi",
"if test -e /etc/aigf-v4-production/database-url || test -L /etc/aigf-v4-production/database-url; then echo PRODUCTION_CREDENTIAL_EXISTS_STOP; exit 1; fi",
"test -d /opt/aigf-v4-production && test -d /etc/aigf-v4-production",
"test ! -L /opt/aigf-v4-production && test ! -L /etc/aigf-v4-production",
"test \"$(stat -c %u /opt/aigf-v4-production)\" = 0 && test \"$(stat -c %u /etc/aigf-v4-production)\" = 0",
"getent passwd aigf-v4-production >/dev/null && getent group aigf-v4-production >/dev/null",
"test \"$(getent passwd aigf-v4-production | cut -d: -f7)\" = /usr/sbin/nologin",
"test -s /opt/aigf-v4/supabase-ca.crt && test -s /var/lib/aigf-generation-v1/gateway_token",
"systemctl is-active --quiet aigf-generation-v1.service",
...parts.flatMap(([src,dst])=>["test -f '"+dst+"' && test ! -L '"+dst+"' || { echo PRODUCTION_STAGED_FILE_MISSING; exit 1; }","printf '%s  %s\\n' '"+createHash('sha256').update(readFileSync(src)).digest('hex')+"' '"+dst+"' | sha256sum -c --status || { echo PRODUCTION_STAGED_FILE_HASH_MISMATCH; exit 1; }"]),
"echo PRODUCTION_STAGED_FILES_VERIFIED",
"IFS= read -r -s -p 'Correct production admin URI: ' ADMIN_URL </dev/tty",
"echo",
"test -n \"$ADMIN_URL\"",
"chmod 0644 /opt/aigf-v4-production/worker.mjs /opt/aigf-v4-production/package.json /opt/aigf-v4-production/package-lock.json /etc/systemd/system/aigf-generation-v4-production.service",
"install -m 0644 -o root -g root /opt/aigf-v4/supabase-ca.crt /opt/aigf-v4-production/supabase-ca.crt",
"cd /opt/aigf-v4-production",
"(umask 022; npm ci --omit=dev --ignore-scripts --no-audit --no-fund)",
"printf '%s' \"$ADMIN_URL\" | NODE_EXTRA_CA_CERTS=/opt/aigf-v4-production/supabase-ca.crt /usr/bin/node /opt/aigf-v4-production/provisionV4ProductionRole.mjs",
"unset ADMIN_URL",
"install -m 0600 -o root -g root /var/lib/aigf-generation-v1/gateway_token /etc/aigf-v4-production/queue-token",
"systemd-run --wait --collect --pipe --property=User=aigf-v4-production --property=Group=aigf-v4-production --property=WorkingDirectory=/opt/aigf-v4-production --setenv=AIGF_V4_TARGET=production --setenv=NODE_EXTRA_CA_CERTS=/opt/aigf-v4-production/supabase-ca.crt --property=LoadCredential=database-url:/etc/aigf-v4-production/database-url --property=LoadCredential=queue-token:/etc/aigf-v4-production/queue-token /usr/bin/node /opt/aigf-v4-production/worker.mjs --check",
"systemctl daemon-reload",
"systemctl enable --now aigf-generation-v4-production.service",
"for i in $(seq 1 20); do if systemctl is-active --quiet aigf-generation-v4-production.service && journalctl -u aigf-generation-v4-production.service -n 20 --no-pager -o cat | grep -F 'V4_WORKER_READY' >/dev/null; then echo AIGF_V4_PRODUCTION_WORKER_INSTALL_PASS; exit 0; fi; sleep 1; done",
"echo V4_WORKER_READINESS_FAILED; exit 1",
"AIGF_V4_PRODUCTION_RESUME"
];
const output=lines.join('\n')+'\n';writeFileSync('tmp/v4-worker/RESUME_V4_PRODUCTION_OWNER.sh',output);console.log('RESUME_READY bytes='+Buffer.byteLength(output)+' sha256='+createHash('sha256').update(output).digest('hex'));
