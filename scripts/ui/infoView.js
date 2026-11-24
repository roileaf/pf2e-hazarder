const SAVES = ['fortitude', 'reflex', 'will'];
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const t = (key) => game.i18n.localize(`PF2E_HAZARDER.Info.${key}`);

function traitLabel(slug) {
  const key = globalThis.CONFIG?.PF2E?.hazardTraits?.[slug];
  if (key) return game.i18n.localize(key);
  return String(slug)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function saveMod(actor, save) {
  const mod = actor.saves?.[save]?.mod;
  if (Number.isFinite(mod)) return mod;
  // A hazard has only the saves its stat block lists; 0 here means "none", not "+0".
  const raw = actor.system?.saves?.[save]?.value;
  return actor.saves == null && Number.isFinite(raw) && raw !== 0 ? raw : null;
}

// pf2e gives each immunity/weakness/resistance a ready label ("fire 5"); older data only has type.
const iwrText = (list) =>
  (list ?? [])
    .map((e) => e.label ?? [e.type, e.value].filter((v) => v != null && v !== '').join(' '))
    .filter(Boolean)
    .join(', ');

/**
 * What a GM otherwise opens the hazard sheet for: defenses in one line, then the prose (how it is
 * found, disabled and reset) behind a fold. The `*Html` fields are already enriched.
 * `liveHp` shows current hit points too; leave it off where the card is not refreshed on damage.
 */
export function buildInfoView(
  actor,
  { liveHp = false, disableHtml = '', resetHtml = '', descriptionHtml = '', stealthHtml = '' } = {},
) {
  const a = actor?.system?.attributes ?? {};
  const defenses = [];
  if (a.ac?.value) defenses.push({ label: t('AC'), value: String(a.ac.value) });
  const saves = SAVES.map((save) => ({ save, mod: saveMod(actor, save) })).filter(
    (s) => s.mod != null,
  );
  // A hazard with no stat block (no AC, no HP) stores every save as 0: that is "none", not "+0".
  const statless = !a.ac?.value && !a.hp?.max && saves.every((s) => s.mod === 0);
  if (!statless) {
    for (const { save, mod } of saves) {
      defenses.push({ label: t(`Save.${save}`), value: signed(mod) });
    }
  }
  if (a.hardness) defenses.push({ label: t('Hardness'), value: String(a.hardness) });
  if (a.hp?.max) {
    const bt = a.hp.brokenThreshold ?? Math.floor(a.hp.max / 2);
    const hp = liveHp && a.hp.value !== a.hp.max ? `${a.hp.value}/${a.hp.max}` : `${a.hp.max}`;
    defenses.push({ label: t('HP'), value: hp }, { label: t('BT'), value: String(bt) });
  }

  const iwr = [
    { label: t('Immunities'), value: iwrText(a.immunities) },
    { label: t('Weaknesses'), value: iwrText(a.weaknesses) },
    { label: t('Resistances'), value: iwrText(a.resistances) },
  ].filter((e) => e.value);
  if (a.hp?.details) iwr.push({ label: t('HpNotes'), value: String(a.hp.details) });

  const stealthMod = a.stealth?.value;
  const stealthDc = a.stealth?.dc ?? (Number.isFinite(stealthMod) ? stealthMod + 10 : null);
  const stealth = Number.isFinite(stealthMod)
    ? `${signed(stealthMod)} (${game.i18n.format('PF2E_HAZARDER.Tracker.DC', { dc: stealthDc })})`
    : null;

  const level = actor?.level ?? actor?.system?.details?.level?.value;
  const traits = (actor?.system?.traits?.value ?? []).map(traitLabel);
  const meta = [
    Number.isFinite(level) ? game.i18n.format('PF2E_HAZARDER.Info.Level', { level }) : null,
    ...traits,
  ]
    .filter(Boolean)
    .join(' · ');

  const sections = [
    { label: t('Description'), html: descriptionHtml },
    { label: t('Disable'), html: disableHtml },
    { label: t('Reset'), html: resetHtml },
  ].filter((s) => String(s.html ?? '').trim());

  // What still shows with the block folded: the two numbers a GM is asked for most.
  const brief = [a.ac?.value ? `${t('AC')} ${a.ac.value}` : null]
    .concat(a.hp?.max ? `${t('HP')} ${defenses.find((d) => d.label === t('HP')).value}` : null)
    .filter(Boolean)
    .join(' · ');

  return {
    brief: brief || null,
    defenses,
    iwr,
    meta: meta || null,
    stealth,
    stealthHtml: String(stealthHtml ?? '').trim() || null,
    sections,
    hasDetails: !!(meta || stealth || sections.length),
    empty: !defenses.length && !iwr.length && !meta && !stealth && !sections.length,
  };
}
