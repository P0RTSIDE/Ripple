---
name: ripple-ending-animations
description: >-
  Improves Ripple pond ending finales with complex, jank-free natural motion.
  Use when the user asks to upgrade ending animations, polish finales, fix ending
  teleports or softlocks, or invokes ripple-ending-animations / ending animation
  prompts. Covers POV lunge, giant peace/shadow, hero remorse, rainbow exit/duet/ninja,
  rainbow croc, apex duel, croc helper, frog/bullfrog, octopus-whale, orca feast,
  swordfish spear, crystal prism/serpent/mantle, and glow swallow.
disable-model-invocation: true
---

# Ripple ending animations

Upgrade one Ripple ending at a time with richer motion that stays softlock-safe and natural.

Read project rules first:
- `.cursor/rules/natural-motion.mdc`
- `.cursor/rules/endings-softlocks.mdc`
- `AGENTS.md` (finale symbols, audit helpers)

Copy-paste prompts live in [prompts.md](prompts.md). Do not invent endings; only edit symbols that exist in `main.js`.

## How to use

1. User names an ending (or pastes a prompt block from `prompts.md`).
2. You follow the **Master checklist** below, then that ending’s prompt block.
3. Ship JS only: bump `main.js?v=` in `index.html`. Do not commit unless asked. Do not touch personal `docs/ripple-user-guide.*`.

## Master checklist

Copy and track:

```
Ending polish:
- [ ] 1. Read begin/update/draw (and related helpers) for this ending in main.js
- [ ] 2. Write a silent-story beat list a no-context viewer would understand from animation alone
- [ ] 3. Natural motion only: ease/steer, capped speed, no teleports, no limb snap-to-goal, grow/fade over time
- [ ] 4. Real contact where the story needs contact (bodies meet, latch, center reach before spectacle)
- [ ] 5. Softlock-safe under 25s (t + clock + wall0 + tickFinaleClock + finaleOvertime finish path); shorten dead air, do not raise CONFIG.finaleMaxDuration unless absolutely necessary
- [ ] 6. Visual audit via screenshots/CDP; fix until frames match the beat list
- [ ] 7. Bump main.js?v= in index.html; do not commit unless asked
```

### Hard constraints (every ending)

- Prefer `easeToward`, `bankToward`, `finaleEase`, `1 - Math.exp(-k * dt)`, or a max step per second. Never assign `x/y` or limb tips straight to the goal.
- Multi-phase states need `t`, `clock`, `wall0`, `tickFinaleClock` each update, and overtime that forces the normal finish (burst / `finishApexDuel` / `resetPond` / clear flag). Soft return fades must null out well under 25s.
- Prefer shortening spectacle or dead air over raising the 25s cap.
- User-facing product copy: plain language, no em dashes or en dashes, no code or file paths in UI strings.
- After changes, prefer `await runFinaleAudit({ pad: 3 })` when a pond page is available; expect `passed: true` and every result under 25s. Danger menu keyword: `devcodefartgoblin`.

### Shared helpers to reuse

| Need | Prefer |
| --- | --- |
| Clock / overtime | `tickFinaleClock`, `finaleOvertime`, `finaleMaxSeconds`, `watchdogFinaleSoftlocks` |
| Wake / vignette | `pushFinaleWake`, `updateFinaleWake`, `drawFinaleWake`, `drawFinaleVignette` |
| Steer | `easeToward`, `bankToward`, `finaleEase` |
| Probe / audit | `probeFinaleState`, `runFinaleAudit`, `devClearFinales` |

## Ending index

| Ending | State / entry | Prompt |
| --- | --- | --- |
| POV lunge | `povAttack`, `beginPovAttack` | [prompts.md#pov-lunge](prompts.md#pov-lunge) |
| Giant peace | `giantEnding` kind `peace`, `beginGiantEnding` | [prompts.md#giant-peace](prompts.md#giant-peace) |
| Giant shadow | `giantEnding` kind `shadow`, `beginGiantEnding` | [prompts.md#giant-shadow](prompts.md#giant-shadow) |
| Hero remorse | `heroRemorseEnding`, `beginHeroRemorseEnding` | [prompts.md#hero-remorse](prompts.md#hero-remorse) |
| Rainbow exit | `Fish.beginRainbowExit`, `rainbowLeaving` | [prompts.md#rainbow-exit](prompts.md#rainbow-exit) |
| Rainbow duet | `tryBeginRainbowDuet` (pairs with exit) | [prompts.md#rainbow-duet](prompts.md#rainbow-duet) |
| Rainbow ninja | `rainbowNinjaEnding`, `beginRainbowNinjaFight` | [prompts.md#rainbow-ninja](prompts.md#rainbow-ninja) |
| Rainbow croc | `Reptile.rainbowFinale`, `updateRainbowReptileFinale` | [prompts.md#rainbow-croc](prompts.md#rainbow-croc) |
| Apex duel | `apexDuel`, `beginApexDuel` | [prompts.md#apex-duel](prompts.md#apex-duel) |
| Croc helper trigger | `triggerCrocAlligatorEnding` via helper meal | [prompts.md#croc-helper-trigger](prompts.md#croc-helper-trigger) |
| Frog finale | `frogFinale`, `beginFrogFinale` | [prompts.md#frog-finale](prompts.md#frog-finale) |
| Bullfrog feast | `bullfrogFinale` kind `feast` | [prompts.md#bullfrog-feast](prompts.md#bullfrog-feast) |
| Bullfrog defeat | `bullfrogFinale` kind `defeat` | [prompts.md#bullfrog-defeat](prompts.md#bullfrog-defeat) |
| Octopus-whale fight | `octopusWhaleFight`, `beginOctopusWhaleFight` | [prompts.md#octopus-whale-fight](prompts.md#octopus-whale-fight) |
| Orca feast | `orcaFeastEnding`, `beginOrcaFeastEnding` | [prompts.md#orca-feast](prompts.md#orca-feast) |
| Swordfish screen spear | `swordfishSpearEnding`, `beginSwordfishSpearEnding` | [prompts.md#swordfish-screen-spear](prompts.md#swordfish-screen-spear) |
| Crystal prism | `crystalApexEnding` kind `prism` | [prompts.md#crystal-prism](prompts.md#crystal-prism) |
| Crystal serpent | `crystalApexEnding` kind `serpent` | [prompts.md#crystal-serpent](prompts.md#crystal-serpent) |
| Crystal mantle | `crystalApexEnding` kind `mantle` | [prompts.md#crystal-mantle](prompts.md#crystal-mantle) |
| Glow swallow | `Shark.glowSwallow`, `updateGlowSwallow` | [prompts.md#glow-swallow](prompts.md#glow-swallow) |

## Workflow

1. Confirm the ending exists in `main.js` / `probeFinaleState` / `runFinaleAudit` (glow swallow is audited via `shark.glowSwallow`).
2. Open the matching prompt in `prompts.md` and execute it as the user instruction.
3. Implement motion upgrades only for that ending unless the user asked for a batch.
4. Visually audit, then bump cache query. Stop. Do not commit unless asked.
