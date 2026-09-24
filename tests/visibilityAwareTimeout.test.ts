import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    createVisibilityAwareTimeout,
    type VisibilityAwareTimeoutEnvironment,
} from '../visibilityAwareTimeout.js';

type FakeTimer = { id: number; at: number; callback: () => void };

const createFakeEnvironment = () => {
    let now = 0;
    let visible = true;
    let nextId = 1;
    const timers: FakeTimer[] = [];
    const listeners = new Set<() => void>();
    const environment: VisibilityAwareTimeoutEnvironment = {
        now: () => now,
        isVisible: () => visible,
        setTimeout: (callback, delayMs) => {
            const timer = { id: nextId++, at: now + delayMs, callback };
            timers.push(timer);
            return timer.id;
        },
        clearTimeout: handle => {
            const index = timers.findIndex(timer => timer.id === handle);
            if (index >= 0) timers.splice(index, 1);
        },
        addVisibilityChangeListener: listener => listeners.add(listener),
        removeVisibilityChangeListener: listener => listeners.delete(listener),
    };
    return {
        environment,
        advance: (ms: number) => {
            const target = now + ms;
            while (true) {
                const due = timers
                    .filter(timer => timer.at <= target)
                    .sort((a, b) => a.at - b.at)[0];
                if (!due) break;
                timers.splice(timers.indexOf(due), 1);
                now = due.at;
                due.callback();
            }
            now = target;
        },
        setVisible: (nextVisible: boolean) => {
            visible = nextVisible;
            for (const listener of listeners) listener();
        },
        activeTimerCount: () => timers.length,
    };
};

test('uses the ordinary full budget while visible', () => {
    const fake = createFakeEnvironment();
    let timedOut = 0;
    createVisibilityAwareTimeout({ timeoutMs: 45_000, onTimeout: () => { timedOut += 1; }, environment: fake.environment });
    fake.advance(44_999);
    assert.equal(timedOut, 0);
    fake.advance(1);
    assert.equal(timedOut, 1);
});

test('does not count hidden time against the visible timeout budget', () => {
    const fake = createFakeEnvironment();
    let timedOut = 0;
    createVisibilityAwareTimeout({ timeoutMs: 45_000, onTimeout: () => { timedOut += 1; }, environment: fake.environment });
    fake.advance(10_000);
    fake.setVisible(false);
    fake.advance(120_000);
    assert.equal(timedOut, 0);
    fake.setVisible(true);
    fake.advance(34_999);
    assert.equal(timedOut, 0);
    fake.advance(1);
    assert.equal(timedOut, 1);
});

test('preserves remaining visible time through repeated background cycles', () => {
    const fake = createFakeEnvironment();
    let timedOut = 0;
    createVisibilityAwareTimeout({ timeoutMs: 100, onTimeout: () => { timedOut += 1; }, environment: fake.environment });
    fake.advance(20);
    fake.setVisible(false);
    fake.advance(500);
    fake.setVisible(true);
    fake.advance(30);
    fake.setVisible(false);
    fake.advance(500);
    fake.setVisible(true);
    fake.advance(49);
    assert.equal(timedOut, 0);
    fake.advance(1);
    assert.equal(timedOut, 1);
});

test('propagates an upstream abort immediately while hidden', () => {
    const fake = createFakeEnvironment();
    const controller = new AbortController();
    let aborted = 0;
    createVisibilityAwareTimeout({
        timeoutMs: 45_000,
        onTimeout: () => assert.fail('should not time out'),
        signal: controller.signal,
        onAbort: () => { aborted += 1; },
        environment: fake.environment,
    });
    fake.setVisible(false);
    controller.abort();
    assert.equal(aborted, 1);
    assert.equal(fake.activeTimerCount(), 0);
});

test('cancels scheduled work when the provider settles while hidden', () => {
    const fake = createFakeEnvironment();
    let timedOut = 0;
    const timeout = createVisibilityAwareTimeout({ timeoutMs: 100, onTimeout: () => { timedOut += 1; }, environment: fake.environment });
    fake.setVisible(false);
    timeout.cancel();
    fake.setVisible(true);
    fake.advance(1_000);
    assert.equal(timedOut, 0);
    assert.equal(fake.activeTimerCount(), 0);
});

test('chat transport applies visibility timing only to requests with an upstream signal', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    assert.match(source, /const visibilityTimeout = upstreamSignal\s*\? createVisibilityAwareTimeout\(/u);
    assert.match(source, /const timeoutId = visibilityTimeout\s*\? null\s*:\s*window\.setTimeout\(abortForTimeout, timeoutMs\)/u);
});
