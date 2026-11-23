# Changelog

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
