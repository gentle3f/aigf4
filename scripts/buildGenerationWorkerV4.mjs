import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,cp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const output='tmp/v4-worker/worker.mjs';
const result=await build({entryPoints:['server/runGenerationOutboxV4.mjs'],bundle:true,platform:'node',format:'esm',target:'node22',external:['pg','opencc-js'],metafile:true,outfile:output,logLevel:'silent'});
// Verify all runtime imports against the actual VPS package manifest.
const manifest=JSON.parse(await readFile('server/v4-runtime/package.json','utf8'));
const builtins=new Set((await import('node:module')).builtinModules.flatMap(n=>[n,'node:'+n]));
const externals=[...new Set(Object.values(result.metafile.outputs).flatMap(o=>o.imports.filter(i=>i.external).map(i=>i.path)))].sort();
for(const name of externals){
 if(builtins.has(name))continue;
 const pkg=name.startsWith('@')?name.split('/').slice(0,2).join('/'):name.split('/')[0];
 assert.ok(Object.hasOwn(manifest.dependencies,pkg),'V4_UNDECLARED_RUNTIME_DEPENDENCY '+name);
}
console.log('V4_RUNTIME_IMPORTS_PASS '+JSON.stringify(externals));
// Test in a clean directory outside the application dependency tree.
const dir=await mkdtemp(join(tmpdir(),'aigf-v4-runtime-'));
try{
 const lock=JSON.parse(await readFile('server/v4-runtime/package-lock.json','utf8'));
 for(const [key,pkg] of Object.entries(lock.packages)){
  if(!key)continue;
  const original=resolve(key);
  const installed=JSON.parse(await readFile(join(original,'package.json'),'utf8'));
  assert.equal(installed.version,pkg.version,'V4_RUNTIME_VERSION_MISMATCH '+key);
  const target=join(dir,key);
  await mkdir(dirname(target),{recursive:true});
  await cp(original,target,{recursive:true});
 }
 const isolated=join(dir,'worker.mjs');
 await cp(output,isolated);
 const m=await import(pathToFileURL(isolated).href);
 assert.equal(typeof m.runWorkerLoop,'function');
 assert.equal(await m.runWorkerLoop({once:true,processOne:async()=> 'idle',log:()=>{}}),'idle');
 console.log('V4_ISOLATED_RUNTIME_IMPORT_PASS');
}finally{await rm(dir,{recursive:true,force:true});}
const bytes=await readFile(output);
console.log('V4_WORKER_BUNDLE_PASS bytes='+bytes.length+' sha256='+createHash('sha256').update(bytes).digest('hex'));
