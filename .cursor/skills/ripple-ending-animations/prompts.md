# Ripple ending animation prompts

Copy one block into a Cursor chat (or say: use `ripple-ending-animations` for `<ending>`).

Every block assumes you already follow `.cursor/rules/natural-motion.mdc` and `.cursor/rules/endings-softlocks.mdc`.

Shared footer (each prompt already includes these requirements):

1. Read the ending’s begin/update/draw symbols in `main.js` first
2. Story beat list that a no-context viewer would understand from animation alone
3. Natural motion only: ease/steer, capped speed, no teleports, no snapping limbs to goals, grow/fade over time
4. Real contact where the story needs contact
5. Softlock-safe under 25s; shorten dead air rather than raise cap unless absolutely necessary
6. Visual audit via screenshots/CDP; fix until description matches intent
7. Bump `main.js?v=`; do not commit unless asked

---

## POV lunge

```
Upgrade Ripple's POV lunge ending animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: beginPovAttack, updatePovAttack, drawPovAttack, and how povAttack interacts with fish draw skips / resetPond.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: predator notices the lens, builds a swimming approach (not a pop-in), mouth and body loom with lag, water wake and wash intensify, choke/close on the viewer, pond returns cleanly.
3. Natural motion only: ease/steer with capped surge (keep easeToward/bankToward style), loom and mouth must ease toward goals (no hard scale snaps), no teleporting the fish to center, no assigning limb or jaw poses to final goals each frame, grow/fade wash over time.
4. Real contact: the predator must visibly reach the lens before the choke reads as "eaten the camera." Distance should drive loom; do not fake contact with overlay alone while the fish is still far away.
5. Softlock-safe under 25s: keep t, wall0, tickFinaleClock, finaleOvertime or timed finish into resetPond. Shorten dead air rather than raise CONFIG.finaleMaxDuration.
6. Visual audit via screenshots/CDP at approach mid, near-contact, and choke. Fix until frames match the beat list.
7. Bump main.js?v= in index.html. Do not commit unless asked. Do not edit personal user guides.
```

---

## Giant peace

```
Upgrade Ripple's giant peace ending animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: beginGiantEnding (kind peace), updateGiantEnding, drawGiantEnding, updateGiantBodyParts, drawGiantSeparatedAnatomy, drawGiantDebris, drawGiantCausticSpotlight, drawGiantBedReveal.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: huge hero fish orbits or glides toward center, body softens or parts separate gently, warm veil/wash rises, pond bed / caustic spotlight reveals, peaceful fade or restock curtain, life returns under a soft return if used.
3. Natural motion only: ease/steer orbit and center approach, lerp part offsets (never snap parts to final offsets), no teleport to center, no sudden size jumps, fade veil/wash gradually.
4. Real contact: the fish must arrive near center (or clearly complete its orbit) before the parting / bed-reveal spectacle peaks. Do not start the big reveal while the body is still mid-pond far from the beat's focus.
5. Softlock-safe under 25s: keep t, wall0, clock if multi-phase, tickFinaleClock, overtime finish that restocks and clears. Soft return may linger briefly after restock but must null out well under 25s. Shorten dead air rather than raise the cap.
6. Visual audit via screenshots/CDP for approach, part separation, bed reveal, and clear. Fix until frames match the beat list.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Giant shadow

```
Upgrade Ripple's giant shadow ending animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: beginGiantEnding (kind shadow), updateGiantEnding, drawGiantEnding, updateGiantBodyParts, drawGiantSeparatedAnatomy, drawGiantDebris, related vignette/wake helpers.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: monster giant darkens the pond, heavy approach or orbit, body cracks or sheds debris with weight, ominous wash, collapse or scatter, pond resets without a soft happy return.
3. Natural motion only: ease/steer, capped speed, debris and parts lerp outward (no pop), no teleport, no hard cut to black unless a deliberate flash beat, grow/fade overlays over time.
4. Real contact: shadow menace must feel grounded: body reaches the center focus before the crack/burst climax. Debris should birth from the body position, not spawn at random screen corners.
5. Softlock-safe under 25s: t, wall0, tickFinaleClock, overtime forces finish/clear. Prefer shorter menace holds over raising CONFIG.finaleMaxDuration.
6. Visual audit via screenshots/CDP for loom, crack, debris, and clear. Fix until frames match the beat list.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Hero remorse

