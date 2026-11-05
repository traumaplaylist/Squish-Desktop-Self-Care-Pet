import { describe, expect, it } from 'vitest';
import { classifyNotificationState } from './notificationState';

describe('classifyNotificationState', () => {
  it.each([
    [2, { kind: 'suppress', reason: 'fullscreen' }],
    [3, { kind: 'suppress', reason: 'game' }],
    [4, { kind: 'suppress', reason: 'presentation' }],
    [7, { kind: 'suppress', reason: 'fullscreen' }],
    [1, { kind: 'idle' }],
    [5, { kind: 'none' }],
    [6, { kind: 'none' }],
    [0, { kind: 'unknown' }],
    [99, { kind: 'unknown' }],
    ['unknown' as const, { kind: 'unknown' }],
  ])('код %s', (code, expected) => {
    expect(classifyNotificationState(code)).toEqual(expected);
  });
});
