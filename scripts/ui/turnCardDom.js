/** Spent count after clicking diamond `index`: spend up to it, or refund it if it was the last spent. */
export function nextSpent(current, index) {
  return current === index + 1 ? index : index + 1;
}

/**
 * Apply per-message turn-card state (spent actions, collapsed) to rendered HTML.
 * The state lives in message flags so the card content itself never has to be re-rendered.
 */
export function decorateTurnCard(root, { spent = 0, collapsed = false } = {}) {
  const card = root.querySelector('.hazarder-card.hz-turn');
  if (!card) return;
  card.classList.toggle('hz-collapsed', !!collapsed);
  const pool = card.querySelector('.hz-pool');
  if (!pool) return;
  const pips = pool.querySelectorAll('[data-hz-action="spend"]');
  pips.forEach((pip) => pip.classList.toggle('used', Number(pip.dataset.index) < (spent ?? 0)));
  // Lock buttons that cost more actions than are left (free actions, reactions and damage
  // rolls carry no cost and stay usable). Clicking a diamond refunds an action.
  const left = Math.max(0, pips.length - (spent ?? 0));
  card.querySelectorAll('button[data-cost]').forEach((btn) => {
    btn.disabled = Number(btn.dataset.cost) > left;
  });
  const counter = pool.querySelector('.hz-used');
  if (counter) {
    counter.textContent = game.i18n.format('PF2E_HAZARDER.Turn.ActionsLeft', {
      left,
      total: pips.length,
    });
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function chip(className, action, data, label, icon) {
  const button = el('button', `hz-chip ${className}`.trim());
  button.type = 'button';
  button.dataset.hzAction = action;
  for (const [key, value] of Object.entries(data)) if (value != null) button.dataset[key] = value;
  if (icon) button.append(el('i', icon), ' ');
  button.append(label);
  return button;
}

/**
 * Fill the turn card's log with what the hazard has rolled this turn (`turnLogRows`): one row per
 * Strike (target, outcome, the damage roll it is owed, what a hit brings with it) and per save
 * made against it. Like the spent actions, it is drawn at render time, never stored in the card.
 */
export function decorateTurnLog(root, rows = []) {
  const card = root.querySelector('.hazarder-card.hz-turn');
  if (!card) return;
  let log = card.querySelector('.hz-turnlog');
  if (!log) {
    // A card posted before the log existed: it goes under the Strikes.
    log = el('div', 'hz-turnlog');
    const strikes = card.querySelectorAll('.hz-strike');
    if (strikes.length) strikes[strikes.length - 1].after(log);
    else (card.querySelector('.hz-body') ?? card).append(log);
  }
  log.replaceChildren();
  log.hidden = !rows.length;
  const t = (key) => game.i18n.localize(`PF2E_HAZARDER.Turn.${key}`);
  for (const row of rows) {
    const line = el('div', 'hz-log-row');
    if (row.outcome) line.classList.add(`hz-outcome-${row.outcome}`);
    if (row.save) line.classList.add('hz-log-save');
    if (row.owed) line.classList.add('hz-log-owed');
    const what = el('span', 'hz-log-what');
    what.append(
      el('i', row.save ? 'fa-solid fa-shield-halved' : 'fa-solid fa-hand-fist'),
      ' ',
      el('strong', null, row.name),
    );
    if (row.what) what.append(` ${row.what}`);
    if (row.target)
      what.append(' ', el('i', 'fa-solid fa-arrow-right hz-log-arrow'), ` ${row.target}`);
    line.append(what);
    if (row.outcomeLabel) line.append(el('span', 'hz-log-outcome', row.outcomeLabel));
    if (row.owed) {
      line.append(
        chip(
          'hz-owed',
          'log-damage',
          { itemId: row.itemId, targetUuid: row.targetUuid, critical: row.critical ? '1' : null },
          t(row.critical ? 'RollCritical' : 'RollDamage'),
          'fa-solid fa-burst',
        ),
      );
    }
    if (row.done) {
      const check = el('i', 'fa-solid fa-check hz-log-done');
      check.dataset.tooltip = t('DamageRolled');
      line.append(check);
    }
    if (row.followUps?.length) {
      const follow = el('span', 'hz-log-follow', `${t('Then')} `);
      for (const f of row.followUps) follow.append(chip('', 'item', { itemId: f.id }, f.name));
      line.append(follow);
    }
    log.append(line);
  }
}
