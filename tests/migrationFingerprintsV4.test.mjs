import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyMigrationFingerprints} from '../scripts/verifyMigrationFingerprintsV4.mjs';
const rows=['conversations','media','messages','research_turns','state'].map((relation,i)=>({relation,rows:i+1,sha256:String(i+1).repeat(64)}));
test('equal aggregate counts and hashes in any order',()=>assert.ok(verifyMigrationFingerprints({relations:rows},[...rows].reverse()).every(r=>r.match)));
test('equal count does not conceal changed message hash',()=>{const target=structuredClone(rows);target[2].sha256='a'.repeat(64);assert.deepEqual(verifyMigrationFingerprints(rows,target).filter(r=>!r.match).map(r=>r.relation),['messages']);});
test('missing or duplicate table refuses manifest',()=>{assert.throws(()=>verifyMigrationFingerprints(rows,rows.slice(1)),/INVALID_MANIFEST/);assert.throws(()=>verifyMigrationFingerprints(rows,[...rows.slice(1),rows[1]]),/INVALID_MANIFEST_ROW/);});
