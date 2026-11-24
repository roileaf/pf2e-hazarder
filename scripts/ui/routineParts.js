import { parseInlineChecks, stripHtml } from '../parser/inline.js';

const SAVES = new Set(['fortitude', 'reflex', 'will']);
const PREFIX_RE =
  /^(\s*<p[^>]*>\s*)\(\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)[\s-]+actions?\s*(?:;\s*([^)]*))?\)\s*/i;
const OUTCOME_RE = /<p[^>]*>\s*<strong>\s*Critical Success/i;
const RULE_BEFORE_OUTCOME_RE = /<hr\s*\/?>\s*(?=<p[^>]*>\s*<strong>\s*Critical Success)/i;

const slug = (s) => s.trim().toLowerCase().replace(/\s+/g, '-');

/**
 * Split a hazard routine into its trait prefix, the description, and the
 * degree-of-success block, so the turn card can show them separately.
 */
export function splitRoutine(raw) {
  let html = String(raw ?? '');
  let traits = [];
  const prefix = PREFIX_RE.exec(html);
  if (prefix) {
    traits = prefix[2] ? prefix[2].split(',').map(slug).filter(Boolean) : [];
    html = prefix[1] + html.slice(prefix[0].length);
  }

  const rule = RULE_BEFORE_OUTCOME_RE.exec(html);
  const at = rule ? rule.index : html.search(OUTCOME_RE);
  if (at === -1) return { traits, intro: html.trim(), outcomes: null };
  const outcomesStart = rule ? rule.index + rule[0].length : at;
  return {
    traits,
    intro: html.slice(0, at).trim(),
    outcomes: html.slice(outcomesStart).trim(),
  };
}

/** Inline saving throws in the routine, deduplicated by their raw text. */
export function extractSaves(raw) {
  const text = String(raw ?? '');
  const seen = new Set();
  const saves = [];
  for (const c of parseInlineChecks(text)) {
    if (!SAVES.has(c.skill)) continue;
    const match = text.slice(c.index, c.end).replace(/\{[^}]*\}$/, '');
    if (seen.has(match)) continue;
    seen.add(match);
    saves.push({
      statistic: c.skill,
      dc: c.dc,
      basic: /\|\s*basic\s*(?:\||\])/.test(match),
      raw: match,
    });
  }
  return saves;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const END_OF_TURN_RE =
  /\bend of (?:its|the|each|their|every|that)\b[^.]*?\bturn\b|\bends its turn\b/i;

/**
 * What the routine says happens when the hazard's turn ends ("At the end of the haunt's turn, it
 * takes its Spectral Uprising reaction"): each such sentence with the abilities (`{ id, name }`)
 * it names, so they are one click away when the actions run out.
 */
export function endOfTurnNotes(routine, items = []) {
  return stripHtml(routine)
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => END_OF_TURN_RE.test(sentence))
    .map((text) => ({
      text,
      abilities: items
        .filter(({ name }) => {
          const n = String(name ?? '').trim();
          return n.length >= 4 && new RegExp(`\\b${escapeRegExp(n)}\\b`, 'i').test(text);
        })
        .map(({ id, name }) => ({ id, name })),
    }));
}

/** A reaction's trigger ("A creature enters the room"), from its description; null if it has none. */
export function triggerText(description) {
  const m = /^Trigger\s+(.+?)(?:\s+Effect\s|$)/.exec(stripHtml(description));
  return m ? m[1].trim() : null;
}

/**
 * The abilities to use when the turn ends: every one `notes` (see `endOfTurnNotes`) names, once
 * each, in order, minus those already used this turn (`usedItemIds`).
 */
export function endOfTurnAbilityIds(notes, usedItemIds = []) {
  const used = new Set(usedItemIds);
  const ids = [];
  for (const note of notes ?? []) {
    for (const { id } of note.abilities ?? []) {
      if (!used.has(id) && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}
