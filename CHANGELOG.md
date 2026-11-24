# Changelog

## 0.1.9 (prerelease)

- **Run a hazard without an encounter:** two GM buttons on a hazard token's HUD. "Trigger" sets the hazard off and posts its reaction, with the abilities it names and its Strike prompt; for a simple trap that is the whole hazard. "Post the disable tracker" puts the tracker in chat while the hazard stays armed, so the party can try to disable it first.
- **Damage, broken and destroyed:** the GM's tracker shows the hazard's current hit points and follows damage and repairs. When damage takes a tracked hazard to its Broken Threshold, or to 0 HP, the GM is asked whether that disables it.
- **Mark a part destroyed:** each part on the GM's tracker has a toggle to mark it destroyed or disabled outright, or to put it back, without clicking success pips.
- **The sheet's key info on the cards (GM only):** the hazard's turn card and the GM's view of the disable tracker now show its defenses in one line (AC, saves, Hardness, HP and Broken Threshold) with immunities, weaknesses and resistances, and a "Details" fold with its level and traits, Stealth, description, the full disable text and the reset. The turn card shows current hit points once the hazard is damaged.

## 0.1.8 (prerelease)

- **The reaction's Strike, aimed and rolled:** when a posted reaction calls for a Strike ("…makes a spear Strike against the triggering creature"), the GM is asked who it targets and the Strike is rolled against that creature. The list offers the GM's current target first, then player characters, then others in the fight. Choosing "Later", or having the hazard on a scene the GM isn't viewing, posts a GM-only card with the Strike's attack, damage and critical buttons instead.

## 0.1.7 (prerelease)

- **A posted reaction brings the abilities it names:** when a hazard's reaction is posted (entering an encounter, or after a critical failure) and its text names another of the hazard's abilities ("…exposing the creature to the haunt's burn knowledge effect"), that ability is posted right after it, with its description and saves. Before, it only appeared on the hazard's own turn.

## 0.1.6 (prerelease)

- **Trigger reaction when a hazard enters an encounter:** a complex hazard uses its reaction when triggered, then rolls initiative. When combat starts with a hazard in it, or a hazard joins a running combat, the GM is asked whether to post that reaction. It is offered once until the hazard is reset, and not again if it was already posted after a critical failure. New world setting: ask (default), always post, or never.

## 0.1.5 (prerelease)

- **Turn card lists every ability:** passive abilities now appear (with their description and save buttons) and cost no actions; ticking one under "Shown on the turn card" in the plan used to do nothing. Reactions that fire during the fight (when the hazard breaks, when a disable fails) are listed too. The reaction that starts the hazard ("…rolls initiative") stays out by default and is the one offered on a critical failure, even when it isn't the hazard's first reaction.
- **API for other modules:** `hazards()`, `hazard(tokenDoc)`, `canAttempt(actor, option)` and `rollDisable({ …, actor, rollParams })` expose tracked hazards, their open disable options and a way to roll one as a given actor. See the README.

## 0.1.4 (prerelease)

- **Success groups:** some of a hazard's disable options can earn their successes together while others stand alone (e.g. "Three Nature or Occultism checks, or one Religion check"). Detected from the disable text, shown on the tracker as "1 / 3 successes between Nature / Occultism", and editable in the plan with a group letter per option.
- "Thievery or Athletics twice" is now read as two successes between the two skills, not two with each.

## 0.1.3 (prerelease)

- **Parser audit against every compendium hazard:**
  - Stated success counts without "any combination" ("three successes are required to disable the haunt", "Three Thievery checks to…", "(requires two successes)") now set the option's successes, or a shared total when they cover every option.
  - Checks written as `[[/act disable-device dc=27]]`, as plain text ("Thievery (expert) DC 20"), or naming several skills in one check are recognised; misnamed skills and Lores are corrected; a check with no DC takes its alternative's.
  - Saving throws and flat checks that are consequences, not ways to disable, are no longer listed as disable options. A save that is a real option now counts when rolled.
  - Counteracts written without a spell link are picked up, and "level" is read like "rank".
  - Actions per turn are read from action glyphs, "(1 to 3 actions)" and "uses its 3 actions" wordings.
- The proficiency warning names the skill ("Occultism"), and the picker no longer repeats a single hazard's name.

## 0.1.2 (prerelease)

- **Proficiency requirements:** disable options marked "(trained)", "(expert)", "(master)" or "(legendary)" record a minimum rank, shown as a badge on the tracker and editable in the plan. Under-ranked characters can't roll from the tracker, and under-ranked rolls from chat are not counted (a warning tells the GM). Toggle with the "Enforce proficiency requirements" setting (on by default).

## 0.1.1 (prerelease)

- **"Any combination" disables:** a component can require N successes across all its disable options combined (e.g. three Occultism or Religion successes in any mix). Detected from the disable text and editable in the plan as "Successes in any combination". The tracker shows the shared total.

## 0.1.0 (prerelease)

First release.

- **Hazard plans:** routine and disable text parsed into actions per turn, components, disable options and counteracts; the GM reviews only when something was flagged.
- **GM turn card:** remaining actions as PF2e action glyphs, the routine, actions with descriptions, traits and save buttons, and Strike buttons; actions are spent automatically and spent-out buttons lock.
- **Combat tracker:** the hazard's remaining actions on its row in the core and PF2e HUD trackers — click to spend or refund.
- **Disable tracker:** a chat card per hazard token with per-component progress, posted at combat start; players roll from the card, results are matched automatically, and DCs respect PF2e's metagame setting.
- **States:** armed, triggered, active, disabled, reset — with a reaction prompt on critical failures and optional skipping or removal of disabled hazards.
- **PF2e Toolbelt:** save requests carry Target Helper targets.
