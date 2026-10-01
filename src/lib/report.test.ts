import { describe, expect, test, vi } from 'vitest';
import type { ItemResponse } from './domain';
import { copyReport, downloadReport, generateReport, reportFilename, type AuditState } from './report';
import { emptyState } from './state';
import { loadSteps } from './steps';

const steps = loadSteps();
const allItems = steps.flatMap((step) => step.items.map((item) => ({ step, item })));

function stateWith(answer: (key: string) => ItemResponse, passProbability: number | null = null): AuditState {
  return {
    answers: Object.fromEntries(allItems.map(({ step, item }) => {
      const key = `${step.id}.${item.id}`;
      return [key, answer(key)];
    })),
    passProbability,
    appendix: emptyState().appendix,
  };
}

function sectionOf(report: string, itemId: string): string {
  const start = report.indexOf(`<!-- ${itemId} -->`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = report.indexOf('<!-- ', start + 1);
  return report.slice(start, next === -1 ? undefined : next);
}

describe('markdown report', () => {
  test('has a summary, exactly five step sections, the calculator and two appendices', () => {
    const report = generateReport(steps, stateWith(() => ({ answer: 'yes', evidence: '' })));

    expect(report.match(/^## Шаг \d\. /gm)).toHaveLength(5);
    expect(report.match(/^## Приложение [AB]\. /gm)).toHaveLength(2);
    expect(report).toMatch(/^## Сводка$/m);
    expect(report).toMatch(/^## Калькулятор fan-out$/m);
    steps.forEach((step, index) => expect(report).toContain(`## Шаг ${index + 1}. ${step.title}`));
  });

  test('every failed item carries its evidence, recommendation and source', () => {
    const report = generateReport(steps, stateWith((key) => ({ answer: 'no', evidence: `proof for ${key}` })));

    for (const { step, item } of allItems) {
      const section = sectionOf(report, item.id);
      expect(section).toContain('Провалено');
      expect(section).toContain(`proof for ${step.id}.${item.id}`);
      expect(section).toContain(item.recommendation);
      expect(section).toContain(item.source);
    }
  });

  test('shows no without evidence as unchecked, never as failed', () => {
    const report = generateReport(steps, stateWith(() => ({ answer: 'no', evidence: '  ' })));

    expect(report).not.toContain('Провалено:');
    expect(sectionOf(report, allItems[0]!.item.id)).toContain('Не проверено');
    expect(sectionOf(report, allItems[0]!.item.id)).toContain('без свидетельства');
  });

  test('empty state marks everything unchecked and nothing passed', () => {
    const report = generateReport(steps, emptyState());

    expect(report).not.toContain('Пройдено:');
    expect(report).not.toContain('Провалено:');
    expect(report.match(/^- \*\*Не проверено:\*\*/gm)).toHaveLength(allItems.length);
    expect(report).toContain('p не введено');
  });

  test('includes the calculator result for the entered p', () => {
    const report = generateReport(steps, { ...emptyState(), passProbability: 0.1 });

    expect(report).toContain('p = 0.1');
    expect(report).toContain('1.11');
    expect(report).toContain('63%');
  });

  test('keeps multi-line evidence inside its list item', () => {
    const report = generateReport(steps, stateWith(() => ({ answer: 'no', evidence: 'line one\n\n## injected' })));

    expect(report).not.toMatch(/^## injected/m);
    expect(report).toContain('line one ## injected');
  });

  test('fills appendix cells with the user notes, one line and table-safe', () => {
    const report = generateReport(steps, {
      ...emptyState(),
      appendix: { leadLag: ['deploys | defects\nweekly', '', ''], blastRadius: ['', '', 'billing/'] },
    });

    expect(report).toContain('| Deployment frequency | Escaped defects | deploys \\| defects weekly |');
    expect(report).toContain('| Red | Только в паре с человеком | billing/ |');
  });

  test('full failed report matches the snapshot, so dropping any source or recommendation fails', () => {
    expect(generateReport(steps, stateWith((key) => ({ answer: 'no', evidence: `proof for ${key}` }), 0.9)))
      .toMatchSnapshot();
  });
});

describe('report adapters', () => {
  test('builds a safe, stable filename from the date', () => {
    expect(reportFilename(new Date('2026-10-02T23:59:00Z'))).toBe('harness-audit-2026-10-02.md');
  });

  test('copies the markdown to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await copyReport('# report', { writeText });
    expect(writeText).toHaveBeenCalledWith('# report');
  });

  test('downloads the markdown as a file and releases the object URL', async () => {
    const anchor = { href: '', download: '', click: vi.fn() };
    const doc = { createElement: vi.fn(() => anchor) };
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    downloadReport('# report', new Date('2026-10-02T00:00:00Z'), doc);

    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('text/markdown;charset=utf-8');
    expect(await blob.text()).toBe('# report');
    expect(anchor).toMatchObject({ href: 'blob:report', download: 'harness-audit-2026-10-02.md' });
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');
  });
});
