import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export const SUPPORTED_ANSWER_TYPES = ['yes-no-unchecked'] as const;

export type AnswerType = (typeof SUPPORTED_ANSWER_TYPES)[number];

export interface ChecklistItem {
  id: string;
  label: string;
  answerType: AnswerType;
  recommendation: string;
  source: string;
}

export interface ChecklistStep {
  id: string;
  title: string;
  items: ChecklistItem[];
}

const stepsFileUrl = new URL('../../content/steps.yaml', import.meta.url);
const STABLE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export function loadSteps(): ChecklistStep[] {
  return loadStepsFromYaml(readFileSync(stepsFileUrl, 'utf8'));
}

export function loadStepsFromYaml(content: string): ChecklistStep[] {
  let parsed: unknown;

  try {
    parsed = parse(content);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    throw new Error(`Invalid checklist YAML${detail}`);
  }

  const root = readRecord(parsed, 'checklist');
  const rawSteps = root.steps;

  if (!Array.isArray(rawSteps) || rawSteps.length !== 5) {
    throw new Error('Checklist must contain exactly five steps');
  }

  const usedIds = new Set<string>();

  return rawSteps.map((rawStep) => {
    const step = readRecord(rawStep, 'step');
    const id = readStableId(step.id, 'step');

    if (usedIds.has(id)) {
      throw new Error(`Duplicate step id "${id}"`);
    }

    usedIds.add(id);
    const title = readNonEmptyString(step.title, `step "${id}" title`);

    if (!Array.isArray(step.items) || step.items.length < 3 || step.items.length > 4) {
      throw new Error(`Step "${id}" must contain three or four items`);
    }

    const items = step.items.map((rawItem) => {
      const item = readRecord(rawItem, `item in step "${id}"`);
      const itemId = readStableId(item.id, 'item');

      if (usedIds.has(itemId)) {
        throw new Error(`Duplicate item id "${itemId}"`);
      }

      usedIds.add(itemId);
      const label = readNonEmptyString(item.label, `checklist item "${itemId}" label`);
      const recommendation = readNonEmptyString(item.recommendation, `checklist item "${itemId}" recommendation`);
      const source = readHttpsSource(item.source, itemId);

      if (!SUPPORTED_ANSWER_TYPES.includes(item.answerType as AnswerType)) {
        throw new Error(`Invalid checklist item "${itemId}": unsupported answer type`);
      }

      return {
        id: itemId,
        label,
        answerType: item.answerType as AnswerType,
        recommendation,
        source,
      };
    });

    return { id, title, items };
  });
}

function readRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${name}`);
  }

  return value as Record<string, unknown>;
}

function readStableId(value: unknown, kind: string): string {
  const id = readNonEmptyString(value, `${kind} id`);

  if (!STABLE_ID_PATTERN.test(id)) {
    throw new Error(`Invalid ${kind} id "${id}"`);
  }

  return id;
}

function readNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be non-empty`);
  }

  return value;
}

function readHttpsSource(value: unknown, itemId: string): string {
  const source = readNonEmptyString(value, `checklist item "${itemId}" source`);

  try {
    const url = new URL(source);

    if (url.protocol !== 'https:' || url.hostname === '' || url.username !== '' || url.password !== '') {
      throw new Error('unsupported URL');
    }
  } catch {
    throw new Error(`Invalid checklist item "${itemId}": source must be an absolute HTTPS URL`);
  }

  return source;
}
