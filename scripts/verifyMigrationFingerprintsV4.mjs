// Compare two read-only aggregate database manifests; never read message bodies.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const required=['conversations','media','messages','research_turns','state'];
export function verifyMigrationFingerprints(source,target){
 const normalize=input=>{
  const rows=Array.isArray(input)?input:input?.relations;
  if(!Array.isArray(rows)||rows.length!==required.length)throw Error('INVALID_MANIFEST');
  const map=new Map();
  for(const r of rows){
   if(!required.includes(r.relation)||map.has(r.relation)||!Number.isSafeInteger(Number(r.rows))||Number(r.rows)<0||!/^([0-9a-f]{64})$/.test(r.sha256))throw Error('INVALID_MANIFEST_ROW');
   map.set(r.relation,{rows:Number(r.rows),sha256:r.sha256});
  }
  return map;
 };
 const a=normalize(source),b=normalize(target);
 return required.map(relation=>({relation,sourceRows:a.get(relation).rows,targetRows:b.get(relation).rows,match:a.get(relation).rows===b.get(relation).rows&&a.get(relation).sha256===b.get(relation).sha256}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==4){console.error('Usage: node scripts/verifyMigrationFingerprintsV4.mjs source.json target.json');process.exitCode=2;}
 else{try{const result=verifyMigrationFingerprints(...process.argv.slice(2).map(f=>JSON.parse(readFileSync(f,'utf8'))));console.log(JSON.stringify(result,null,2));if(result.some(r=>!r.match))process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=2;}}
}
