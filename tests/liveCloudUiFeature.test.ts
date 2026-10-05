import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Live Cloud modal is lazy loaded without startup import', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/liveCloudUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/liveCloudUi\.js['"]\)/);
    assert.match(indexSource, /onStateChange:\s*state\s*=>\s*liveCloudUi\?\.renderState\(state\)/);
    assert.doesNotMatch(indexSource, /const supabaseCloudModal|renderSupabaseCloudState|signInSupabaseCloudWithPassword|sendSupabaseMagicLink/);
    assert.match(featureSource, /export const createLiveCloudUi/);
    assert.match(featureSource, /supabaseCloudSyncManager\.getOwnerEmail\(\)/);
    assert.match(featureSource, /renderSupabaseCloudState\(supabaseCloudSyncManager\.getState\(\)\)/);
});

test('Live Cloud cold feature owns modal controls but not sync startup or chat behaviour', () => {
    const featureSource = readFileSync(new URL('../features/liveCloudUi.ts', import.meta.url), 'utf8');

    assert.match(featureSource, /signInWithPassword/);
    assert.match(featureSource, /sendMagicLink/);
    assert.match(featureSource, /syncNow\(\)/);
    assert.match(featureSource, /reloadFromCloud\(\)/);
    assert.match(featureSource, /const signOutSupabaseCloud = async \(\) => \{/);
    assert.match(featureSource, /await supabaseCloudSyncManager\.signOut\(\)/);
    assert.match(featureSource, /supabaseCloudError\.textContent = error instanceof Error \? error\.message : '登出失敗。'/);
    assert.match(featureSource, /supabaseCloudSignOut\.addEventListener\('click', \(\) => void signOutSupabaseCloud\(\)\)/);
    assert.doesNotMatch(featureSource, /new SupabaseCloudSyncManager|supabaseCloudSyncManager\.start\(|startChat|memoryManager|RoomManager|strictReview|Jev|wardrobe/i);
});
