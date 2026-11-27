import {readFileSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const parts=[
 ['tmp/v4-worker/worker.mjs','/opt/aigf-v4-production/worker.mjs'],
 ['server/v4-runtime/package.json','/opt/aigf-v4-production/package.json'],
 ['server/v4-runtime/package-lock.json','/opt/aigf-v4-production/package-lock.json'],
 ['server/provisionV4ProductionRole.mjs','/opt/aigf-v4-production/provisionV4ProductionRole.mjs'],
 ['server/aigf-generation-v4-production.service','/etc/systemd/system/aigf-generation-v4-production.service']
];
const payload=parts.map(([source,target],i)=>{
 const b=readFileSync(source),sha=createHash('sha256').update(b).digest('hex');
 return "base64 -d <<'V4_PART_"+i+"' | gzip -d > '"+target+"'\n"+gzipSync(b).toString('base64').match(/.{1,100}/g).join('\n')+"\nV4_PART_"+i+"\nprintf '%s  %s\\n' '"+sha+"' '"+target+"' | sha256sum -c --status\n";
}).join('\n');
const start=[
"sudo bash -s <<'AIGF_V4_PRODUCTION_OWNER_INSTALL'",
"set -euo pipefail",
"umask 077",
"echo 'AIGF V4 PRODUCTION: staged database, separate worker; no frontend activation'",
"test \"$(id -u)\" -eq 0",
"test -x /usr/bin/node && command -v npm >/dev/null || { echo NODE_22_AND_NPM_REQUIRED; exit 1; }",
"/usr/bin/node -e 'if(Number(process.versions.node.split(\".\")[0])<22)process.exit(1)'",
"systemctl is-active --quiet aigf-generation-v1.service",
"test -s /var/lib/aigf-generation-v1/gateway_token",
"test -s /opt/aigf-v4/supabase-ca.crt",
"for path in /opt/aigf-v4-production /etc/aigf-v4-production /etc/systemd/system/aigf-generation-v4-production.service; do test ! -e \"$path\" || { echo V4_INSTALL_EXISTS_STOP; exit 1; }; done",
"if getent passwd aigf-v4-production >/dev/null; then echo V4_ACCOUNT_EXISTS_STOP; exit 1; fi",
"echo 'Paste the PRODUCTION Supabase PostgreSQL session-pooler admin URI (ebinyocojscfnxskybax). Input hidden.'",
"IFS= read -r -s -p 'Production admin URI: ' ADMIN_URL </dev/tty",
"echo",
"test -n \"$ADMIN_URL\"",
"useradd --system --user-group --no-create-home --shell /usr/sbin/nologin aigf-v4-production",
"install -d -m 0755 /opt/aigf-v4-production",
"install -d -m 0700 /etc/aigf-v4-production",
].join('\n');
const end=[
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
"AIGF_V4_PRODUCTION_OWNER_INSTALL",
].join('\n');
const output=start+'\n'+payload+'\n'+end+'\n';
writeFileSync('tmp/v4-worker/INSTALL_V4_PRODUCTION_OWNER.sh',output,{encoding:'utf8'});
console.log('PRODUCTION_OWNER_INSTALLER_READY bytes='+Buffer.byteLength(output)+' sha256='+createHash('sha256').update(output).digest('hex'));
