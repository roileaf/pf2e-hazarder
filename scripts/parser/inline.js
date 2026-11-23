const CHECK_RE = /@Check\[([^\]]+)\](?:\{([^}]*)\})?/g;
// "[[/act disable-device dc=27]]{DC 27 Thievery}": an action macro standing in for a check.
const ACT_RE = /\[\[\/act\s+([a-z-]+)([^\]]*)\]\](?:\{([^}]*)\})?/g;
const ACT_SKILLS = {
  'disable-device': { skill: 'thievery', trait: 'action:disable-a-device' },
  'force-open': { skill: 'athletics', trait: 'action:force-open' },
};
const COUNTERACT_RE = /@UUID\[(Compendium\.[^\]]*spells[^\]]*)\]\{([^}]*)\}\s*\(([^)]*)\)/g;
// "dispel magic (8th level; counteract DC 43)" written without a spell link.
const PLAIN_COUNTERACT_RE = /\b(dispel magic)\s*\(([^)]*counteract\s+DC\s+\d+[^)]*)\)/gi;

export function stripHtml(html) {
  if (html == null) return '';
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Devil Lore" / "HellLore" → "devil-lore" / "hell-lore"; well-formed slugs pass through. */
// Misnamed skills seen in published hazards.
const SKILL_ALIASES = { occult: 'occultism', engineering: 'engineering-lore' };
function slugify(type) {
  const slug = type
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/\s+/g, '-');
  return SKILL_ALIASES[slug] ?? slug;
}

/**
 * Inline checks in order of appearance. A check naming several skills ("arcana,nature") yields one
 * entry per skill at the same offsets.
 */
export function parseInlineChecks(html) {
  const out = [];
  if (!html) return out;
  const text = String(html);
  for (const m of text.matchAll(CHECK_RE)) {
    const parts = m[1].split('|');
    const params = {};
    const flags = [];
    parts.forEach((part, i) => {
      const colon = part.indexOf(':');
      if (i === 0 && colon === -1) {
        params.type = part.trim();
        return;
      }
      if (colon === -1) {
        flags.push(part.trim());
        return;
      }
      params[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
    });
    if (!params.type) continue;
    const dc = Number.parseInt(params.dc, 10);
    const types = params.type
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const written = params.name || (m[2] ? m[2].trim() : '');
    for (const type of types) {
      const skill = slugify(type);
      out.push({
        skill,
        dc: Number.isFinite(dc) ? dc : null,
        // An unslugged type ("Devil Lore") is its own best label.
        label: written || type,
        traits: params.traits
          ? params.traits
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        basic: flags.includes('basic'),
        options: params.options ?? '',
        index: m.index,
        end: m.index + m[0].length,
      });
    }
  }
  for (const m of text.matchAll(ACT_RE)) {
    const act = ACT_SKILLS[m[1]];
    if (!act) continue;
    const dc = /\bdc=(\d+)/.exec(m[2]);
    // Without a DC it only names the action of the check written before it.
    if (!dc) continue;
    out.push({
      skill: act.skill,
      dc: Number(dc[1]),
      label: act.skill,
      traits: [act.trait],
      basic: false,
      options: '',
      index: m.index,
      end: m.index + m[0].length,
    });
  }
  return out.sort((a, b) => a.index - b.index);
}

function counteractFrom(spellUuid, name, detail) {
  const rank = /(\d+)(?:st|nd|rd|th)\s+(?:rank|level)/i.exec(detail);
  const dc = /counteract\s+DC\s+(\d+)/i.exec(detail);
  return {
    spellUuid,
    name: name.trim(),
    rank: rank ? Number(rank[1]) : null,
    dc: dc ? Number(dc[1]) : null,
  };
}

export function parseCounteracts(html) {
  const out = [];
  if (!html) return out;
  const text = String(html);
  for (const m of text.matchAll(COUNTERACT_RE)) out.push(counteractFrom(m[1], m[2], m[3]));
  if (!out.length) {
    for (const m of stripHtml(text).matchAll(PLAIN_COUNTERACT_RE))
      out.push(counteractFrom(null, 'Dispel Magic', m[2]));
  }
  return out;
}
