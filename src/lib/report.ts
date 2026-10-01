import { expectedCalls, normalizeAnswer, savingsPercent, type EffectiveStatus, type ItemResponse } from './domain';
import type { ChecklistItem, ChecklistStep } from './steps';

export interface AuditState {
  // Ключ — `${stepId}.${itemId}`
  answers: Record<string, ItemResponse>;
  passProbability: number | null;
  // Заметки пользователя в последней колонке таблиц приложений, по строке на каждую строку таблицы
  appendix: { leadLag: string[]; blastRadius: string[] };
}

const STATUS_ORDER: EffectiveStatus[] = ['failed', 'unchecked', 'passed'];

const STATUS_LABEL: Record<EffectiveStatus, string> = {
  failed: 'Провалено',
  unchecked: 'Не проверено',
  passed: 'Пройдено',
};

const EMPTY_RESPONSE: ItemResponse = { answer: 'unchecked', evidence: '' };

export const APPENDIX_ROW_COUNT = 3;

export const LEAD_LAG_ROWS: [string, string][] = [
  ['Deployment frequency', 'Escaped defects'],
  ['PR cycle time', 'Удовлетворённость пользователей'],
  ['Token usage', 'Надёжность в проде'],
];

export const BLAST_RADIUS_ROWS: [string, string][] = [
  ['Green', 'Tight loop: правит и проверяет сам'],
  ['Yellow', 'Characterization-тесты до правки, проверка другим прогоном'],
  ['Red', 'Только в паре с человеком'],
];

export function generateReport(steps: ChecklistStep[], state: AuditState): string {
  const evaluated = steps.map((step) => ({
    step,
    items: step.items.map((item) => {
      const response = state.answers[`${step.id}.${item.id}`] ?? EMPTY_RESPONSE;
      return { item, response, status: normalizeAnswer(response) };
    }),
  }));

  const summaryRows = evaluated.map(({ step, items }, index) => {
    const count = (status: EffectiveStatus) => items.filter((entry) => entry.status === status).length;
    return `| ${index + 1}. ${step.title} | ${count('passed')} | ${count('failed')} | ${count('unchecked')} |`;
  });

  const stepSections = evaluated.map(({ step, items }, index) => {
    const ordered = [...items].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
    return [`## Шаг ${index + 1}. ${step.title}`, ...ordered.map(renderItem)].join('\n\n');
  });

  return [
    '# Harness audit: отчёт',
    '## Сводка',
    ['| Шаг | пройдено | провалено | не проверено |', '| --- | --- | --- | --- |', ...summaryRows].join('\n'),
    ...stepSections,
    renderCalculator(state.passProbability),
    renderAppendix(
      '## Приложение A. Пары lead+lag',
      'Правило: ни одной цели на прокси-метрике без парной lag-метрики.',
      ['Lead (быстрый прокси)', 'Lag (результат)', 'Ваша пара'],
      LEAD_LAG_ROWS,
      state.appendix.leadLag,
    ),
    renderAppendix(
      '## Приложение B. Карта blast-radius',
      'Правило: карту рисует человек, а не агент.',
      ['Зона', 'Что делает агент', 'Ваши модули'],
      BLAST_RADIUS_ROWS,
      state.appendix.blastRadius,
    ),
  ].join('\n\n') + '\n';
}

function renderItem({ item, response, status }: { item: ChecklistItem; response: ItemResponse; status: EffectiveStatus }): string {
  const evidence = toSingleLine(response.evidence);
  const lines = [`<!-- ${item.id} -->`, `- **${STATUS_LABEL[status]}:** ${item.label}`];

  if (status === 'failed') {
    lines.push(`  - Свидетельство: ${evidence}`, `  - Рекомендация: ${item.recommendation}`);
  }

  if (status === 'unchecked' && response.answer === 'no') {
    lines.push('  - Ответ «нет» без свидетельства понижен до «не проверено».');
  }

  if (status === 'passed' && evidence !== '') {
    lines.push(`  - Свидетельство: ${evidence}`);
  }

  lines.push(`  - Источник: <${item.source}>`);
  return lines.join('\n');
}

export function calculatorSummary(passProbability: number | null): string {
  return passProbability === null
    ? 'p не введено: посчитайте вероятность прохождения проверки на своих прогонах.'
    : `p = ${passProbability}: short-circuit тратит в среднем ${expectedCalls(passProbability).toFixed(2)} вызова из 3, экономия ${savingsPercent(passProbability)}%.`;
}

function renderCalculator(passProbability: number | null): string {
  return `## Калькулятор fan-out\n\n${calculatorSummary(passProbability)}`;
}

function renderAppendix(heading: string, rule: string, columns: string[], rows: [string, string][], notes: string[]): string {
  const tableRows = rows.map(([first, second], index) => `| ${first} | ${second} | ${toTableCell(notes[index] ?? '')} |`);
  return [heading, rule, [`| ${columns.join(' | ')} |`, '| --- | --- | --- |', ...tableRows].join('\n')].join('\n\n');
}

function toTableCell(text: string): string {
  return toSingleLine(text).replace(/\|/g, '\\|');
}

// Пользовательский текст не должен ломать разметку: переносы строк превращали бы его в заголовки
function toSingleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function reportFilename(date: Date): string {
  return `harness-audit-${date.toISOString().slice(0, 10)}.md`;
}

export function copyReport(markdown: string, clipboard: Pick<Clipboard, 'writeText'>): Promise<void> {
  return clipboard.writeText(markdown);
}

interface DownloadAnchor {
  href: string;
  download: string;
  click(): void;
}

export function downloadReport(markdown: string, date: Date, doc: { createElement(tag: 'a'): DownloadAnchor }): void {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = reportFilename(date);
  anchor.click();
  URL.revokeObjectURL(url);
}
