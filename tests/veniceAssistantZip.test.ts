import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  ASSISTANT_ZIP_MAX_UNCOMPRESSED_BYTES,
  readAssistantZipArchive,
  extractAssistantZipExport,
  buildAssistantZipDownload,
  isAssistantZipFile,
  isSafeArchivePath,
  type ZipLibrary,
} from '../assistantZip.js';

const enc = new TextEncoder();
type FakeEntry = {
  name: string;
  dir: boolean;
  unsafeOriginalName?: string;
  unixPermissions?: string;
  _data?: { uncompressedSize?: number };
  async: (name: 'uint8array') => Promise<Uint8Array>;
};
const makeEntry = (name: string, content: string, overrides: Partial<FakeEntry> = {}): FakeEntry => {
  const bytes = enc.encode(content);
  return {
    name, dir: false, unsafeOriginalName: name,
    _data: { uncompressedSize: bytes.length },
    async: async () => bytes,
    ...overrides,
  };
};
class FakeZip {
  static fixture: FakeZip;
  files: Record<string, FakeEntry> = {};
  file(name: string, content: string) {
    this.files[name] = makeEntry(name, content);
  }
  async generateAsync() {
    return new Blob([JSON.stringify(Object.keys(this.files).sort())], {type:'application/zip'});
  }
  static async loadAsync() {
    return this.fixture;
  }
}
const provider = FakeZip as unknown as ZipLibrary;
const archiveInput = Object.assign(new Blob(['abc'], {type:'application/zip'}), {name:'Luna_Kit.zip'});
const useArchive = async (entries: FakeEntry[]) => {
  const archive = new FakeZip();
  for(const entry of entries) archive.files[entry.name] = entry;
  FakeZip.fixture = archive;
  return readAssistantZipArchive(archiveInput, provider);
};

test('ZIP upload reads only approved UTF-8 text, lists uninspected binaries', async () => {
  const result = await useArchive([
    makeEntry('script/main.json','{"name":"沈照塵"}'),
    makeEntry('docs/guide.md','# 製作指引'),
    makeEntry('assets/portrait.webp','not real image'),
  ]);
  assert.equal(result.fileNames.length, 3);
  assert.equal(result.textFileCount, 2);
  assert.equal(result.ignoredFileCount, 1);
  assert.match(result.context, /script\/main.json/);
  assert.match(result.context, /沈照塵/);
  assert.match(result.context, /assets\/portrait.webp \(只列檔名\)/);
  assert.equal(result.context.includes('not real image'), false);
  assert.equal(isAssistantZipFile('project.ZIP'), true);
});

test('ZIP input rejects path traversal, absolute paths, Windows drives and duplicate normalized paths', async () => {
  for(const input of ['../private.json','/absolute.txt','C:\\\\temp\\\\file.json','x/../file.txt','x//bad.json']) {
    assert.equal(isSafeArchivePath(input), false);
  }
  await assert.rejects(() => useArchive([
    makeEntry('readme.json','{}',{unsafeOriginalName:'../readme.json'}),
  ]), /不安全路徑/);
  await assert.rejects(() => useArchive([
    makeEntry('READMe.json','{}'),makeEntry('readme.json','{}'),
  ]), /重複檔案/);
});

test('ZIP rejects suspicious decompression sizes before reading content', async () => {
  let decompressed = false;
  const huge = makeEntry('bomb.json','{}', {
    _data:{uncompressedSize:ASSISTANT_ZIP_MAX_UNCOMPRESSED_BYTES+1},
    async: async () => {decompressed=true;return enc.encode('{}');},
  });
  await assert.rejects(() => useArchive([huge]), /解壓總大小/);
  assert.equal(decompressed,false);
  await assert.rejects(() => useArchive([
    makeEntry('bad.json','',{_data:{uncompressedSize:undefined}}),
  ]), /可靠的檔案大小/);
});

test('ZIP rejects invalid UTF-8 and excessive text token budget', async () => {
  const bad = makeEntry('bad.json','', {
    _data:{uncompressedSize:2},
    async: async () => new Uint8Array([0xc3,0x28]),
  });
  await assert.rejects(() => useArchive([bad]), /有效 UTF-8/);
  await assert.rejects(() => useArchive([
    makeEntry('one.md','A'.repeat(60_000)),
    makeEntry('two.md','B'.repeat(60_000)),
  ]), /95,000 字元/);
});

test('ZIP output manifest accepts valid multiple files and rejects unsafe paths', () => {
  const data = {
    format:'wetapp-zip-v1',filename:'Luna 新劇本.zip',sourceArchive:'Luna_Kit.zip',
    files:[{path:'script/story.json',content:'{"title":"故事"}'}, {path:'worldbook/book.json',content:'{"entries":[]}'}],
  };
  const text = '\x60\x60\x60json\n'+JSON.stringify(data)+'\n\x60\x60\x60';
  const parsed = extractAssistantZipExport(text);
  assert.deepEqual(parsed,data);
  assert.equal(extractAssistantZipExport(JSON.stringify({...data,files:[{path:'../evil.json',content:'{}'}]})),null);
  assert.equal(extractAssistantZipExport(JSON.stringify({...data,sourceArchive:'../bad.zip'})),null);
  assert.equal(extractAssistantZipExport(JSON.stringify({...data,files:[{path:'file.exe',content:'binary'}]})),null);
  assert.equal(extractAssistantZipExport('normal reply'),null);
});

test('ZIP export patches original ZIP and retains its unchanged images', async () => {
  const result = await useArchive([
    makeEntry('script/story.json','old'),
    makeEntry('assets/portrait.webp','BINARY_PRESERVED'),
  ]);
  assert.equal(result.fileNames.length,2);
  const manifest = extractAssistantZipExport(JSON.stringify({
    format:'wetapp-zip-v1',filename:'updated.zip',sourceArchive:'Luna_Kit.zip',
    files:[{path:'script/story.json',content:'{"new":1}'}],
  }));
  assert.ok(manifest);
  const output = await buildAssistantZipDownload(manifest, archiveInput, provider);
  assert.equal(output.filename,'updated.zip');
  const names = JSON.parse(await output.blob.text()) as string[];
  assert.deepEqual(names,['assets/portrait.webp','script/story.json']);
  assert.deepEqual(await FakeZip.fixture.files['script/story.json'].async('uint8array'),enc.encode('{"new":1}'));
  await assert.rejects(() => buildAssistantZipDownload(manifest,null,provider),/搵唔到來源 ZIP/);
});

test('ZIP archive handling is isolated from non-assistant conversations',()=>{
  const app=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(app,/ZIP 讀取功能只限 Venice AI 助手/);
  assert.match(app,/assistantZipInspections\.set/);
  assert.match(app,/assistantFileContext: assistantMode \? attachmentBundle\.assistantFileContext/);
  assert.match(app,/extractAssistantZipExport\(text\)/);
  assert.match(app,/buildAssistantZipDownload\(archiveExport, sourceBlob\)/);
  assert.match(html,/\.zip,/);
});
