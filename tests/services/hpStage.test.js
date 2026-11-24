import { hpStage, stageWorsened } from '../../scripts/services/hpStage.js';

test('stages by hit points', () => {
  expect(hpStage({ value: 60, max: 60 })).toBe('ok');
  expect(hpStage({ value: 31, max: 60 })).toBe('ok');
  expect(hpStage({ value: 30, max: 60 })).toBe('broken');
  expect(hpStage({ value: 0, max: 60 })).toBe('destroyed');
  expect(hpStage({ value: -4, max: 60 })).toBe('destroyed');
  expect(hpStage({ value: 12, max: 60, brokenThreshold: 10 })).toBe('ok');
  expect(hpStage({ value: 0, max: 0 })).toBe('ok');
  expect(hpStage(undefined)).toBe('ok');
});

test('only damage crossing a line counts as worse', () => {
  expect(stageWorsened('ok', 'broken')).toBe(true);
  expect(stageWorsened('broken', 'destroyed')).toBe(true);
  expect(stageWorsened('ok', 'destroyed')).toBe(true);
  expect(stageWorsened('broken', 'broken')).toBe(false);
  expect(stageWorsened('destroyed', 'ok')).toBe(false);
});
