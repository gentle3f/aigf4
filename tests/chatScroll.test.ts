import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMessageStartScrollTop } from '../chatScroll.js';

test('positions a new reply at the readable top without a second correction', () => {
    assert.equal(calculateMessageStartScrollTop(1200, 460, 200), 1452);
    assert.equal(calculateMessageStartScrollTop(0, 4, 0), 0);
});
