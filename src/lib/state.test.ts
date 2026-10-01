import { describe, expect, test, vi } from 'vitest';
import type { Answer } from './domain';
import type { AuditState } from './report';
import { decodeState, emptyState, encodeState, loadInitialState, saveState } from './state';

const ANSWERS: Answer[] = ['yes', 'no', 'unchecked'];
const ALPHABET = 'abcxyz -|#?&=/\\\n\t"\'<>{}[]ёжЖ🙂…:;%+';

// Детерминированный PRNG: упавший прогон воспроизводится
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomState(random: () => number): AuditState {
  const int = (max: number) => Math.floor(random() * max);
  const text = () => Array.from({ length: int(40) }, () => [...ALPHABET][int([...ALPHABET].length)]).join('');
  const id = () => `s${int(1000)}-x`;
  const answers: AuditState['answers'] = {};

  for (let i = int(16); i > 0; i -= 1) {
    answers[`${id()}.${id()}`] = { answer: ANSWERS[int(3)]!, evidence: text() };
  }

  return {
    answers,
    passProbability: random() < 0.2 ? null : [0, 1, random()][int(3)]!,
    appendix: { leadLag: [text(), text(), text()], blastRadius: [text(), text(), text()] },
  };
}

describe('state codec', () => {
  test('round-trips 300 random valid states', () => {
    const random = mulberry32(20261002);

    for (let run = 0; run < 300; run += 1) {
      const state = randomState(random);
      const hash = encodeState(state);
      expect(hash).toMatch(/^v1\.[A-Za-z0-9_-]*$/);
      expect(decodeState(hash)).toEqual({ state, warning: null });
    }
  });

  test('treats a missing hash as a fresh start without a warning', () => {
    expect(decodeState('')).toEqual({ state: emptyState(), warning: null });
    expect(decodeState('#')).toEqual({ state: emptyState(), warning: null });
  });

  test('accepts the hash with its leading #', () => {
    const state = randomState(mulberry32(1));
    expect(decodeState(`#${encodeState(state)}`).state).toEqual(state);
  });

  test.each([
    ['garbage', 'not-a-state'],
    ['foreign version', `v2.${encodeState(emptyState()).slice(3)}`],
    ['broken base64', 'v1.%%%'],
    ['valid base64, not JSON', `v1.${btoa('nope')}`],
    ['wrong answer value', `v1.${btoa(JSON.stringify({ ...emptyState(), answers: { 'a.b': { answer: 'maybe', evidence: '' } } }))}`],
    ['p out of range', `v1.${btoa(JSON.stringify({ ...emptyState(), passProbability: 2 }))}`],
    ['bad answer key', `v1.${btoa(JSON.stringify({ ...emptyState(), answers: { __proto__x: { answer: 'yes', evidence: '' } } }))}`],
    ['short appendix', `v1.${btoa(JSON.stringify({ ...emptyState(), appendix: { leadLag: [], blastRadius: [] } }))}`],
  ])('returns an empty state and a plain-language warning for %s', (_name, hash) => {
    const { state, warning } = decodeState(hash);
    expect(state).toEqual(emptyState());
    expect(warning).toMatch(/начните заново/);
    expect(warning).not.toMatch(/json|base64|error|version/i);
  });
});

describe('initial state', () => {
  test('prefers the URL hash over storage', () => {
    const fromHash = randomState(mulberry32(2));
    const getItem = vi.fn(() => encodeState(randomState(mulberry32(3))));

    expect(loadInitialState(encodeState(fromHash), { getItem })).toEqual({ state: fromHash, warning: null });
    expect(getItem).not.toHaveBeenCalled();
  });

  test('recovers from storage when the hash is empty', () => {
    const saved = randomState(mulberry32(4));
    expect(loadInitialState('', { getItem: () => encodeState(saved) }).state).toEqual(saved);
  });

  test('works without storage', () => {
    expect(loadInitialState('', null)).toEqual({ state: emptyState(), warning: null });
  });

  test('survives a throwing storage with an empty state and a warning', () => {
    const storage = { getItem: () => { throw new Error('SecurityError'); } };
    const { state, warning } = loadInitialState('', storage);
    expect(state).toEqual(emptyState());
    expect(warning).toMatch(/начните заново/);
  });

  test('saveState reports a throwing storage instead of crashing', () => {
    const state = randomState(mulberry32(5));
    const setItem = vi.fn();

    expect(saveState(state, { setItem })).toBe(true);
    expect(decodeState(setItem.mock.calls[0]![1]).state).toEqual(state);
    expect(saveState(state, { setItem: () => { throw new Error('QuotaExceededError'); } })).toBe(false);
  });
});
