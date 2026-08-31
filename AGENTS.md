# Ripple agent notes

Ripple is a single-page pond sim. Almost all gameplay lives in `main.js` with shell UI in `index.html` / `style.css`.

## Layout

- `main.js`: fish, apex, helpers, finales, ecosystem, danger menu, draw loop
- `guide.js`: guide gate and open/close only; written guide copy lives in `index.html`
- `index.html`: canvas + menus + guide sheet; bump cache queries when shipping JS/CSS changes
- `.cursor/rules/`: persistent agent rules (motion, finales, helpers)
- `docs/ripple-user-guide.*`: personal notes. Do not commit or push these

## UI chrome corners

- Top-left: user guide button (always reachable)
- Top-right: mode toggle and hide-menus toggle
- Bottom-left: pond looks / window tools
- Bottom-right: food stash

## Modes

- Day: crocs/alligators, day shark, helpers
- Night: orca, swordfish, octopus, night fish
- Crystal: prism shark, crystal serpent, crystal mantle

## Key systems (search these names)

| Topic | Symbols |
| --- | --- |
| Helpers | `pacifistVisitors`, `PacifistVisitor`, `findEdiblePacifistHelper`, `consumePacifistHelper` |
| Apex growth | `growApexFromMeal` |
| Croc finale | `beginApexDuel`, `finishApexDuel`, `triggerCrocAlligatorEnding`, `apexDuelPlayed` |
| Frog / bullfrog | `beginFrogFinale`, `beginBullfrogFinale`, `bullfrog`, `bullfrogFinale` |
| Finale lockout | `pondFinaleActive`, `finaleMaxSeconds`, `finaleOvertime`, `watchdogFinaleSoftlocks` |
| Ending audit | `runFinaleAudit`, `probeFinaleState` |
| Registry | `registrySeen`, `noteRegistryEncounter`, `getRegistryCatalog`, `REGISTRY_ELEMENT_META`, `noteDrawnPondElements` |
| Danger menu | type `devcodefartgoblin`, `buildDevMenu`, `devClearFinales` |

## Hard product rules

1. No ending may softlock. Wall clock hard cap is `CONFIG.finaleMaxDuration` (25s), enforced by `finaleOvertime` plus `watchdogFinaleSoftlocks`.
2. Natural motion only: ease/steer, no teleports (see `.cursor/rules/natural-motion.mdc`).
3. User-facing copy: plain language, no em/en dashes, no code/terminal instructions in the product UI.
4. After JS edits, bump the `main.js?v=` query in `index.html`.

## Open / recent intent

- Large evil pond fish should be able to eat pacifist helpers when they outsize them (same size gate idea as apex helper snacks). Not necessarily done unless `Fish` hunt paths call `findEdiblePacifistHelper` / `consumePacifistHelper`.
- Wild crocs/gators eating a helper should trigger the croc ending early via `triggerCrocAlligatorEnding` (no shark respawn loop; `apexDuelPlayed` blocks that).
- Tamed/hero apex may eat helpers for growth only (`triggerCrocEnding: false`).

## Verify finales

In a running pond page (danger menu or console):

```js
await runFinaleAudit({ pad: 3 })
```

Expect `passed: true` and every result under 25 seconds.
