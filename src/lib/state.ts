import type { Answer, ItemResponse } from './domain';
import { APPENDIX_ROW_COUNT, type AuditState } from './report';

export interface LoadedState {
  state: AuditState;
  warning: string | null;
}

const HASH_VERSION_PREFIX = 'v1.';
const STORAGE_KEY = 'harness-audit:state';
const ANSWER_VALUES: readonly Answer[] = ['yes', 'no', 'unchecked'];
const ANSWER_KEY_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;

export const RESTORE_WARNING = 'Не удалось открыть сохранённые ответы, поэтому начните заново: чеклист пуст.';

export function emptyState(): AuditState {
  return {
    answers: {},
    passProbability: null,
    appendix: {
      leadLag: Array<string>(APPENDIX_ROW_COUNT).fill(''),
      blastRadius: Array<string>(APPENDIX_ROW_COUNT).fill(''),
    },
  };
}

export function encodeState(state: AuditState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return HASH_VERSION_PREFIX + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeState(hash: string): LoadedState {
  const payload = hash.startsWith('#') ? hash.slice(1) : hash;

  if (payload === '') {
    return { state: emptyState(), warning: null };
  }

  try {
    if (!payload.startsWith(HASH_VERSION_PREFIX)) {
      throw new Error('unsupported version');
    }

    const base64 = payload.slice(HASH_VERSION_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { state: readState(JSON.parse(json)), warning: null };
  } catch {
    return { state: emptyState(), warning: RESTORE_WARNING };
  }
}

// URL-хеш — основной источник; localStorage только восстанавливает, если ссылки нет
export function loadInitialState(hash: string, storage: Pick<Storage, 'getItem'> | null): LoadedState {
  if (hash !== '' && hash !== '#') {
    return decodeState(hash);
  }

  if (storage === null) {
    return { state: emptyState(), warning: null };
  }

  try {
    return decodeState(storage.getItem(STORAGE_KEY) ?? '');
  } catch {
    return { state: emptyState(), warning: RESTORE_WARNING };
  }
}

export function saveState(state: AuditState, storage: Pick<Storage, 'setItem'>): boolean {
  try {
    storage.setItem(STORAGE_KEY, encodeState(state));
    return true;
  } catch {
    return false;
  }
}

function readState(value: unknown): AuditState {
  const root = readRecord(value);
  const answers = readRecord(root.answers);
  const appendix = readRecord(root.appendix);
  const { passProbability } = root;

  if (passProbability !== null && !(typeof passProbability === 'number' && passProbability >= 0 && passProbability <= 1)) {
    throw new Error('invalid passProbability');
  }

  return {
    answers: Object.fromEntries(Object.entries(answers).map(([key, response]) => {
      if (!ANSWER_KEY_PATTERN.test(key)) {
        throw new Error('invalid answer key');
      }

      return [key, readResponse(response)];
    })),
    passProbability,
    appendix: {
      leadLag: readRows(appendix.leadLag),
      blastRadius: readRows(appendix.blastRadius),
    },
  };
}

function readResponse(value: unknown): ItemResponse {
  const { answer, evidence } = readRecord(value);

  if (!ANSWER_VALUES.includes(answer as Answer) || typeof evidence !== 'string') {
    throw new Error('invalid response');
  }

  return { answer: answer as Answer, evidence };
}

function readRows(value: unknown): string[] {
  if (!Array.isArray(value) || value.length !== APPENDIX_ROW_COUNT || !value.every((row) => typeof row === 'string')) {
    throw new Error('invalid appendix rows');
  }

  return value;
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid record');
  }

  return value as Record<string, unknown>;
}
