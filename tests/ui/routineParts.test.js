import {
  extractSaves,
  endOfTurnAbilityIds,
  endOfTurnNotes,
  splitRoutine,
  triggerText,
} from '../../scripts/ui/routineParts.js';

const faith =
  '<p>(3 actions; divine, enchantment, mental) Ghostly images of chanting dwarves float through the room. A targeted creature must attempt a @Check[will|dc:25|traits:divine,enchantment,mental] save.</p>' +
  '<hr /><p><strong>Critical Success</strong> The creature is unaffected.</p>' +
  '<p><strong>Success</strong> The creature takes @Damage[1d10[mental]] damage.</p>';

describe('splitRoutine', () => {
  test('strips the action prefix and returns its traits', () => {
    const { traits, intro } = splitRoutine(faith);
    expect(traits).toEqual(['divine', 'enchantment', 'mental']);
    expect(intro.startsWith('<p>Ghostly images')).toBe(true);
    expect(intro).not.toContain('3 actions');
  });

  test('splits outcomes at the rule before Critical Success', () => {
    const { intro, outcomes } = splitRoutine(faith);
    expect(intro).not.toContain('Critical Success');
    expect(intro).not.toContain('<hr');
    expect(outcomes.startsWith('<p><strong>Critical Success</strong>')).toBe(true);
    expect(outcomes).toContain('@Damage[1d10[mental]]');
  });

  test('splits outcomes without a rule', () => {
    const { outcomes } = splitRoutine(
      '<p>(1 action) It bites.</p><p><strong>Critical Success</strong> Nothing.</p>',
    );
    expect(outcomes).toBe('<p><strong>Critical Success</strong> Nothing.</p>');
  });

  test('prefix without traits, word counts and no outcomes', () => {
    expect(splitRoutine('<p>(two actions) It spins.</p>')).toEqual({
      traits: [],
      intro: '<p>It spins.</p>',
      outcomes: null,
    });
  });

  test('multi-word traits become slugs; prose without a prefix is untouched', () => {
    expect(splitRoutine('<p>(1 action; death, void energy) X</p>').traits).toEqual([
      'death',
      'void-energy',
    ]);
    expect(splitRoutine('<p>On its initiative it spins.</p>')).toEqual({
      traits: [],
      intro: '<p>On its initiative it spins.</p>',
      outcomes: null,
    });
  });

  test('empty input is safe', () => {
    expect(splitRoutine(undefined)).toEqual({ traits: [], intro: '', outcomes: null });
  });
});

describe('extractSaves', () => {
  test('returns saving throws only, with the raw check and basic flag, deduplicated', () => {
    const raw =
      'Attempt a @Check[will|dc:25|traits:mental] save. Again @Check[will|dc:25|traits:mental]. ' +
      'Then @Check[reflex|dc:20|basic]{basic Reflex} and @Check[athletics|dc:20] to escape.';
    expect(extractSaves(raw)).toEqual([
      { statistic: 'will', dc: 25, basic: false, raw: '@Check[will|dc:25|traits:mental]' },
      { statistic: 'reflex', dc: 20, basic: true, raw: '@Check[reflex|dc:20|basic]' },
    ]);
  });

  test('none when there is no save', () => {
    expect(extractSaves('<p>It bites.</p>')).toEqual([]);
  });
});

test('endOfTurnNotes finds what happens at the end of the turn and the abilities named', () => {
  const routine =
    "<p>(3 actions) The violence targets three creatures. At the end of the haunt's turn, it takes its Spectral Uprising reaction.</p>";
  const items = [
    { id: 'r1', name: 'Spectral Uprising' },
    { id: 's1', name: 'Ghostly Attack' },
  ];
  expect(endOfTurnNotes(routine, items)).toEqual([
    {
      text: "At the end of the haunt's turn, it takes its Spectral Uprising reaction.",
      abilities: [{ id: 'r1', name: 'Spectral Uprising' }],
    },
  ]);
  expect(endOfTurnNotes('<p>It makes a Strike.</p>', items)).toEqual([]);
  expect(endOfTurnNotes(null)).toEqual([]);
});

test("triggerText reads a reaction's trigger", () => {
  expect(
    triggerText(
      '<p><strong>Trigger</strong> A creature enters the room.</p><hr /><p><strong>Effect</strong> The trap fires.</p>',
    ),
  ).toBe('A creature enters the room.');
  expect(triggerText('<p><strong>Trigger</strong> A creature moves</p>')).toBe('A creature moves');
  expect(triggerText('<p>The trap fires.</p>')).toBeNull();
});

test('endOfTurnAbilityIds: each named ability once, skipping those already used', () => {
  const notes = [
    {
      text: 'a',
      abilities: [
        { id: 'r1', name: 'Uprising' },
        { id: 'a1', name: 'Wail' },
      ],
    },
    { text: 'b', abilities: [{ id: 'r1', name: 'Uprising' }] },
    { text: 'c', abilities: [] },
  ];
  expect(endOfTurnAbilityIds(notes)).toEqual(['r1', 'a1']);
  expect(endOfTurnAbilityIds(notes, ['r1'])).toEqual(['a1']);
  expect(endOfTurnAbilityIds([], ['r1'])).toEqual([]);
  expect(endOfTurnAbilityIds(null)).toEqual([]);
});
