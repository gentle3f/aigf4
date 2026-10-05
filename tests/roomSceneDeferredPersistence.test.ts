import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
const roomManagerSource = readFileSync(new URL('../roomManager.ts', import.meta.url), 'utf8');

test('accepted Group replies use the deferred scene checkpoint, not synchronous updateRoom persistence', () => {
    const start = indexSource.indexOf("if (typeof generated !== 'string' && request.room)");
    const end = indexSource.indexOf("markChatPerformance('response:group-scene-persist'", start);
    assert.ok(start >= 0 && end > start);
    const source = indexSource.slice(start, end);

    assert.match(source, /roomManager\.updateRoomSceneDeferred\(\s*request\.room\.id,\s*generated\.scene,/);
    assert.doesNotMatch(source, /roomManager\.updateRoom\(/);
});

test('RoomManager deferred scene persistence coalesces while normal updateRoom remains synchronous', () => {
    assert.match(roomManagerSource, /updateRoomSceneDeferred\([\s\S]*this\.scheduleDeferredPersist\(\)/);
    assert.match(roomManagerSource, /updateRoom\([\s\S]*try \{\s*this\.persist\(\);/);
    assert.match(roomManagerSource, /flushDeferredPersistence\(\)/);
});

test('page hide, hidden visibility and beforeunload flush pending room durability', () => {
    assert.match(indexSource, /window\.addEventListener\('pagehide', flushPendingRoomPersistence\)/);
    assert.match(indexSource, /document\.addEventListener\('visibilitychange',[\s\S]*document\.visibilityState === 'hidden'[\s\S]*flushPendingRoomPersistence\(\)/);
    assert.match(indexSource, /window\.addEventListener\('beforeunload',[\s\S]*flushPendingRoomPersistence\(\)/);
});

test('browser room durability waits through two animation frames before flushing', () => {
    assert.match(
        roomManagerSource,
        /window\.requestAnimationFrame\(\(\) => \{[\s\S]*window\.requestAnimationFrame\(\(\) => \{[\s\S]*this\.flushDeferredPersistence\(\)/,
    );
});


test('room recovery is restored before the initial room list renders', () => {
    const initStart = indexSource.indexOf('const init = async () => {');
    const restoreIndex = indexSource.indexOf('await roomManager.restoreRoomRecovery();', initStart);
    const renderIndex = indexSource.indexOf('renderPersonaList();', initStart);

    assert.ok(initStart >= 0);
    assert.ok(restoreIndex > initStart);
    assert.ok(renderIndex > restoreIndex);
});

test('failed deferred room persistence saves a recovery snapshot and surfaces backup success', () => {
    assert.match(
        roomManagerSource,
        /catch \(error\) \{[\s\S]*this\.deferredPersistPending = true;[\s\S]*this\.saveDeferredRoomRecovery\(\);[\s\S]*wetapp-storage-failed/,
    );
    assert.match(
        roomManagerSource,
        /saveRoomRecovery\(\{ baseline, data \}\)[\s\S]*wetapp-room-storage-recovered/,
    );
    assert.match(
        indexSource,
        /window\.addEventListener\('wetapp-room-storage-recovered',[\s\S]*群組場景已寫入本機備援儲存/,
    );
});