```
Upgrade Ripple's hero remorse ending animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: beginHeroRemorseEnding, updateHeroRemorseEnding, drawHeroRemorseEnding, and how whaleRemorseDone / giantEnded gate other finales.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: whale-meal hero surges with regret energy, swims to center (not teleports), eyes or posture close/soften, pulse rings build, burst into one of every fish type, pond replenishes.
3. Natural motion only: orbit/easeToward center, bank turns, pulse and wash ease in, burst scale/alpha over time, no snap to center, no limb snap.
4. Real contact: hero must reach center proximity before the remorse burst. Rings and wash should peak at contact, not before the swim finishes.
5. Softlock-safe under 25s: keep wall0/t and overtime path that clears heroRemorseEnding and restocks. Shorten pause-before-burst dead air if needed.
6. Visual audit via screenshots/CDP at surge, center settle, eyes-close, and burst. Fix until frames match the beat list.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Rainbow exit

```
Upgrade Ripple's single-fish rainbow exit ending animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: Fish.beginRainbowExit, rainbowLeaving / rainbowPhase update paths, buildFishLogoPath / eggPath steering, updateRainbowTrail, drawRainbowTrail, CONFIG.rainbowExitErraticTime and rainbowExitMaxTime, wall clock via _rainbowExitWall0.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: fish goes rainbow, frantic zig-zag victory energy, settles into a readable logo or center path, rainbow trail paints the water, climax burst or leave, pond continues.
3. Natural motion only: steer along path points with capped speed (no jumping waypoint to waypoint), erratic phase uses turn rate not position teleport, trail drops follow the body, fade trail over time.
4. Real contact: the fish must physically travel the logo/path; the drawn trail must match where the fish swam. Do not stamp a finished logo while the fish teleports corners.
5. Softlock-safe under 25s: honor rainbowExitMaxTime and wall0 abort into a clean burst/clear. Shorten erratic or logo stall dead air rather than raise finaleMaxDuration.
6. Visual audit via screenshots/CDP for erratic, path writing mid, logo complete, and clear. Fix until frames match the beat list.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Rainbow duet

```
Upgrade Ripple's rainbow duet animation (paired rainbow exit). Make it more complex and intricate with zero jank.

1. Read first in main.js: tryBeginRainbowDuet, partner fields (_duetPartner), how beginRainbowExit calls it, and both fish rainbowLeaving update/draw paths plus trails.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: two rainbow fish acknowledge each other, weave or mirror without colliding through each other unnaturally, shared trail calligraphy, paired climax, both clear cleanly.
3. Natural motion only: each fish eases/steers; pairing uses pursuit or mirrored goals with capped speed; no teleporting partners together; no snapping paths.
4. Real contact: they must visibly meet or braid near each other at least once (readable duet moment) before the joint climax. Trails should show two authors, not one body with a fake second stroke.
5. Softlock-safe under 25s: both partners must clear under the same hard rules as rainbow exit; if one finishes early, the other must not softlock. Shorten dead air rather than raise the cap.
6. Visual audit via screenshots/CDP for meet, weave, dual trail, and clear. Fix until frames match the beat list.
7. Bump main.js?v= in index.html. Do not commit unless asked. Danger menu has a Rainbow duet button for repro.
```

---

## Rainbow ninja

```
Upgrade Ripple's rainbow ninja fight ending animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: beginRainbowNinjaFight, updateRainbowNinjaEnding, drawRainbowNinjaEnding, burstNinjaRainbowFish, rainbowNinjaCandidates, phase gather/fight/done fields.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: remaining rainbows gather, pair off for dashes and clashes, sparks/flashes on real near-misses or hits, one-by-one or staged bursts, pond repopulates.
3. Natural motion only: gather with easeToward, dashes with capped speed and bankToward, no teleport swaps, sparks spawn at clash points not random HUD corners, fade flashes over time.
4. Real contact: clashes require fighters to actually enter contact range before sparks/burst. Do not award hit FX while partners are across the pond.
5. Softlock-safe under 25s: keep clock, wall0, tickFinaleClock, overtime or t>=cap that bursts remaining fighters and clears rainbowNinjaEnding. Prefer tighter fight phases over raising the cap.
6. Visual audit via screenshots/CDP for gather, clash, mid-fight, and final burst. Fix until frames match the beat list.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Rainbow croc

```
Upgrade Ripple's rainbow crocodile/alligator finale animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: Reptile.turnToRainbow / rainbowFinale setup, updateRainbowReptileFinale, explodeRainbowReptile, draw paths while rainbowFinale is active.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: reptile goes rainbow, crazy swim thrash, steers to pond center, bursts into rainbow food scatter, reptile gone.
3. Natural motion only: crazy phase uses steering/speed modulation (already dir-based); center phase must easeToward/bankToward (no x/y assign to center); burst particles spawn from body; wake lerps away.
4. Real contact: burst only when near center (or after a visible center arrive). Do not explode while still thrashing at the edge unless overtime forces finish.
5. Softlock-safe under 25s: keep wall0, tickFinaleClock, overtime/clock abort into explodeRainbowReptile. Shorten crazy/center holds rather than raise the cap.
6. Visual audit via screenshots/CDP for thrash, center approach, and food burst. Fix until frames match the beat list.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Apex duel

