import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Supabase cloud sync manager is lazy loaded behind auth or explicit Live Cloud access', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/supabaseCloudSync\.js['"]\)/);
    assert.doesNotMatch(indexSource, /import \{ SupabaseCloudSyncManager \} from/);
    assert.match(indexSource, /const loadSupabaseCloudSyncManager = async/);
    assert.match(indexSource, /const startSupabaseCloudSync = async/);
    assert.match(indexSource, /await manager\.start\(\)/);
    assert.match(indexSource, /if \(unlocked\) \{\s*await startSupabaseCloudSync\(\)/);
});

test('Live Cloud UI shares the same lazy singleton manager instead of constructing its own client', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/liveCloudUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /Promise\.all\(\[\s*import\(['"]\.\/features\/liveCloudUi\.js['"]\),\s*loadSupabaseCloudSyncManager\(\)/);
    assert.match(indexSource, /createLiveCloudUi\(manager\)/);
    assert.doesNotMatch(featureSource, /new SupabaseCloudSyncManager|createClient\(/);
});
