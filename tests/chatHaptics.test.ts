import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { notifyReplyVisible, scheduleReplyVisibleHaptic } from '../chatHaptics.js';

const withNavigator = (value: Navigator | undefined, callback: () => void) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value });
    try {
        callback();
    } finally {
        if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
        else Reflect.deleteProperty(globalThis, 'navigator');
    }
};

test('reply-visible haptic calls supported navigator.vibrate once for 35ms', () => {
    const calls: number[] = [];
    withNavigator({ vibrate: (duration: number) => { calls.push(duration); return true; } } as Navigator, () => {
        notifyReplyVisible();
    });
    assert.deepEqual(calls, [35]);
});

test('reply-visible haptic safely ignores an unsupported navigator', () => {
    withNavigator(undefined, () => assert.doesNotThrow(notifyReplyVisible));
    withNavigator({} as Navigator, () => assert.doesNotThrow(notifyReplyVisible));
});

test('reply-visible haptic swallows a vibrate failure', () => {
    withNavigator({ vibrate: () => { throw new Error('unsupported'); } } as unknown as Navigator, () => {
        assert.doesNotThrow(notifyReplyVisible);
    });
});

test('reply-visible haptic schedules exactly two animation frames before one notification', () => {
    const callbacks: FrameRequestCallback[] = [];
    const original = globalThis.requestAnimationFrame;
    const calls: number[] = [];
    globalThis.requestAnimationFrame = callback => {
        callbacks.push(callback);
        return callbacks.length;
    };
    try {
        withNavigator({ vibrate: (duration: number) => { calls.push(duration); return true; } } as Navigator, () => {
            scheduleReplyVisibleHaptic();
            assert.equal(callbacks.length, 1);
            callbacks.shift()?.(0);
            assert.equal(callbacks.length, 1);
            callbacks.shift()?.(16);
        });
    } finally {
        globalThis.requestAnimationFrame = original;
    }
    assert.deepEqual(calls, [35]);
});

test('final accepted render schedules the haptic while generic appendMessage remains untouched', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    assert.match(source, /if \(currentConversationKey === request\.conversationKey\) \{\s*const renderStartedAt = performance\.now\(\);\s*appendMessage\(botContent, 'bot'\);\s*markChatPerformance\('response:final-render', renderStartedAt\);\s*scheduleReplyVisibleHaptic\(\);\s*\}/s);
    const appendMessage = source.slice(source.indexOf('const appendMessage ='), source.indexOf('const appendHistoryDivider ='));
    assert.doesNotMatch(appendMessage, /scheduleReplyVisibleHaptic|notifyReplyVisible|vibrate/);
});