```
Upgrade Ripple's apex duel (croc/alligator vs shark) ending animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: beginApexDuel, updateApexDuel, finishApexDuel, duelMode on Reptile and Shark, apexDuel / apexDuelPlayed flags, day-only gates.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: pond emptied energy, champ and shark square up, circling and lunges, real bite contacts with splash/HP feedback, decisive finish, finishApexDuel aftermath and restock path.
3. Natural motion only: chase/lunge with capped duel speeds, bank into turns, bite lunges ease in, no teleport face-offs, no HP bar pops without motion, fade duel overlays if any.
4. Real contact: bites and finish require bodies in range. Do not resolve the duel with offscreen HP drain. Shark and croc must visibly meet before the ending resolves.
5. Softlock-safe under 25s: apexDuel needs t, clock, wall0, tickFinaleClock, overtime must call finishApexDuel (never leave duelMode half-live). Shorten circling dead air rather than raise the cap.
6. Visual audit via screenshots/CDP for square-up, lunge contact, finish, and clear. Fix until frames match the beat list.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Croc helper trigger

```
Upgrade Ripple's croc helper-trigger ending path (wild croc/alligator eats a pacifist helper and ends early). Make it more complex and intricate with zero jank.

1. Read first in main.js: consumePacifistHelper with triggerCrocEnding, triggerCrocAlligatorEnding, findEdiblePacifistHelper, beginApexDuel/finishApexDuel interaction, apexDuelPlayed shark-respawn block. Also the short meal motion before the ending fires.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: wild reptile hunts a smaller helper, closes distance, real eat contact with splash/growth, early finale resolves (no endless shark meal loop), pond settles with apexDuelPlayed honored.
3. Natural motion only: hunt steer with capped speed, eat contact eased, growth via growApexFromMeal over time (no size pop), ending handoff without teleporting the champ.
4. Real contact: helper must be reached and consumed in-world before triggerCrocAlligatorEnding. Do not trigger the ending from a distant auto-kill.
5. Softlock-safe under 25s: early finish must clear duel/finale flags via finishApexDuel path; no half-live apexDuel. Keep under the same 25s wall. Shorten post-meal pause rather than raise the cap.
6. Visual audit via screenshots/CDP for chase, eat contact, ending resolve, and clear. Fix until frames match the beat list. Day mode only for this trigger.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Frog finale

```
Upgrade Ripple's frog finale animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: beginFrogFinale, updateFrogFinale, drawFrogGroups frogFinale branch, drawFrogModel, tadpole spawn (CONFIG.frogFinaleTadpoles), wake/wash fields.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: giant hero frog claims the pond, swell and hop/swim flourish, green wash, burst releasing tadpoles that swim outward, frog fades, pond continues.
3. Natural motion only: frog eases through flourish poses (no teleport hops to final points), size/alpha ease, tadpoles spawn at frog and swim with capped speed, wash fades over time.
4. Real contact: tadpoles must emit from the frog body at burst time; wash should center on the frog. Do not spawn tadpoles from screen edges while the frog is elsewhere.
5. Softlock-safe under 25s: keep clock/wall0 if multi-phase, tickFinaleClock, overtime nulls frogFinale. Prefer tighter flourish over raising the cap.
6. Visual audit via screenshots/CDP for flourish, burst, tadpole scatter, and clear. Fix until frames match the beat list.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Bullfrog feast

```
Upgrade Ripple's bullfrog feast ending animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: beginBullfrogFinale kind "feast", updateBullfrogFinale, finishBullfrogFinale, drawBullfrogModel / bullfrogFinale draw branch, meal count gates that call feast.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: bloated bullfrog dominates, heavy swallow or belly pulse, dark feast wash, collapse or leave after the feast climax, pond clears the finale flag.
3. Natural motion only: belly/jaw animation lerps, body eases (no snap scale), vignette fades, no teleport offscreen exit (steer or ease fade instead).
4. Real contact: feast climax should show the bullfrog physically present and pulsing at the action point; meal aftermath FX attach to its body.
5. Softlock-safe under 25s: bullfrogFinale uses t, clock, wall0, tickFinaleClock, overtime calls finishBullfrogFinale. Shorten feast holds rather than raise the cap.
6. Visual audit via screenshots/CDP for dominate, pulse/swallow, climax, and clear. Fix until frames match the beat list.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Bullfrog defeat

