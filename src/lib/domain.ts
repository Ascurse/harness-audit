export type Answer = 'yes' | 'no' | 'unchecked';

export type EffectiveStatus = 'passed' | 'failed' | 'unchecked';

export interface ItemResponse {
  answer: Answer;
  evidence: string;
}

const BASELINE_CALLS = 3;

// «Нет» без доказательства не считается находкой: иначе отчёт полон непроверенных провалов
export function normalizeAnswer({ answer, evidence }: ItemResponse): EffectiveStatus {
  if (answer === 'yes') return 'passed';
  if (answer === 'no' && evidence.trim() !== '') return 'failed';
  return 'unchecked';
}

// Short-circuit из трёх проверок: вторая идёт с вероятностью p, третья — p^2
export function expectedCalls(p: number): number {
  if (!(p >= 0 && p <= 1)) {
    throw new RangeError(`Pass probability must be within [0, 1], got ${p}`);
  }

  return 1 + p + p ** 2;
}

export function savingsPercent(p: number): number {
  return Math.round((1 - expectedCalls(p) / BASELINE_CALLS) * 100);
}
