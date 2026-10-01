import { describe, expect, test } from 'vitest';
import { expectedCalls, normalizeAnswer, savingsPercent } from './domain';

describe('answer normalization', () => {
  test('keeps yes as passed', () => {
    expect(normalizeAnswer({ answer: 'yes', evidence: '' })).toBe('passed');
  });

  test('keeps no with evidence as failed', () => {
    expect(normalizeAnswer({ answer: 'no', evidence: 'retry loop drops tool results' })).toBe('failed');
  });

  test('downgrades no without evidence to unchecked', () => {
    expect(normalizeAnswer({ answer: 'no', evidence: '' })).toBe('unchecked');
    expect(normalizeAnswer({ answer: 'no', evidence: '   \n' })).toBe('unchecked');
  });

  test('keeps unchecked as unchecked', () => {
    expect(normalizeAnswer({ answer: 'unchecked', evidence: 'anything' })).toBe('unchecked');
  });
});

describe('fan-out calculator', () => {
  test.each([
    [0.1, 1.11, 63],
    [0.9, 2.71, 10],
    [0, 1, 67],
    [1, 3, 0],
  ])('p=%s => %s calls, %s%% savings', (p, calls, savings) => {
    expect(expectedCalls(p)).toBeCloseTo(calls, 10);
    expect(savingsPercent(p)).toBe(savings);
  });

  test.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])('rejects p=%s', (p) => {
    expect(() => expectedCalls(p)).toThrow(RangeError);
    expect(() => savingsPercent(p)).toThrow(RangeError);
  });
});
