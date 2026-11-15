import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readAssistantZipArchive, type ZipLibrary } from '../assistantZip.js';

const encoder = new TextEncoder();
class MemoryArchive {
  static contents: string = '';
  files: Record<string, {
    name:string;dir:boolean;unsafeOriginalName:string;
    _data:{uncompressedSize:number};
    async:(type:'uint8array')=>Promise<Uint8Array>;
  }> = {};
  static async loadAsync() {
    const archive=new MemoryArchive();
    const body=encoder.encode(MemoryArchive.contents);
    archive.files['data/luna-save.json']={
      name:'data/luna-save.json', dir:false, unsafeOriginalName:'data/luna-save.json',
      _data:{uncompressedSize:body.byteLength},
      async:async()=>body,
    };
    return archive;
  }
}
const zipFile=Object.assign(new Blob(['fake'],{type:'application/zip'}),{name:'Luna_SAVE.zip'});
const provider=MemoryArchive as unknown as ZipLibrary;
const deepseek='deepseek-v4-1-flash-1017-uncensored';

test('ZIP can deliver entire >350 KB Luna JSON without 65,000 char rejection for DeepSeek', async()=>{
  const original={scriptId:'luna',chat:Array.from({length:8000},(_,i)=>({id:i,text:'這是保存的角色劇情。',mood:i%4}))};
  MemoryArchive.contents=JSON.stringify(original,null,2);
  assert.ok(MemoryArchive.contents.length>350_000);
  const inspection=await readAssistantZipArchive(zipFile,provider,deepseek);
  assert.equal(inspection.longContext,true);
  assert.equal(inspection.textFileCount,1);
  assert.deepEqual(JSON.parse(JSON.stringify(JSON.parse(MemoryArchive.contents))),original);
  assert.ok(inspection.context.includes(JSON.stringify(original)));
  assert.ok(inspection.fileNames.includes('data/luna-save.json'));
});

test('ZIP still has a conservative limit for models without 1M context',async()=>{
  await assert.rejects(
    ()=>readAssistantZipArchive(zipFile,provider,'venice-uncensored-1-2'),
    /文字檔過大/,
  );
});

test('Venice ZIP follow-ups rehydrate the archive; JSON patches can target its contained file',()=>{
  const app=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
  assert.match(app,/readAssistantZipArchive\(\s+new File\(\[blob\], source.name/);
  assert.match(app,/new File\(\[zipBlob\], attachment.name/);
  assert.match(app,/archive\.file\(patchExport\.sourceFile\)/);
  assert.match(app,/patchAssistantJsonSave\(originalRaw, patchExport\)/);
});
