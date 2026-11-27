import {readFileSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const b=readFileSync('tmp/v4-worker/worker.mjs');
const sha=createHash('sha256').update(b).digest('hex');
const expected='ed94906c3f359f06e76a419b9447416259dd19b763a8b8d61757c65e1b2fe900';
const encoded=gzipSync(b).toString('base64').match(/.{1,100}/g).join('\n');
const lines=[
"sudo bash -s <<'AIGF_V4_LEDGER_UPGRADE'",
"set -euo pipefail",
"umask 077",
"test \"$(id -u)\" -eq 0",
"systemctl is-active --quiet aigf-generation-v4.service",
"test -s /opt/aigf-v4/supabase-ca.crt",
"test -s /etc/aigf-v4/database-url && test -s /etc/aigf-v4/queue-token",
"cd /opt/aigf-v4",
"CURRENT=$(sha256sum worker.mjs | cut -d' ' -f1)",
"if [ \"$CURRENT\" = '"+sha+"' ]; then echo AIGF_V4_LEDGER_ALREADY_INSTALLED; exit 0; fi",
"if [ \"$CURRENT\" != '"+expected+"' ]; then echo V4_EXISTING_WORKER_SHA_MISMATCH; exit 1; fi",
"TEMP=$(mktemp /opt/aigf-v4/.upgrade-XXXXXX.mjs)",
"BACKUP=worker.pre-ledger-"+expected.slice(0,12)+".mjs",
"CHANGED=0",
"cleanup(){ rc=$?; trap - EXIT; if [ \"$CHANGED\" = 1 ] && [ \"$rc\" != 0 ]; then cp -p -- \"$BACKUP\" worker.mjs; systemctl restart aigf-generation-v4.service; echo AIGF_V4_LEDGER_ROLLED_BACK; fi; rm -f -- \"$TEMP\"; exit \"$rc\"; }",
"trap cleanup EXIT",
"base64 -d <<'V4_LEDGER_BUNDLE' | gzip -d > \"$TEMP\"",
encoded,
"V4_LEDGER_BUNDLE",
"printf '%s  %s\\n' '"+sha+"' \"$TEMP\" | sha256sum -c --status",
"chmod 0644 \"$TEMP\"",
"systemd-run --wait --collect --pipe --property=User=aigf-v4 --property=Group=aigf-v4 --property=WorkingDirectory=/opt/aigf-v4 --property=LoadCredential=database-url:/etc/aigf-v4/database-url --property=LoadCredential=queue-token:/etc/aigf-v4/queue-token --setenv=NODE_EXTRA_CA_CERTS=/opt/aigf-v4/supabase-ca.crt /usr/bin/node \"$TEMP\" --check",
"test ! -e \"$BACKUP\" || { printf '%s  %s\\n' '"+expected+"' \"$BACKUP\" | sha256sum -c --status; }",
"cp -p -- worker.mjs \"$BACKUP\"",
"CHANGED=1",
"mv -- \"$TEMP\" worker.mjs",
"SINCE=$(date -u '+%Y-%m-%d %H:%M:%S UTC')",
"systemctl restart aigf-generation-v4.service",
"for i in $(seq 1 20); do",
" if systemctl is-active --quiet aigf-generation-v4.service && journalctl -u aigf-generation-v4.service --since \"$SINCE\" --no-pager -o cat | grep -F 'V4_WORKER_READY' >/dev/null; then",
"  printf '%s  %s\\n' '"+sha+"' worker.mjs | sha256sum -c --status",
"  CHANGED=0; echo AIGF_V4_LEDGER_WORKER_UPGRADE_PASS; exit 0",
" fi; sleep 1",
"done",
"echo V4_LEDGER_WORKER_READINESS_FAILED; exit 1",
"AIGF_V4_LEDGER_UPGRADE"
];
const out=lines.join('\n')+'\n';
writeFileSync('tmp/v4-worker/UPGRADE_V4_LEDGER_OWNER.sh',out,{encoding:'utf8'});
console.log('OWNER_LEDGER_UPGRADE_READY bytes='+Buffer.byteLength(out)+' sha256='+createHash('sha256').update(out).digest('hex'));
