import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const syncSource = readFileSync(new URL('../supabaseCloudSync.ts', import.meta.url), 'utf8');
const migration = readFileSync(
    new URL('../supabase/migrations/20261005000000_wetapp_research_capture.sql', import.meta.url),
    'utf8',
);

test('research uploader sends compact metadata for every completed turn and optional sampled content only', () => {
    const start = syncSource.indexOf('private async pushPendingResearchTurns');
    const end = syncSource.indexOf('private schedulePull', start);
    const source = syncSource.slice(start, end);

    assert.match(source, /buildResearchCloudProjection\(record\)/);
    assert.match(source, /metadata: projection\.metadata/);
    assert.match(source, /sample_payload: projection\.samplePayload \|\| null/);
    assert.doesNotMatch(source, /payload:\s*record/);
});

test('research cloud archive is bounded and does not depend on Realtime subscriptions', () => {
    assert.match(syncSource, /RESEARCH_CLOUD_RETENTION_MS = 90 \* 24 \* 60 \* 60 \* 1000/);
    assert.match(syncSource, /\.from\('wetapp_research_turns'\)[\s\S]*\.delete\(\)[\s\S]*\.lt\('created_at_ms', cutoff\)/);

    const realtimeStart = syncSource.indexOf('private async startRealtime()');
    const realtimeEnd = syncSource.indexOf('private async stopRealtime', realtimeStart);
    const realtimeSource = syncSource.slice(realtimeStart, realtimeEnd);
    assert.doesNotMatch(realtimeSource, /postgres_changes/);
});

test('research migration stores metadata separately from nullable sampled content', () => {
    assert.match(migration, /metadata jsonb not null/);
    assert.match(migration, /sample_payload jsonb/);
    assert.doesNotMatch(migration, /payload jsonb not null/);
    assert.match(migration, /not added to Supabase Realtime publications/);
});


test('missing research table disables further research cloud retries for the current app session', () => {
    assert.match(syncSource, /private researchCloudUnavailable = false;/);
    assert.match(syncSource, /if \(!sessionUserId \|\| this\.researchCloudUnavailable\) return;/);
    assert.match(syncSource, /isMissingResearchTableError\(error\)/);
    assert.match(syncSource, /this\.researchCloudUnavailable = true;/);
    assert.match(syncSource, /keeping research records local until the next app session/);
});
