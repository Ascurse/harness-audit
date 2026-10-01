import type { Answer } from '../lib/domain';
import { APPENDIX_ROW_COUNT, calculatorSummary, copyReport, downloadReport, generateReport, type AuditState } from '../lib/report';
import { encodeState, loadInitialState, saveState } from '../lib/state';
import type { ChecklistStep } from '../lib/steps';

const APPENDIX_IDS = ['leadLag', 'blastRadius'] as const;
const COPY_DONE = 'Скопировано';
const COPY_FAILED = 'Не удалось скопировать: выделите текст отчёта и скопируйте вручную.';
const P_OUT_OF_RANGE = 'p должно быть числом от 0 до 1.';

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// Доступ к localStorage сам может бросить (запрет cookies, sandbox) — тогда работаем только через URL
function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function start(): void {
  const steps = JSON.parse(byId('checklist-data').textContent ?? '[]') as ChecklistStep[];
  const keys = steps.flatMap((step) => step.items.map((item) => ({ key: `${step.id}.${item.id}`, itemId: item.id })));
  const storage = getStorage();
  const pInput = byId<HTMLInputElement>('pass-probability');
  const preview = byId<HTMLPreElement>('report-preview');
  const copyButton = byId<HTMLButtonElement>('copy-report');
  const copyStatus = byId('copy-status');
  const evidenceOf = (itemId: string) => byId<HTMLTextAreaElement>(`evidence-${itemId}`);
  const appendixInput = (id: string, row: number) => byId<HTMLInputElement>(`appendix-${id}-${row}`);
  const rows = Array.from({ length: APPENDIX_ROW_COUNT }, (_, row) => row);

  function readPassProbability(): number | null {
    const value = pInput.valueAsNumber;
    const isValid = pInput.value === '' || (value >= 0 && value <= 1);
    pInput.setAttribute('aria-invalid', String(!isValid));
    return pInput.value !== '' && isValid ? value : null;
  }

  function readState(): AuditState {
    const answers: AuditState['answers'] = {};

    for (const { key, itemId } of keys) {
      const checked = document.querySelector<HTMLInputElement>(`input[name="${key}"]:checked`);
      const evidence = evidenceOf(itemId).value;

      if (checked !== null || evidence !== '') {
        answers[key] = { answer: (checked?.value ?? 'unchecked') as Answer, evidence };
      }
    }

    return {
      answers,
      passProbability: readPassProbability(),
      appendix: {
        leadLag: rows.map((row) => appendixInput('leadLag', row).value),
        blastRadius: rows.map((row) => appendixInput('blastRadius', row).value),
      },
    };
  }

  function writeState(state: AuditState): void {
    for (const { key, itemId } of keys) {
      const response = state.answers[key];

      if (response === undefined) continue;

      const radio = document.querySelector<HTMLInputElement>(`input[name="${key}"][value="${response.answer}"]`);
      if (radio !== null) radio.checked = true;
      evidenceOf(itemId).value = response.evidence;
    }

    pInput.value = state.passProbability === null ? '' : String(state.passProbability);
    APPENDIX_IDS.forEach((id) => rows.forEach((row) => {
      appendixInput(id, row).value = state.appendix[id][row] ?? '';
    }));
  }

  function render(state: AuditState): void {
    const answered = Object.values(state.answers).filter(({ answer }) => answer !== 'unchecked').length;
    byId('progress-count').textContent = String(answered);
    byId<HTMLProgressElement>('progress-bar').value = answered;

    const isPInvalid = pInput.getAttribute('aria-invalid') === 'true';
    byId('calculator-result').textContent = isPInvalid ? P_OUT_OF_RANGE : calculatorSummary(state.passProbability);
    preview.textContent = generateReport(steps, state);
  }

  function onChange(): void {
    const state = readState();
    render(state);
    history.replaceState(null, '', `#${encodeState(state)}`);
    if (storage !== null) saveState(state, storage);
    copyStatus.textContent = '';
  }

  const loaded = loadInitialState(location.hash, storage);
  writeState(loaded.state);
  render(readState());

  if (loaded.warning !== null) {
    const warning = byId('restore-warning');
    warning.textContent = loaded.warning;
    warning.hidden = false;
  }

  document.querySelector('main')!.addEventListener('input', onChange);

  // aria-disabled вместо disabled: disabled-кнопка теряет фокус, и клавиатурный пользователь оказывается в начале страницы
  copyButton.addEventListener('click', async () => {
    if (copyButton.getAttribute('aria-disabled') === 'true') return;

    copyButton.setAttribute('aria-disabled', 'true');
    copyStatus.textContent = '';

    try {
      await copyReport(preview.textContent ?? '', navigator.clipboard);
      copyStatus.textContent = COPY_DONE;
    } catch {
      copyStatus.textContent = COPY_FAILED;
    } finally {
      copyButton.removeAttribute('aria-disabled');
    }
  });

  byId('download-report').addEventListener('click', () => {
    downloadReport(preview.textContent ?? '', new Date(), document);
  });
}
