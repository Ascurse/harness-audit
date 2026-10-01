import { describe, expect, test } from 'vitest';
import { loadSteps, loadStepsFromYaml } from './steps';

describe('checklist content contract', () => {
  test('accepts exactly five steps with supported answers and sourced items', () => {
    const steps = loadStepsFromYaml(`
steps:
  - id: api-contract
    title: API contract
    items:
      - id: api-tool-choice
        label: Does tool choice remain optional?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/tool-choice
      - id: api-sampling
        label: Are sampling values intentional?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/sampling
      - id: api-refusal
        label: Is refusal handled?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/refusal
  - id: context-mutability
    title: Context mutability
    items:
      - id: context-window
        label: Is history preserved?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/window
      - id: context-tools
        label: Are tools immutable?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/tools
      - id: context-binding
        label: Is prefix binding checked?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/binding
  - id: progress-telemetry
    title: Progress telemetry
    items:
      - id: telemetry-updates
        label: Are progress updates visible?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/updates
      - id: telemetry-ttft
        label: Is time to first token measured?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/ttft
      - id: telemetry-silence
        label: Is silence visible?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/silence
  - id: verification-graph
    title: Verification graph
    items:
      - id: graph-probability
        label: Is pass probability measured?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/probability
      - id: graph-short-circuit
        label: Is short circuit used?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/short-circuit
      - id: graph-write-gate
        label: Is there a write gate?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/write-gate
  - id: effort-calibration
    title: Effort calibration
    items:
      - id: effort-routing
        label: Is effort routed by task?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/routing
      - id: effort-batching
        label: Is batching explicit?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/batching
      - id: effort-cost
        label: Is cost bounded?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/cost
`);

    expect(steps).toHaveLength(5);
    expect(steps[0]).toMatchObject({ id: 'api-contract', title: 'API contract' });
    expect(steps[0]?.items[0]).toMatchObject({
      id: 'api-tool-choice',
      answerType: 'yes-no-unchecked',
    });
  });

  test('rejects an empty source and identifies its item', () => {
    expect(() => loadStepsFromYaml(validContentWith('source: https://example.com/tool-choice', 'source:')))
      .toThrow(/api-tool-choice.*source/i);
  });

  test('rejects an empty recommendation and identifies its item', () => {
    expect(() => loadStepsFromYaml(validContentWith('recommendation: Fix the harness rule.', 'recommendation:')))
      .toThrow(/api-tool-choice.*recommendation/i);
  });

  test('keeps the recommendation on the item', () => {
    expect(loadStepsFromYaml(validContentWith('', ''))[0]?.items[0]?.recommendation).toBe('Fix the harness rule.');
  });

  test('rejects a non-HTTPS source and identifies its item', () => {
    expect(() => loadStepsFromYaml(validContentWith('source: https://example.com/tool-choice', 'source: javascript:alert(1)')))
      .toThrow(/api-tool-choice.*absolute HTTPS URL/i);
  });

  test('wraps malformed YAML failures with checklist context', () => {
    expect(() => loadStepsFromYaml('steps: ['))
      .toThrow(/invalid checklist YAML/i);
  });

  test('rejects content with fewer than five steps', () => {
    expect(() => loadStepsFromYaml(validContentWith('  - id: effort-calibration\n    title: Effort calibration\n    items:\n      - id: effort-routing\n        label: Is effort routed by task?\n        answerType: yes-no-unchecked\n        recommendation: Fix the harness rule.\n        source: https://example.com/routing\n      - id: effort-batching\n        label: Is batching explicit?\n        answerType: yes-no-unchecked\n        recommendation: Fix the harness rule.\n        source: https://example.com/batching\n      - id: effort-cost\n        label: Is cost bounded?\n        answerType: yes-no-unchecked\n        recommendation: Fix the harness rule.\n        source: https://example.com/cost\n', '')))
      .toThrow(/exactly five steps/i);
  });

  test('rejects duplicate stable item IDs', () => {
    expect(() => loadStepsFromYaml(validContentWith('id: context-window', 'id: api-tool-choice')))
      .toThrow(/duplicate item id "api-tool-choice"/i);
  });

  test('rejects an item ID that duplicates a step ID', () => {
    expect(() => loadStepsFromYaml(validContentWith('id: api-tool-choice', 'id: api-contract')))
      .toThrow(/duplicate item id "api-contract"/i);
  });

  test('rejects a step with fewer than three items', () => {
    expect(() => loadStepsFromYaml(validContentWith('      - id: api-refusal\n        label: Is refusal handled?\n        answerType: yes-no-unchecked\n        recommendation: Fix the harness rule.\n        source: https://example.com/refusal\n', '')))
      .toThrow(/step "api-contract" must contain three or four items/i);
  });

  test('rejects an unsupported answer type with its item ID', () => {
    expect(() => loadStepsFromYaml(validContentWith('answerType: yes-no-unchecked', 'answerType: free-text')))
      .toThrow(/api-tool-choice.*unsupported answer type/i);
  });

  test('rejects an unstable step ID', () => {
    expect(() => loadStepsFromYaml(validContentWith('id: api-contract', 'id: API contract')))
      .toThrow(/invalid step id "API contract"/i);
  });

  test('loads the checked-in YAML used by the page', () => {
    expect(loadSteps()).toHaveLength(5);
  });
});

function validContentWith(searchValue: string, replacement: string): string {
  return `
steps:
  - id: api-contract
    title: API contract
    items:
      - id: api-tool-choice
        label: Does tool choice remain optional?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/tool-choice
      - id: api-sampling
        label: Are sampling values intentional?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/sampling
      - id: api-refusal
        label: Is refusal handled?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/refusal
  - id: context-mutability
    title: Context mutability
    items:
      - id: context-window
        label: Is history preserved?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/window
      - id: context-tools
        label: Are tools immutable?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/tools
      - id: context-binding
        label: Is prefix binding checked?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/binding
  - id: progress-telemetry
    title: Progress telemetry
    items:
      - id: telemetry-updates
        label: Are progress updates visible?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/updates
      - id: telemetry-ttft
        label: Is time to first token measured?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/ttft
      - id: telemetry-silence
        label: Is silence visible?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/silence
  - id: verification-graph
    title: Verification graph
    items:
      - id: graph-probability
        label: Is pass probability measured?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/probability
      - id: graph-short-circuit
        label: Is short circuit used?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/short-circuit
      - id: graph-write-gate
        label: Is there a write gate?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/write-gate
  - id: effort-calibration
    title: Effort calibration
    items:
      - id: effort-routing
        label: Is effort routed by task?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/routing
      - id: effort-batching
        label: Is batching explicit?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/batching
      - id: effort-cost
        label: Is cost bounded?
        answerType: yes-no-unchecked
        recommendation: Fix the harness rule.
        source: https://example.com/cost
`.replace(searchValue, replacement);
}