```
Upgrade Ripple's bullfrog defeat ending animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: beginBullfrogFinale kind "defeat", updateBullfrogFinale, finishBullfrogFinale, victor frog handling, draw branch for defeat.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: smaller bullfrog is overcome, hero frog engages, real contact struggle, bullfrog shrinks/fades or is bested, victor frog remains readable, finale clears.
3. Natural motion only: both creatures ease into the fight space, struggle offsets lerp, size/alpha change over time, no teleport swap of positions, no snap-kill pose.
4. Real contact: defeat requires frog and bullfrog to meet in range before the win pose. Do not resolve defeat while they are on opposite sides with only a vignette.
5. Softlock-safe under 25s: same clock/wall0/overtime finishBullfrogFinale path as feast. Shorten struggle dead air if needed.
6. Visual audit via screenshots/CDP for engage, contact struggle, victory, and clear. Fix until frames match the beat list.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Octopus-whale fight

```
Upgrade Ripple's octopus vs whale fight ending animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: beginOctopusWhaleFight, updateOctopusWhaleFight, drawOctopusWhaleFight, drawPirateShipSilhouette, phases approach/wrap/eat/ship/fade, tentacle helpers used during wrap.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: whale enters from flank, both meet at a shared point, tentacles wrap with real intersection, swallow/eat beat, pirate ship descends and latches, fade soft return or clear, pond restocks.
3. Natural motion only: approach with easeToward/bankToward, tentacle tips lerp toward latch points (never assign tips to goals each frame), shipY/shipAlpha ease, overlay fades, no teleports.
4. Real contact: whale must touch octopus before wrap advances; ship must latch (shipLatched) on the octopus/whale mass before the pull-away reads as success. Do not skip to ship while bodies are still approaching.
5. Softlock-safe under 25s: clock, wall0, tickFinaleClock, overtime restocks and clears octopusWhaleFight. Soft return after restock must null out well under 25s. Shorten phase pads rather than raise the cap.
6. Visual audit via screenshots/CDP for approach meet, wrap contact, eat, ship latch, and fade clear. Fix until frames match the beat list.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Orca feast

```
Upgrade Ripple's orca feast ending animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: beginOrcaFeastEnding, updateOrcaFeastEnding, drawOrcaFeastEnding, drawOrcaSpirit, night-mode assumptions.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: victor fish (after orca meal) coronates, night wash, orca spirit presence, orbit or rise to center, feast rings / spirit fade, pond returns.
3. Natural motion only: fish and spirit ease/steer, rings grow over time, alphas fade, no teleport coronation, no snap spirit to final pose.
4. Real contact: spirit and victor should share a readable meeting or center alignment before the fade climax. FX should attach to their positions.
5. Softlock-safe under 25s: keep t/wall0 and overtime clear of orcaFeastEnding. Shorten spirit linger rather than raise the cap.
6. Visual audit via screenshots/CDP for coronation, spirit meet, climax, and clear. Fix until frames match the beat list. Night mode on for repro.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Swordfish screen spear

```
Upgrade Ripple's swordfish screen-spear ending animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: beginSwordfishSpearEnding, updateSwordfishSpearEnding, drawSwordfishSpearEnding, approach/fade/liveAlpha fields, force option for audit.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: swordfish lines up off or on pond, accelerates with banking, bill aims at the viewer/screen, tip reaches the lens, impact wash, fade out, pond clears.
3. Natural motion only: approach eases with capped speed, aim uses bankToward, liveAlpha/fade over time, no teleport to tip-touch, no hard cut unless a deliberate impact flash that still fades.
4. Real contact: the bill tip must reach screen/lens proximity before impact FX. Do not fire the spear hit while the fish is still far mid-pond.
5. Softlock-safe under 25s: t/wall0/tickFinaleClock and overtime clear swordfishSpearEnding. Shorten wind-up rather than raise the cap.
6. Visual audit via screenshots/CDP for line-up, thrust mid, tip contact, and fade clear. Fix until frames match the beat list. Night mode on for repro.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Crystal prism

