import { PLAN_VERSION, RANKS } from '../constants.js';
import { parseCounteracts, parseInlineChecks, stripHtml } from './inline.js';

const WORD_NUM = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const NUM = '\\d+|one|two|three|four|five|six|seven|eight|nine|ten';
const toNum = (s) => (/^\d+$/.test(s) ? Number(s) : (WORD_NUM[s.toLowerCase()] ?? null));

function emptyComponent(name) {
  return {
    id: 'c1',
    name,
    count: 1,
    actionsEach: 0,
    sharedSuccesses: null,
    disables: [],
    counteract: null,
  };
}

function basePlan(name) {
  return {
    version: PLAN_VERSION,
    confirmed: false,
    actionsPerTurn: null,
    components: [emptyComponent(name)],
    reactionItemId: null,
    routineItemIds: [],
    resetText: '',
    resetAfterSeconds: null,
  };
}

function successesAfter(rawDisable, check, nextIndex) {
  const tail = stripHtml(rawDisable.slice(check.end, nextIndex)).split(/[,;]|\bor\b/)[0];
  if (/\btwice\b/i.test(tail)) return 2;
  const m = /\b(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+times\b/i.exec(tail);
  return m ? toNum(m[1]) : 1;
}

const PROFICIENCY_RE = /\(\s*(?:untrained|trained|expert|master|legendary)\s*\)/gi;
const isConnectorOnly = (text) =>
  stripHtml(text)
    .replace(PROFICIENCY_RE, '')
    .replace(/[,;]|\b(?:or|and)\b/gi, '')
    .trim() === '';

// "@Check[...] (master)": the rank written right after a check. Alternatives joined only by
// connectors share the rank written after the last one ("@Check[a] or @Check[b] (expert)").
// Also inside the check's own label ("{Thievery (master)}") or after an action cost
// ("@Check[...] (2 actions) (trained)").
const RANK_WORD = '(untrained|trained|expert|master|legendary)';
const RANK_AFTER_RE = new RegExp(
  `^\\s*(?:\\([^)]*\\bactions?\\)\\s*)?\\(\\s*${RANK_WORD}\\s*\\)`,
  'i',
);
const RANK_IN_LABEL_RE = new RegExp(`\\{[^}]*\\(\\s*${RANK_WORD}\\s*\\)[^}]*\\}$`, 'i');
function ranksFor(rawDisable, checks) {
  const ranks = checks.map((c, i) => {
    const tail = stripHtml(rawDisable.slice(c.end, checks[i + 1]?.index ?? rawDisable.length));
    const m = RANK_IN_LABEL_RE.exec(rawDisable.slice(c.index, c.end)) ?? RANK_AFTER_RE.exec(tail);
    return m ? RANKS.indexOf(m[1].toLowerCase()) : null;
  });
  for (let i = checks.length - 2; i >= 0; i--) {
    if (ranks[i] == null && isConnectorOnly(rawDisable.slice(checks[i].end, checks[i + 1].index)))
      ranks[i] = ranks[i + 1];
  }
  return ranks.map((r) => r || null);
}

// Alternatives joined only by connectors share the multiplier written after the last one.
// A count written right after its own check is explicit; a shared one is inferred (a guess).
function successesFor(rawDisable, checks) {
  const counts = checks.map((c, i) =>
    successesAfter(rawDisable, c, checks[i + 1]?.index ?? rawDisable.length),
  );
  const inferred = checks.map(() => false);
  for (let i = checks.length - 2; i >= 0; i--) {
    if (isConnectorOnly(rawDisable.slice(checks[i].end, checks[i + 1].index))) {
      inferred[i] = counts[i] !== counts[i + 1];
      counts[i] = counts[i + 1];
    }
  }
  return { counts, inferred };
}

// "three total successes in any combination", "requires three successful checks, in any
// combination", "Succeed at two of the following checks in any combination", "any combination of
// three punctured pipes": every option adds to one shared total.
const SHARED_PATTERNS = [
  new RegExp(`\\b(${NUM})\\s+(?:total\\s+)?(?:successful\\s+checks|successes)\\b`, 'i'),
  new RegExp(`\\bsucceed\\s+at\\s+(${NUM})\\s+of\\b`, 'i'),
  new RegExp(`\\bany\\s+combination\\s+of\\s+(${NUM})\\b`, 'i'),
];
function parseSharedSuccesses(text) {
  for (const sentence of text.split(/(?<=[.;])\s+/)) {
    if (!/\bany\s+combination\b/i.test(sentence)) continue;
    for (const re of SHARED_PATTERNS) {
      const m = re.exec(sentence);
      if (m) return toNum(m[1]);
    }
  }
  return null;
}

const SAVES = new Set(['fortitude', 'reflex', 'will']);
// Blanks tags without moving anything, so check offsets stay valid.
const flatten = (raw) =>
  raw.replace(/<[^>]+>/g, (m) => ' '.repeat(m.length)).replace(/&nbsp;/g, '      ');

// A save in the disable text is usually a consequence ("must succeed at a @Check[will] save",
// "damage (@Check[reflex|basic])"), not a way to disable; flat checks never are.
function isDisableOption(flat, c) {
  if (c.skill === 'flat') return false;
  if (!SAVES.has(c.skill)) return true;
  if (c.basic || /inflicts/.test(c.options)) return false;
  const before = flat.slice(Math.max(0, c.index - 40), c.index);
  return !/(?:[([]|\b(?:succeeds?\s+at|attempt|make)\s+an?)\s*$/i.test(before);
}

// Disable text with no inline checks at all: "Survival (trained) or Thievery (expert) DC 20".
const PLAIN_SKILL =
  '(?:acrobatics|arcana|athletics|crafting|deception|diplomacy|intimidation|medicine|nature|occultism|performance|religion|society|stealth|survival|thievery|perception|[a-z]+ lore)';
const PLAIN_LIST_RE = new RegExp(
  `((?:\\b${PLAIN_SKILL}\\b(?:\\s*\\(\\s*\\w+\\s*\\))?(?:\\s*,\\s*(?:or\\s+)?|\\s+or\\s+)?)+)\\s*DC\\s*(\\d+)`,
  'gi',
);
function parsePlainChecks(text) {
  const out = [];
  for (const m of text.matchAll(PLAIN_LIST_RE)) {
    for (const s of m[1].matchAll(new RegExp(`\\b${PLAIN_SKILL}\\b`, 'gi'))) {
      const index = m.index + s.index;
      out.push({
        skill: s[0].toLowerCase().replace(/\s+/g, '-'),
        dc: Number(m[2]),
        label: s[0],
        traits: [],
        index,
        end: index + s[0].length,
      });
    }
  }
  return out;
}

// A stated number of successes with no "any combination" wording: "three successes are required
// to disable the haunt", "(requires two successes)", "it takes four successful checks",
// "two total successes using either skill disables the hazard".
const REQUIRED_PATTERNS = [
  `\\b(${NUM})\\s+(?:total\\s+)?(?:success(?:es)?|successful\\s+checks|checks)\\s+(?:in\\s+all\\s+|across\\s+all\\s+skills\\s+|total\\s+)?(?:(?:are|is|area)\\s+)?(?:required|needed|necessary)\\b`,
  `\\brequir(?:es|e|ing)\\s+(${NUM})\\s+(?:total\\s+)?(?:success(?:es)?|successful\\s+checks)\\b`,
  `\\bit\\s+takes\\s+(${NUM})\\s+successful\\s+checks\\b`,
  `\\b(${NUM})\\s+(?:total\\s+)?successes\\b[^.;]{0,60}?\\b(?:disables?|deactivates?|destroys?)\\s`,
  `\\b(${NUM})\\s+successes\\s+total\\b`,
];
const NOT_A_REQUIREMENT_RE = /\b(?:counts?\s+as|earns?|first|after|up\s+to|final)\s+$/i;
const TIMES_BEFORE_RE = new RegExp(`\\b(?:twice|(${NUM})\\s+times)\\s+to\\s+$`, 'i');
const COUNT_BEFORE_RE = new RegExp(`\\b(${NUM})\\s+(?:successful\\s+)?$`, 'i');

/** Stated success counts and the options (by index) each one speaks for. */
function successRequirements(flat, checks, joined) {
  const found = [];
  const forward = (i) => {
    const group = [i];
    while (group.at(-1) < checks.length - 1 && joined(group.at(-1))) group.push(group.at(-1) + 1);
    return group;
  };
  const backward = (i) => {
    const group = [i];
    while (group[0] > 0 && joined(group[0] - 1)) group.unshift(group[0] - 1);
    return group;
  };
  const all = checks.map((_, i) => i);

  // "Three @Check[…] or @Check[…] checks to mend the rift".
  checks.forEach((c, i) => {
    if (i > 0 && checks[i - 1].index === c.index) return;
    const before = flat.slice(i > 0 ? checks[i - 1].end : 0, c.index);
    const m = COUNT_BEFORE_RE.exec(before);
    if (m && !NOT_A_REQUIREMENT_RE.test(before.slice(0, m.index))) {
      found.push({ n: toNum(m[1]), group: forward(i) });
    }
    // "DC 33 Athletics twice to [[/act force-open dc=33]]".
    const times = TIMES_BEFORE_RE.exec(before);
    if (times) found.push({ n: times[1] ? toNum(times[1]) : 2, group: [i] });
  });

  const seen = new Set();
  for (const pattern of REQUIRED_PATTERNS) {
    for (const m of flat.matchAll(new RegExp(pattern, 'gi'))) {
      const at = m.index + m[0].indexOf(m[1]);
      if (seen.has(at) || NOT_A_REQUIREMENT_RE.test(flat.slice(0, at))) continue;
      seen.add(at);
      // In brackets it speaks for the option(s) it follows; otherwise for the whole hazard.
      const before = flat.slice(0, m.index);
      const inBrackets = before.split('(').length > before.split(')').length;
      const prev = checks.findLastIndex((c) => c.end <= m.index);
      found.push({ n: toNum(m[1]), group: inBrackets && prev !== -1 ? backward(prev) : all });
    }
  }
  return found;
}

// Routine text opens with "(N actions; traits)", "(six actions)", "(two-actions)", "Routine (N actions)",
// "N Action:", an action glyph, or just a bare icon digit ("3 For each of its actions...").
// Failing that: "(1 to 3 actions)" (the most it can have), a titled "(1 action)", or "uses its 3 actions".
const GLYPH_ACTIONS = { a: 1, d: 2, t: 3, 1: 1, 2: 2, 3: 3 };
const GLYPH_RE =
  /^\s*(?:<p[^>]*>\s*)?<span class="(?:action-glyph|pf2-icon)">\s*([adt123])\s*<\/span>/i;
const USES_RE = new RegExp(`\\buses?\\s+(?:its\\s+|up\\s+to\\s+)?(${NUM})\\s+actions?\\b`, 'i');
function parseActionsPerTurn(text, rawHtml = '') {
  const glyph = GLYPH_RE.exec(rawHtml);
  if (glyph) return GLYPH_ACTIONS[glyph[1].toLowerCase()];
  const patterns = [
    new RegExp(`^\\s*(?:routine\\s*)?\\(\\s*(${NUM})[\\s-]+actions?\\s*[);,]`, 'i'),
    /^\s*(\d)\s+actions?\s*:/i,
    /^\s*([1-9])\s+(?=[A-Za-z])/,
    new RegExp(`^\\s*\\(\\s*(?:${NUM})\\s+(?:to|or)\\s+(${NUM})\\s+actions?\\b`, 'i'),
    new RegExp(
      `^\\s*(?:[A-Z][\\w'’]*\\s+|(?:the|of|a|an|through)\\s+){1,8}\\(\\s*(${NUM})[\\s-]+actions?\\s*[);,]`,
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return toNum(m[1]);
  }
  // "The keystone uses its 3 actions to…" — but not "each tendril uses 1 action".
  const head = text.slice(0, 240);
  const uses = USES_RE.exec(head);
  if (
    uses &&
    !/\beach\b/i.test(
      head
        .slice(0, uses.index)
        .split(/[.,;:]/)
        .pop(),
    )
  ) {
    return toNum(uses[1]);
  }
  return null;
}

function parseComponent(routineText) {
  const each = /uses\s+(\d+|one|two|three|four|five|six)\s+of\s+the\s+[\w'’ ]*?actions/i.exec(
    routineText,
  );
  const noun =
    /every\s+disabled(?:\s+or\s+destroyed)?\s+(\w+)/i.exec(routineText) ??
    /each\s+(?:of\s+the\s+)?(\w+?)s?\s+uses/i.exec(routineText);
  if (!each || !noun) return null;
  return { name: noun[1].toLowerCase(), actionsEach: toNum(each[1]) ?? 0 };
}

export function draftPlan(source) {
  const name = source?.name ?? 'Hazard';
  const warnings = [];
  try {
    const details = source.system.details;
    const plan = basePlan(name);
    const routineText = stripHtml(details.routine);
    const rawDisable = String(details.disable ?? '');

    const apt = parseActionsPerTurn(routineText, String(details.routine ?? ''));
    if (details.isComplex) {
      if (apt) plan.actionsPerTurn = apt;
      // No routine text at all (the hazard only reacts): nothing to find, nothing to warn about.
      else if (routineText) warnings.push('actions-per-turn-missing');
    }

    const component = plan.components[0];
    const named = details.isComplex ? parseComponent(routineText) : null;
    if (named) {
      component.name = named.name;
      component.actionsEach = named.actionsEach;
      warnings.push('component-count-unknown');
    }

    let disableText = flatten(rawDisable);
    let checks = parseInlineChecks(rawDisable).filter((c) => isDisableOption(disableText, c));
    if (!checks.length) {
      disableText = stripHtml(rawDisable);
      checks = parsePlainChecks(disableText);
    }
    const joined = (i) => isConnectorOnly(disableText.slice(checks[i].end, checks[i + 1].index));
    // "@Check[arcana] or @Check[occultism|dc:17]": the alternative carries the DC.
    for (let i = checks.length - 2; i >= 0; i--) {
      if (checks[i].dc == null && joined(i)) checks[i].dc = checks[i + 1].dc;
    }
    for (let i = 1; i < checks.length; i++) {
      if (checks[i].dc == null && joined(i - 1)) checks[i].dc = checks[i - 1].dc;
    }

    const successes = successesFor(disableText, checks);
    const ranks = ranksFor(disableText, checks);
    const counts = successes.counts;
    const requirements = successRequirements(disableText, checks, joined);
    // "@Check[a] or @Check[b] twice", or one check naming several skills "three times": the
    // alternatives earn those successes between them.
    for (let start = 0; start < checks.length;) {
      let end = start;
      while (end < checks.length - 1 && joined(end)) end++;
      const run = Array.from({ length: end - start + 1 }, (_, k) => start + k);
      const n = counts[end];
      const together = run.some(
        (i) => successes.inferred[i] || (i > start && checks[i].index === checks[i - 1].index),
      );
      if (run.length > 1 && n > 1 && together && run.every((i) => counts[i] === n)) {
        for (const i of run) counts[i] = 1;
        requirements.unshift({ n, group: run });
      }
      start = end + 1;
    }
    // In reading order, so group letters follow the text.
    requirements.sort((a, b) => a.group[0] - b.group[0]);

    // One option → it needs N. Every option → one shared total. Some of several → a group.
    let shared = checks.length > 1 ? parseSharedSuccesses(stripHtml(rawDisable)) : null;
    const groups = checks.map(() => null);
    let groupCount = 0;
    for (const { n, group } of requirements) {
      if (!n || n < 2) continue;
      if (group.length > 1 && group.length === checks.length) {
        if (shared == null && counts.every((c) => c === 1)) shared = n;
        continue;
      }
      if (shared != null || group.some((i) => counts[i] !== 1 || groups[i])) continue;
      for (const i of group) counts[i] = n;
      if (group.length > 1) {
        const id = String.fromCharCode(65 + groupCount++);
        for (const i of group) groups[i] = id;
      }
    }

    checks.forEach((c, i) => {
      component.disables.push({
        id: `d${i + 1}`,
        skill: c.skill,
        dc: c.dc,
        label: c.label.replace(PROFICIENCY_RE, '').trim() || c.skill,
        traits: c.traits,
        successesNeeded: counts[i],
        group: groups[i],
        minRank: ranks[i],
      });
    });
    if (!checks.length) warnings.push('no-disables');
    if (shared != null) component.sharedSuccesses = shared;
    if (shared != null || groups.some(Boolean)) warnings.push('shared-successes');

    component.counteract = parseCounteracts(rawDisable)[0] ?? null;

    const items = Array.isArray(source.items) ? source.items : [];
    const isReaction = (i) => i.type === 'action' && i.system?.actionType?.value === 'reaction';
    plan.reactionItemId = items.find(isReaction)?._id ?? null;
    const isPassive = (i) => i.type === 'action' && i.system?.actionType?.value === 'passive';
    plan.routineItemIds = items
      .filter((i) => (i.type === 'melee' || i.type === 'action') && !isReaction(i) && !isPassive(i))
      .map((i) => i._id);
    plan.resetText = stripHtml(details.reset);
    return { plan, warnings };
  } catch {
    return { plan: basePlan(name), warnings: [...warnings, 'parse-error'] };
  }
}