```
Upgrade Ripple's crystal prism shark ending animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: beginCrystalApexEnding("prism"), updateCrystalApexEnding, drawCrystalApexEnding, phases approach/bloom/shatter/fade, mote/shard/wake helpers. Crystal mode required.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: prism shark orbits or swims to center, arrives, bloom light builds only after arrival, shatter into shards/motes, soft fade, crystal pond restocks.
3. Natural motion only: orbitRad/Ang ease inward, actor steers (no teleport to cx,cy), bloom/rings ease, shards lerp outward, fade over time.
4. Real contact: actor must reach center before bloom/shatter spectacle (comment in code: spectacle waits until centered). Enforce that gate; do not bloom at the rim.
5. Softlock-safe under 25s: clock, wall0, tickFinaleClock, overtime restock/clear with keepCrystalEnding soft return that nulls under 25s. Shorten bloom hold rather than raise the cap.
6. Visual audit via screenshots/CDP for approach, center arrive, bloom, shatter, fade clear. Fix until frames match the beat list.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Crystal serpent

```
Upgrade Ripple's crystal serpent ending animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: beginCrystalApexEnding("serpent"), updateCrystalApexEnding, drawCrystalApexEnding, CrystalSerpent actor motion during the ending, shard/mote palette for serpent.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: serpent coils toward center with readable body travel, arrives, prismatic bloom, shatter, fade, restock.
3. Natural motion only: body/head ease along orbit inward, no segment teleport, limb/body follow lerp if segmented, grow/fade bloom, shards ease out.
4. Real contact: head/body mass reaches center before bloom/shatter. Coil must look like swimming, not a cutscene snap.
5. Softlock-safe under 25s: same crystal apex clock/wall0/overtime rules. Shorten dead air between arrive and bloom if needed.
6. Visual audit via screenshots/CDP for coil approach, center, bloom, shatter, clear. Fix until frames match the beat list. Crystal mode on.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Crystal mantle

```
Upgrade Ripple's crystal mantle ending animation. Make it more complex and intricate with zero jank.

1. Read first in main.js: beginCrystalApexEnding("mantle"), updateCrystalApexEnding, drawCrystalApexEnding, crystalMantle tentacle/wrap clearApexWrap during ending, mantle-colored motes.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: mantle drifts/steers to center, limbs settle (lerped), arrives, bloom, shatter, fade, restock.
3. Natural motion only: mantle body easeToward center, tentacle tips lerp to settle poses (never snap tips to goals), bloom/fade over time, shards ease outward.
4. Real contact: mantle body reaches center before bloom/shatter; limbs should read as reaching/settling on arrival, not popping into a final silhouette.
5. Softlock-safe under 25s: same crystal apex overtime restock/clear. Shorten settle time rather than raise the cap.
6. Visual audit via screenshots/CDP for drift, limb settle at center, bloom, shatter, clear. Fix until frames match the beat list. Crystal mode on.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```

---

## Glow swallow

```
Upgrade Ripple's shark glow-swallow gag (present in main.js / danger menu / runFinaleAudit busy check). Make it more complex and intricate with zero jank.

1. Read first in main.js: Shark glowSwallow fields, swallow start when only glow/platinum prey path, updateGlowSwallow, draw overrides while glowing, hold/deliver phases, release at center, leave.
2. Write a silent-story beat list a no-context viewer must understand from animation alone. Target beats: shark takes the last glow fish with a real gulp, glows while carrying, swims to center (not teleports), releases/poops the unharmed fish, shark leaves, pond continues.
3. Natural motion only: carry follow uses eased attachment (fish follows shark without hard snaps each frame beyond intentional swallow lock), center delivery easeToward, glow intensity eases up/down, leave steers offscreen.
4. Real contact: gulp requires prey in bite range; release happens at center proximity with a visible separation, not an instant relocate of the fish to mid-pond while the shark is elsewhere.
5. Softlock-safe under 25s: glowSwallow must clear (null) under the finale wall even if leave is slow; abort to release+leave+clear on overtime. Shorten hold phase rather than raise CONFIG.finaleMaxDuration. probeFinaleState busy check already watches shark.glowSwallow.
6. Visual audit via screenshots/CDP for gulp, glowing carry, center release, shark exit. Fix until frames match the beat list. Danger menu: Glow swallow.
7. Bump main.js?v= in index.html. Do not commit unless asked.
```
