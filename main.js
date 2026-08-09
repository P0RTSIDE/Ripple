/*
 * Ripple
 * -------
 * Two surfaces, one idea: the SOUND of each impact is derived from the same
 * physics that drive what you see.
 *
 *  - Pond mode: a real height-field water simulation. Waves propagate across a
 *    grid, reflect off the pond edges, and genuinely interfere and collide
 *    with one another. Throw rocks in (click, or drag to sling them across the
 *    water); each splash pushes the surface down and flings droplets that arc
 *    up and fall back, each making its own little ripple.
 *  - Window mode: rain-on-glass. Concentric rings with a downward trickle.
 *
 * A single `decay`/velocity value per impact feeds both the visuals and the
 * Web Audio graph, so the tone you hear "is" the ripple.
 *
 * Window/glass aesthetic inspired by SardineFish's raindrop-fx (MIT).
 * https://github.com/SardineFish/raindrop-fx
 *
 * No libraries, no audio files. Canvas for visuals, Web Audio for synthesis.
 */

"use strict";

// ---------------------------------------------------------------------------
// Global configuration
// ---------------------------------------------------------------------------
const CONFIG = {
    maxVoices: 24,          // cap on simultaneous audio voices
    freqMin: 150,           // lowest pitch a big/hard rock can produce (Hz)
    freqMax: 1100,          // highest pitch a light tap can produce (Hz)
    decaySlow: 0.5,         // decay constant for the biggest impacts (long tail)
    decayFast: 2.6,         // decay constant for the lightest taps (short tail)
    baseRadius: 14,         // starting radius of a window ripple (CSS px)
    maxExpansion: 520,      // extra radius a max-velocity window ripple travels
    harmonyRatios: [1, 4 / 3, 3 / 2, 2], // unison, fourth, fifth, octave
    harmonyRange: 260,      // px radius within which pitches quantize together
    harmonyLife: 2.6,       // seconds a tone stays "active" for harmony snapping
    maxRocks: 10,           // simultaneous rocks in flight
    maxDroplets: 260,       // splash droplet particle cap
    holdGrowTime: 1.3,      // seconds of holding to grow food to full size
    minCharge: 0.12,        // smallest normalized size from a quick tap
    fishCount: 14,          // fish the pond settles at when populated
    perception: 300,        // px within which a fish notices food
    maxFoods: 28,           // floating food pellets cap
    predatorSize: 40,       // size at which a well-fed fish turns predator
    maxFishSize: 170,       // high enough that heavy feeding can outgrow crocs
    sharkSize: 96,          // the shark's body length
    fleeRange: 210,         // px within which prey flee a predator/shark
    huntRange: 340,         // px within which a predator/shark spots prey
    repopInterval: 1.1,     // seconds between new fish swimming in
    fleeSpeedMult: 1.85,    // how much faster than cruising a fleeing fish is
    predatorChaseMult: 2.05,// predator chase: slightly faster than flee, so evil fish catch prey
    goldenChance: 0.03,     // chance a piece of food is the golden kind
    rainbowChance: 0.0035,  // even rarer: rainbow food (must stay below goldenChance)
    greenChance: 0.005,     // rare green food: turns a fish into a lasting pond plant
    pinkChance: 0.014,      // breeding food: turns a fish pink; two pink fish can spawn young
    growerChance: 0.007,    // rare grower food: surges a fish past normal size
    growerBoost: 44,        // size gained from one grower pellet
    growerMaxSize: 215,     // floor cap for grower / carcass; heroes & huge meals scale to ~half screen
    giantSizeFrac: 0.45,    // ending when size >= min(viewW, viewH) * this
    giantCapFrac: 0.5,      // grower/carcass (and hero) size ceiling vs shorter screen side
    goldSinkTime: 2.4,      // seconds for a golden fish to settle on the lakebed
    rainbowSpeed: 2.35,     // rainbow chase speed (kept moderate so tracking stays stable)
    predatorFoodBoost: 1.045, // each food bite makes an evil fish a bit faster
    predatorSpeedCap: 110,  // max baseSpeed an evil fish can reach from food
    whaleChance: 0.004,     // rare whale visit chance (checked every whaleInterval)
    whaleInterval: 10,      // seconds between whale chance rolls
    petsForRainbow: 15,     // hidden: pet this many times with no throws to force rainbow food
    petsToRedeem: 5,        // discrete pets that help soothe an evil fish
    evilSootheTime: 2.6,    // seconds of continuous petting to fully redeem an evil fish
    petsToTame: 30,         // discrete pets to tame a crocodile/alligator
    reptileSootheTime: 12,  // seconds of continuous petting that also helps tame
    reptileInterval: 60,    // seconds between crocodile/alligator chance rolls
    reptileChance: 0.18,    // chance a reptile arrives on each roll
    reptileSize: [88, 112], // croc/alligator body length range
    exoticInterval: 48,     // seconds between exotic visitor rolls (medium-rare)
    exoticChance: 0.32,     // much more common than crocs; still not every roll
    exoticEdgeChance: 0.14, // chance a repopulating fish is an exotic
    heroChance: 0.24,       // chance a new fish is a hero (hunts smaller predators)
    heroChaseMult: 2.1,     // hero chase: a bit faster than evil fish so they can catch them
    // After a whale eats a fish, a large hero may hunt it below full whale size.
    whaleHeroHuntFrac: 0.55,    // hero.size > whale.size * this
    whaleHeroHuntScreen: 0.28,  // or hero.size >= min(viewW, viewH) * this
    breedCooldown: 6.5,     // seconds before a pink pair can breed again
    maxBreedPop: 24,        // soft cap on living fish from breeding (above fishCount)
    foodStashMax: 14,       // pellets saved from the net (normal + specials)
    frogInterval: 42,       // seconds between frog spawn chance rolls
    frogChance: 0.38,       // chance a frog group arrives on each roll
    frogMaxGroups: 3,       // max frog+tadpole clusters on the bank
};

// Hidden streak: consecutive pets with no food thrown unlock a guaranteed rainbow pellet.
let petStreak = 0;
let guaranteeRainbow = false;

// Type a variant name (anywhere) to force that kind on the next food drop.
// When adding a new food variant: append its keyword here and handle it in applyFoodVariant.
// "breed" is an alias keyword for pink breeding food.
const FOOD_VARIANT_KEYWORDS = ["rainbow", "golden", "green", "grower", "pink", "breed"];
let nextFoodVariant = null;
let foodTypeBuffer = "";

function normalizeFoodVariant(variant) {
    if (variant === "breed") return "pink";
    return variant || null;
}

function applyFoodVariant(target, variant) {
    // Mutually exclusive specials: forcing pink (or any variant) clears the others.
    target.rainbow = false;
    target.green = false;
    target.golden = false;
    target.grower = false;
    target.pink = false;
    const v = normalizeFoodVariant(variant);
    if (!v || v === "normal" || v === "carcass") return v;
    if (v === "rainbow") target.rainbow = true;
    else if (v === "green") target.green = true;
    else if (v === "golden") target.golden = true;
    else if (v === "grower") target.grower = true;
    else if (v === "pink") target.pink = true;
    return v;
}

function isRareFoodFlags(f) {
    return !!(f && (f.golden || f.rainbow || f.green || f.grower || f.pink || f.carcass));
}

function foodVariantKey(f) {
    if (!f) return null;
    if (f.rainbow) return "rainbow";
    if (f.green) return "green";
    if (f.grower) return "grower";
    if (f.pink) return "pink";
    if (f.golden) return "golden";
    if (f.carcass) return "carcass";
    return "normal";
}

function consumeNextFoodVariant() {
    if (nextFoodVariant) {
        const v = normalizeFoodVariant(nextFoodVariant);
        nextFoodVariant = null;
        return v;
    }
    if (guaranteeRainbow) {
        guaranteeRainbow = false;
        return "rainbow";
    }
    return null;
}

// pickFoodVariant: keyword/guarantee force first, then cumulative rare rolls (pink is reachable).
function pickFoodVariant() {
    const forced = consumeNextFoodVariant();
    if (forced) return forced;
    const roll = Math.random();
    let edge = CONFIG.rainbowChance;
    if (roll < edge) return "rainbow";
    edge += CONFIG.greenChance;
    if (roll < edge) return "green";
    edge += CONFIG.growerChance;
    if (roll < edge) return "grower";
    edge += CONFIG.pinkChance;
    if (roll < edge) return "pink";
    edge += CONFIG.goldenChance;
    if (roll < edge) return "golden";
    return null;
}

function rollFoodVariant() {
    return pickFoodVariant();
}

function noteFoodVariantKeyword(ch) {
    if (!ch || ch.length !== 1) return;
    const letter = ch.toLowerCase();
    if (letter !== " " && (letter < "a" || letter > "z")) return;
    foodTypeBuffer = (foodTypeBuffer + letter).slice(-40);
    const compact = foodTypeBuffer.replace(/\s+/g, "");

    // Hidden fiesta: type "easter egg" (spaces optional, case ignored).
    if (compact.endsWith("easteregg") || foodTypeBuffer.trimEnd().endsWith("easter egg")) {
        foodTypeBuffer = "";
        beginMariachiFiesta();
        return;
    }

    // Hidden reptile: type "alligator" (spaces optional, case ignored).
    if (compact.endsWith("alligator")) {
        foodTypeBuffer = "";
        spawnKeywordAlligator();
        return;
    }

    let matched = null;
    for (const word of FOOD_VARIANT_KEYWORDS) {
        if (compact.endsWith(word)
            && (!matched || word.length > matched.length)) {
            matched = word;
        }
    }
    if (!matched) return;
    // Store the normalized variant so pink/breed force the next drop like rainbow/golden.
    nextFoodVariant = normalizeFoodVariant(matched);
    foodTypeBuffer = "";
    if (typeof Audio !== "undefined" && Audio.ensure) {
        Audio.ensure();
        if (nextFoodVariant === "rainbow" && Audio.rainbowChime) Audio.rainbowChime(0);
        else if (nextFoodVariant === "golden" && Audio.goldChime) Audio.goldChime(0);
        else if (nextFoodVariant === "pink" && Audio.playDrop) {
            Audio.playDrop({ freq: 460, decay: 1.0, velocity: 0.35, pan: 0, plunk: false });
        } else if (nextFoodVariant === "grower" && Audio.playDrop) {
            Audio.playDrop({ freq: 520, decay: 1.1, velocity: 0.4, pan: 0, plunk: true });
        } else if (Audio.playDrop) {
            Audio.playDrop({ freq: 380, decay: 0.9, velocity: 0.3, pan: 0, plunk: false });
        }
    }
}

// Public-domain folk melody (La Cucaracha), sung note-by-note by the school.
// Rhythm uses short eighths and dotted "cha" notes so the tune reads clearly.
const CUCARACHA_NOTES = (() => {
    // One octave up from the sung folk register so pitches cut through small speakers.
    const N = {
        C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99,
    };
    const e = 0.16;   // eighth
    const q = 0.32;   // quarter
    const dq = 0.48;  // dotted quarter (the "cha")
    const r = (d) => ({ freq: 0, d, rest: true });
    const n = (freq, d) => ({ freq, d, rest: false });
    return [
        // La cucaracha, la cucaracha
        n(N.C5, e), n(N.C5, e), n(N.C5, e), n(N.D5, e), n(N.E5, dq), n(N.C5, e), n(N.E5, e), n(N.D5, dq), r(e),
        // Ya no puede caminar
        n(N.C5, e), n(N.C5, e), n(N.C5, e), n(N.D5, e), n(N.E5, dq), n(N.C5, q), r(q),
        // Porque no tiene, porque le falta
        n(N.G5, e), n(N.G5, e), n(N.G5, e), n(N.G5, e), n(N.F5, e), n(N.E5, e), n(N.D5, q), r(e),
        // Closing phrase
        n(N.C5, e), n(N.C5, e), n(N.C5, e), n(N.D5, e), n(N.E5, dq), n(N.C5, q), r(q),
    ];
})();

let mariachiMode = false;
let mariachiNoteI = 0;
let mariachiNoteT = 0;
let mariachiCycles = 0;
let mariachiSingerI = 0;

function beginMariachiFiesta() {
    mariachiMode = true;
    mariachiNoteI = 0;
    mariachiNoteT = 0.15;
    mariachiCycles = 0;
    mariachiSingerI = 0;
    if (typeof Audio !== "undefined" && Audio.ensure) {
        Audio.ensure();
        if (Audio.rainbowChime) Audio.rainbowChime(0);
    }
}

function endMariachiFiesta() {
    mariachiMode = false;
    mariachiNoteI = 0;
    mariachiNoteT = 0;
    mariachiCycles = 0;
}

function updateMariachiFiesta(dt) {
    if (!mariachiMode) return;
    mariachiNoteT -= dt;
    if (mariachiNoteT > 0) return;

    if (mariachiNoteI >= CUCARACHA_NOTES.length) {
        mariachiCycles++;
        if (mariachiCycles >= 2) {
            endMariachiFiesta();
            return;
        }
        mariachiNoteI = 0;
    }

    const note = CUCARACHA_NOTES[mariachiNoteI++];
    mariachiNoteT = note.d;
    if (note.rest || !note.freq) return;

    const singers = fishes.filter((f) => !f.dead && !f.golden && !f.rainbowLeaving);
    if (!singers.length) {
        endMariachiFiesta();
        return;
    }
    const f = singers[mariachiSingerI % singers.length];
    mariachiSingerI++;
    const pan = Math.max(-1, Math.min(1, (f.x / viewW) * 2 - 1));
    // Fixed concert pitch + mariachi timbre so the tune stays recognizable.
    // Fish still "sing" for pan / bob; bite/pet fishNote path is left alone.
    if (Audio.mariachiNote) {
        Audio.mariachiNote({
            freq: note.freq,
            pan,
            dur: Math.max(0.09, note.d * 0.9),
        });
    }
    // Tiny "singing" bob.
    f.petTimer = Math.max(f.petTimer || 0, 0.22);
    if (Math.random() < 0.35) water.disturb(f.x, f.y, f.size * 0.25, 18);
}

function drawMariachiHat(ctx, L, W) {
    const hx = L * 0.02;
    const hy = -W * 1.08;
    ctx.save();
    ctx.shadowBlur = 0;
    // Wide brim.
    ctx.fillStyle = "#6b3e1f";
    ctx.beginPath();
    ctx.ellipse(hx, hy + L * 0.02, L * 0.34, L * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a5528";
    ctx.beginPath();
    ctx.ellipse(hx, hy, L * 0.3, L * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tall crown.
    ctx.fillStyle = "#5a3218";
    ctx.beginPath();
    ctx.moveTo(hx - L * 0.12, hy);
    ctx.lineTo(hx - L * 0.1, hy - L * 0.22);
    ctx.quadraticCurveTo(hx, hy - L * 0.28, hx + L * 0.1, hy - L * 0.22);
    ctx.lineTo(hx + L * 0.12, hy);
    ctx.closePath();
    ctx.fill();
    // Colorful band.
    ctx.fillStyle = "#c43c3c";
    ctx.fillRect(hx - L * 0.11, hy - L * 0.04, L * 0.22, L * 0.035);
    ctx.fillStyle = "#e8c84a";
    ctx.fillRect(hx - L * 0.11, hy - L * 0.02, L * 0.22, L * 0.012);
    ctx.restore();
}

// Hats unlock: hold right-click on a settled gold fish for 5 seconds to collect it.
const HATS_GOLD_COST = 5;
const MARKET_GOLD_COST = 7;
const MAGNET_GOLD_COST = 3;
const CATCHER_GOLD_COST = 4;
const RAINBOW_FISH_GOLD_COST = 10;
const GOLD_FOOD_NORMAL_COST = 20;
const GOLD_HOLD_TIME = 5;
const MAGNET_HOLD_MULT = 0.32; // magnet: lift gold much faster
const CATCHER_MAX_RADIUS = 44; // tight circle so rainbow catch stays hard
// Gold payout scales with settled fish size: 1 at tiny spawn size, 10 at half-screen.
const GOLD_AWARD_MIN = 1;
const GOLD_AWARD_MAX = 10;
const GOLD_AWARD_SIZE_MIN = 9; // typical smallest fish spawn (tetra)
let goldCollected = 0;
let hatsUnlocked = false;
let hatsOn = false;
let liftState = null; // { fish, originY, originX, holdTime, holding }

// Market: spend gold / stashed food on quiet pond upgrades.
const MARKET_KEY = "ripple-market";
let marketUnlocked = false;
let marketOpen = false;
let magnetOwned = false;
let catcherOwned = false;
let catcherMode = false;
let catcherDrag = null; // { cx, cy, r } while drawing a catch circle

// Scales: fish bites walk up these for melodic runs.
const PENTATONIC = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
const MINOR_PENT = [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5];

// Fish species. Each has LOOK, optional pattern, musical voice, swimming habit,
// and a body shape used when drawing (koi / oval / slim / round / diamond / longfin).
// Voice fields: wave/register/dur for bites; petWave/petFreq/petDur for pets;
// bitePartial and biteBright shape each species' chew timbre.
const FISH_TYPES = [
    // Traditional koi varieties: fuller bodies, barbels, slower graceful glide.
    { name: "kohaku",   shape: "koi", koi: true, body: "#f7f2ea", belly: "#ffffff", pattern: "hi",      patternColor: "#c23a2e", size: [22, 32], speed: [20, 32], wave: "sine",     register: 1.0,  bite: 6, dur: 0.42, turn: 2.4, wiggle: 1.05, scale: PENTATONIC, petWave: "sine",     petFreq: 300, petDur: 0.42, bitePartial: 0.22, biteBright: 1.0, whiskers: true },
    { name: "sanke",    shape: "koi", koi: true, body: "#f5f0e6", belly: "#fffaf2", pattern: "sanke",   patternColor: "#c23a2e", size: [21, 30], speed: [20, 34], wave: "sine",     register: 1.05, bite: 6, dur: 0.4,  turn: 2.5, wiggle: 1.08, scale: PENTATONIC, petWave: "triangle", petFreq: 320, petDur: 0.4,  bitePartial: 0.25, biteBright: 1.05, whiskers: true },
    { name: "showa",    shape: "koi", koi: true, body: "#2a2a2c", belly: "#f0e6dc", pattern: "showa",   patternColor: "#c23a2e", size: [22, 31], speed: [19, 31], wave: "sine",     register: 0.95, bite: 6, dur: 0.42, turn: 2.3, wiggle: 1.0,  scale: PENTATONIC, petWave: "sine",     petFreq: 290, petDur: 0.44, bitePartial: 0.2,  biteBright: 0.95, whiskers: true },
    { name: "asagi",    shape: "koi", koi: true, body: "#6a8fa8", belly: "#f2d5c0", pattern: "asagi",   patternColor: "#d8e6f0", size: [20, 29], speed: [22, 34], wave: "triangle", register: 1.1,  bite: 5, dur: 0.38, turn: 2.6, wiggle: 1.12, scale: PENTATONIC, petWave: "triangle", petFreq: 340, petDur: 0.38, bitePartial: 0.28, biteBright: 1.1, whiskers: true },
    { name: "ogon",     shape: "koi", koi: true, body: "#e0b24a", belly: "#fff0c4", pattern: "scales",  patternColor: "#f0d080", size: [20, 28], speed: [21, 33], wave: "sine",     register: 1.15, bite: 5, dur: 0.4,  turn: 2.5, wiggle: 1.1,  scale: PENTATONIC, petWave: "sine",     petFreq: 350, petDur: 0.4,  bitePartial: 0.3,  biteBright: 1.2, whiskers: true },
    { name: "koi",      shape: "koi", koi: true, body: "#e8853a", belly: "#fff1dc", pattern: "blotches", patternColor: "#f5f0e6", size: [20, 30], speed: [22, 36], wave: "sine",     register: 1.0,  bite: 6, dur: 0.4,  turn: 2.6, wiggle: 1.12, scale: PENTATONIC, petWave: "sine",     petFreq: 300, petDur: 0.42, bitePartial: 0.22, biteBright: 1.0, whiskers: true },
    { name: "shiro",    shape: "koi", koi: true, body: "#f4f0e8", belly: "#ffffff", pattern: "blotches", patternColor: "#c23b3b", size: [19, 28], speed: [22, 35], wave: "sine",     register: 1.1,  bite: 5, dur: 0.38, turn: 2.7, wiggle: 1.1,  scale: PENTATONIC, petWave: "triangle", petFreq: 340, petDur: 0.38, bitePartial: 0.28, biteBright: 1.15, whiskers: true },
    { name: "carp",     shape: "oval",    body: "#5f7d8f", belly: "#c3dbe8", pattern: "scales",   patternColor: "#7a9aaa", size: [23, 31], speed: [18, 30], wave: "triangle", register: 0.5,  bite: 9, dur: 0.6,  turn: 2.0, wiggle: 0.8,  scale: PENTATONIC, petWave: "triangle", petFreq: 180, petDur: 0.55, bitePartial: 0.12, biteBright: 0.7 },
    { name: "goldfish", shape: "round",   body: "#e07a2f", belly: "#ffd7a8", pattern: null,       patternColor: null,      size: [14, 20], speed: [22, 34], wave: "sine",     register: 1.15, bite: 4, dur: 0.35, turn: 3.2, wiggle: 1.2,  scale: PENTATONIC, petWave: "sine",     petFreq: 380, petDur: 0.32, bitePartial: 0.32, biteBright: 1.25 },
    { name: "minnow",   shape: "slim",    body: "#d6e6f2", belly: "#ffffff", pattern: null,       patternColor: null,      size: [10, 14], speed: [42, 62], wave: "sine",     register: 2.0,  bite: 3, dur: 0.22, turn: 5.0, wiggle: 1.4,  dart: true, scale: PENTATONIC, petWave: "sine",     petFreq: 520, petDur: 0.22, bitePartial: 0.4,  biteBright: 1.4 },
    { name: "tetra",    shape: "diamond", body: "#48b0c4", belly: "#d8f4ff", pattern: "stripe",   patternColor: "#1a3a55", size: [9, 13],  speed: [46, 66], wave: "square",   register: 1.5,  bite: 3, dur: 0.18, turn: 6.0, wiggle: 1.6,  dart: true, scale: PENTATONIC, petWave: "square",   petFreq: 460, petDur: 0.2,  bitePartial: 0.45, biteBright: 1.5 },
    { name: "eel",      shape: "slim",    body: "#4a5d3a", belly: "#9fb27a", pattern: "bands",    patternColor: "#2d3a22", size: [26, 36], speed: [16, 26], wave: "sawtooth", register: 0.75, bite: 7, dur: 0.8,  turn: 2.4, wiggle: 2.4,  slim: 0.55, scale: MINOR_PENT, petWave: "sawtooth", petFreq: 210, petDur: 0.65, bitePartial: 0.08, biteBright: 0.55 },
    { name: "angel",    shape: "diamond", body: "#c9a24b", belly: "#fff0c2", pattern: "spots",    patternColor: "#7a5520", size: [16, 21], speed: [22, 34], wave: "triangle", register: 1.25, bite: 5, dur: 0.5,  turn: 2.6, wiggle: 0.9,  scale: PENTATONIC, petWave: "triangle", petFreq: 360, petDur: 0.48, bitePartial: 0.3,  biteBright: 1.1 },
    { name: "betta",    shape: "longfin", body: "#b03a6e", belly: "#f0b8d0", pattern: null,       patternColor: null,      size: [13, 18], speed: [20, 32], wave: "triangle", register: 1.35, bite: 4, dur: 0.45, turn: 3.4, wiggle: 1.8,  scale: PENTATONIC, petWave: "sine",     petFreq: 410, petDur: 0.5,  bitePartial: 0.35, biteBright: 1.2 },
    { name: "catfish",  shape: "oval",    body: "#6b5a4a", belly: "#cbb8a0", pattern: null,       patternColor: null,      size: [20, 28], speed: [16, 26], wave: "sawtooth", register: 0.65, bite: 8, dur: 0.55, turn: 2.1, wiggle: 0.7,  whiskers: true, scale: MINOR_PENT, petWave: "triangle", petFreq: 160, petDur: 0.6,  bitePartial: 0.1,  biteBright: 0.6 },
    { name: "sunfish",  shape: "round",   body: "#d4a23a", belly: "#fff2c4", pattern: "spots",    patternColor: "#6a4a18", size: [15, 22], speed: [24, 36], wave: "sine",     register: 1.05, bite: 5, dur: 0.4,  turn: 3.0, wiggle: 1.0,  scale: PENTATONIC, petWave: "triangle", petFreq: 330, petDur: 0.36, bitePartial: 0.25, biteBright: 1.05 },
    { name: "pike",     shape: "slim",    body: "#5a7a55", belly: "#d6e0c8", pattern: "bands",    patternColor: "#3a4e35", size: [24, 34], speed: [28, 44], wave: "triangle", register: 0.7,  bite: 8, dur: 0.5,  turn: 2.5, wiggle: 1.1,  slim: 0.58, scale: MINOR_PENT, petWave: "sawtooth", petFreq: 240, petDur: 0.4,  bitePartial: 0.15, biteBright: 0.8 },
];

// Medium-rare exotic visitors: odd swim habits, rarer than commons, commoner than crocs.
const EXOTIC_TYPES = [
    { name: "discus",   exotic: true, odd: "spiral", shape: "round",   body: "#c45a8c", belly: "#f0c8dc", pattern: "bands",  patternColor: "#7a2850", size: [16, 22], speed: [16, 26], wave: "triangle", register: 1.4,  bite: 4, dur: 0.42, turn: 4.2, wiggle: 1.3, scale: PENTATONIC, petWave: "sine",     petFreq: 430, petDur: 0.45, bitePartial: 0.3,  biteBright: 1.2 },
    { name: "dragonet", exotic: true, odd: "zigzag", shape: "slim",    body: "#2f8f7a", belly: "#b8f0dc", pattern: "spots",  patternColor: "#f0d060", size: [12, 17], speed: [30, 48], wave: "square",   register: 1.6,  bite: 3, dur: 0.28, turn: 5.5, wiggle: 1.7, slim: 0.52, scale: PENTATONIC, petWave: "square",   petFreq: 480, petDur: 0.28, bitePartial: 0.4,  biteBright: 1.35 },
    { name: "glass",    exotic: true, odd: "jitter", shape: "slim",    body: "#a8d4e8", belly: "#e8f6ff", pattern: null,     patternColor: null,      size: [10, 15], speed: [38, 58], wave: "sine",     register: 1.9,  bite: 3, dur: 0.2,  turn: 6.5, wiggle: 1.9, slim: 0.48, scale: PENTATONIC, petWave: "sine",     petFreq: 560, petDur: 0.22, bitePartial: 0.5,  biteBright: 1.55, ghost: 0.55 },
    { name: "mandarin", exotic: true, odd: "drift",  shape: "round",   body: "#3a6ec4", belly: "#f0a040", pattern: "blotches", patternColor: "#e8d050", size: [13, 18], speed: [14, 24], wave: "triangle", register: 1.3,  bite: 4, dur: 0.48, turn: 3.8, wiggle: 1.4, scale: MINOR_PENT, petWave: "triangle", petFreq: 390, petDur: 0.5,  bitePartial: 0.28, biteBright: 1.15 },
    { name: "arowana",  exotic: true, odd: "glide",  shape: "slim",    body: "#c9a24b", belly: "#fff0c8", pattern: "scales", patternColor: "#8a6a28", size: [28, 40], speed: [22, 36], wave: "sawtooth", register: 0.55, bite: 8, dur: 0.65, turn: 1.8, wiggle: 0.85, slim: 0.5, scale: MINOR_PENT, petWave: "triangle", petFreq: 200, petDur: 0.6,  bitePartial: 0.12, biteBright: 0.75 },
];

// ---------------------------------------------------------------------------
// Canvas setup with devicePixelRatio scaling for crisp rendering
// ---------------------------------------------------------------------------
const canvas = document.getElementById("surface");
const ctx = canvas.getContext("2d");
let viewW = 0;
let viewH = 0;
let dpr = 1;
let vignette = null;

function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    canvas.style.width = viewW + "px";
    canvas.style.height = viewH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // work in CSS pixel coordinates

    // A soft radial vignette for depth, rebuilt on resize.
    vignette = ctx.createRadialGradient(
        viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.35,
        viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.75
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.55)");

    if (water) water.resize();
    if (typeof rebuildScenery === "function") rebuildScenery();
    // Keep swimming frogs inside the new viewport after resize.
    for (const g of frogGroups) {
        g.frog.x = Math.max(viewW * 0.08, Math.min(viewW * 0.92, g.frog.x));
        g.frog.y = Math.max(viewH * 0.42, Math.min(viewH * 0.88, g.frog.y));
    }
}
window.addEventListener("resize", resize);

// ---------------------------------------------------------------------------
// Mode: "pond" (water simulation + rocks) or "window" (rain on glass)
// ---------------------------------------------------------------------------
let mode = "pond";
document.body.classList.add("pond");

// ===========================================================================
// AUDIO ENGINE
// ===========================================================================
const Audio = (() => {
    let actx = null;
    let master = null;
    let reverbSend = null;
    let ambientGain = null;
    let ambientNodes = null;
    let noiseBuf = null;
    let voiceCount = 0;

    function ensure() {
        if (actx) return;
        actx = new (window.AudioContext || window.webkitAudioContext)();

        master = actx.createGain();
        master.gain.value = 0.9;
        master.connect(actx.destination);

        const convolver = actx.createConvolver();
        convolver.buffer = buildImpulseResponse(3.0, 2.4);
        const wet = actx.createGain();
        wet.gain.value = 0.4;
        reverbSend = actx.createGain();
        reverbSend.gain.value = 1.0;
        reverbSend.connect(convolver);
        convolver.connect(wet);
        wet.connect(master);

        // Reusable white-noise buffer for splash plunks and rain bed.
        const noiseLen = actx.sampleRate * 2;
        noiseBuf = actx.createBuffer(1, noiseLen, actx.sampleRate);
        const nd = noiseBuf.getChannelData(0);
        for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;

        ambientGain = actx.createGain();
        ambientGain.gain.value = 0;
        ambientGain.connect(master);

        startAmbient();
        applyAmbientForMode();
    }

    function buildImpulseResponse(seconds, falloff) {
        const rate = actx.sampleRate;
        const length = Math.floor(seconds * rate);
        const buffer = actx.createBuffer(2, length, rate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, falloff);
            }
        }
        return buffer;
    }

    function startAmbient() {
        const noise = actx.createBufferSource();
        noise.buffer = noiseBuf;
        noise.loop = true;
        const rainFilter = actx.createBiquadFilter();
        rainFilter.type = "bandpass";
        rainFilter.frequency.value = 1200;
        rainFilter.Q.value = 0.4;
        const rainGain = actx.createGain();
        rainGain.gain.value = 0.0;
        noise.connect(rainFilter);
        rainFilter.connect(rainGain);
        rainGain.connect(ambientGain);
        noise.start();

        const humGain = actx.createGain();
        humGain.gain.value = 0.0;
        humGain.connect(ambientGain);
        const hum1 = actx.createOscillator();
        hum1.type = "sine";
        hum1.frequency.value = 56;
        const hum2 = actx.createOscillator();
        hum2.type = "sine";
        hum2.frequency.value = 56.7;
        hum1.connect(humGain);
        hum2.connect(humGain);
        const lfo = actx.createOscillator();
        lfo.frequency.value = 0.07;
        const lfoGain = actx.createGain();
        lfoGain.gain.value = 0.5;
        lfo.connect(lfoGain);
        lfoGain.connect(humGain.gain);
        hum1.start();
        hum2.start();
        lfo.start();

        ambientNodes = { rainGain, humGain };
    }

    let ambientOn = false;
    function applyAmbientForMode() {
        if (!ambientNodes || !actx) return;
        const t = actx.currentTime;
        const rainTarget = ambientOn && mode === "window" ? 0.06 : 0.0;
        const humTarget = ambientOn && mode === "pond" ? 0.09 : 0.0;
        ambientNodes.rainGain.gain.setTargetAtTime(rainTarget, t, 0.8);
        ambientNodes.humGain.gain.setTargetAtTime(humTarget, t, 0.8);
        ambientGain.gain.setTargetAtTime(ambientOn ? 1 : 0, t, 0.8);
    }

    function toggleAmbient() {
        ensure();
        ambientOn = !ambientOn;
        applyAmbientForMode();
        return ambientOn;
    }

    // Drop sound styles the user can cycle through. Each keeps the physics-linked
    // pitch/decay, but changes the splash timbre around it.
    const DROP_STYLES = ["soft", "pebble", "glass", "deep", "bell"];
    let dropStyle = "soft";

    function getDropStyle() { return dropStyle; }
    function cycleDropStyle() {
        const i = DROP_STYLES.indexOf(dropStyle);
        dropStyle = DROP_STYLES[(i + 1) % DROP_STYLES.length];
        return dropStyle;
    }

    // Shape the impact voice for the selected drop style.
    function styleDropParams(freq, velocity, style) {
        switch (style) {
            case "pebble":
                return {
                    fundType: "triangle",
                    partialRatio: 4.2,
                    partialAmt: 0.18,
                    peakScale: 0.9,
                    attack: 0.006,
                    cutoffMul: 5,
                    noiseAmt: 0.55,
                    noiseCut: Math.max(400, freq * 1.4),
                    noiseDur: 0.08,
                    wet: 0.25,
                };
            case "glass":
                return {
                    fundType: "sine",
                    partialRatio: 5,
                    partialAmt: 0.45,
                    peakScale: 0.85,
                    attack: 0.01,
                    cutoffMul: 12,
                    noiseAmt: 0.15,
                    noiseCut: Math.max(800, freq * 3),
                    noiseDur: 0.06,
                    wet: 0.5,
                };
            case "deep":
                return {
                    fundType: "sine",
                    partialRatio: 2,
                    partialAmt: 0.22,
                    peakScale: 1.15,
                    attack: 0.02,
                    cutoffMul: 4,
                    noiseAmt: 0.95,
                    noiseCut: Math.max(180, freq * 0.9),
                    noiseDur: 0.28,
                    wet: 0.55,
                    freqScale: 0.72,
                };
            case "bell":
                return {
                    fundType: "sine",
                    partialRatio: 2.76,
                    partialAmt: 0.55,
                    peakScale: 0.8,
                    attack: 0.004,
                    cutoffMul: 10,
                    noiseAmt: 0.08,
                    noiseCut: 1200,
                    noiseDur: 0.04,
                    wet: 0.6,
                };
            default: // soft
                return {
                    fundType: "sine",
                    partialRatio: 3,
                    partialAmt: 0.35,
                    peakScale: 1,
                    attack: 0.012,
                    cutoffMul: 8,
                    noiseAmt: 0.8,
                    noiseCut: Math.max(300, freq * 2),
                    noiseDur: 0.14,
                    wet: 0.4,
                };
        }
    }

    // Pond-surface hit colors the drop: stone, wood, lily, weed, reed, or open water.
    function surfaceDropMods(surface) {
        switch (surface) {
            case "stone":
                return { freqMul: 1.18, peakMul: 1.05, partialMul: 1.35, noiseMul: 1.4, noiseCutMul: 1.25, wetMul: 0.7, attackMul: 0.7 };
            case "wood":
                return { freqMul: 0.78, peakMul: 0.95, partialMul: 0.7, noiseMul: 0.85, noiseCutMul: 0.65, wetMul: 0.85, attackMul: 0.9 };
            case "lily":
                return { freqMul: 1.08, peakMul: 0.75, partialMul: 0.9, noiseMul: 0.55, noiseCutMul: 0.9, wetMul: 1.15, attackMul: 1.3 };
            case "weed":
                return { freqMul: 1.25, peakMul: 0.7, partialMul: 1.1, noiseMul: 0.45, noiseCutMul: 1.35, wetMul: 1.05, attackMul: 1.1 };
            case "reed":
                return { freqMul: 1.35, peakMul: 0.65, partialMul: 1.45, noiseMul: 0.35, noiseCutMul: 1.5, wetMul: 0.9, attackMul: 0.85 };
            case "stick":
                return { freqMul: 0.92, peakMul: 0.85, partialMul: 0.8, noiseMul: 0.7, noiseCutMul: 0.8, wetMul: 0.95, attackMul: 1.0 };
            default:
                return { freqMul: 1, peakMul: 1, partialMul: 1, noiseMul: 1, noiseCutMul: 1, wetMul: 1, attackMul: 1 };
        }
    }

    // The core: physics -> a voice. `plunk` adds a short filtered-noise splash
    // transient for rocks hitting water. Timbre follows the selected drop style
    // and, in pond mode, the surface the food lands on.
    function playDrop(params) {
        ensure();
        if (actx.state === "suspended") actx.resume();
        if (voiceCount >= CONFIG.maxVoices) return; // hard cap on node churn

        const t0 = actx.currentTime;
        const { decay, velocity, pan, plunk } = params;
        const style = styleDropParams(params.freq, velocity, dropStyle);
        const surf = surfaceDropMods(params.surface || "water");
        const freq = params.freq * (style.freqScale || 1) * surf.freqMul;
        const tail = Math.min(6, Math.log(1000) / decay);

        const voice = actx.createGain();
        voice.gain.value = 0.0001;
        const peak = (0.15 + velocity * 0.22) * style.peakScale * surf.peakMul;
        const attack = Math.max(0.004, style.attack * surf.attackMul);
        voice.gain.setValueAtTime(0.0001, t0);
        voice.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
        voice.gain.exponentialRampToValueAtTime(0.0001, t0 + tail);

        const filter = actx.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.value = dropStyle === "bell" ? 1.4 : 0.7;
        const cutoffStart = Math.min(16000, freq * style.cutoffMul + 600);
        const cutoffEnd = Math.max(freq, 180);
        filter.frequency.setValueAtTime(cutoffStart, t0);
        filter.frequency.exponentialRampToValueAtTime(cutoffEnd, t0 + tail * 0.6);

        const fund = actx.createOscillator();
        fund.type = style.fundType;
        fund.frequency.value = freq;

        const partial = actx.createOscillator();
        partial.type = dropStyle === "pebble" ? "square" : "triangle";
        partial.frequency.value = freq * style.partialRatio;
        partial.detune.value = dropStyle === "bell" ? 2 : 6;
        const partialGain = actx.createGain();
        partialGain.gain.setValueAtTime(peak * style.partialAmt * surf.partialMul, t0);
        partialGain.gain.exponentialRampToValueAtTime(0.0001, t0 + tail * (dropStyle === "bell" ? 0.75 : 0.45));

        const panner = actx.createStereoPanner();
        panner.pan.value = pan;

        // Per-voice wet amount so "glass"/"bell" sit deeper in the pond space.
        const dry = actx.createGain();
        dry.gain.value = 1;
        const wetSend = actx.createGain();
        wetSend.gain.value = style.wet * surf.wetMul;

        fund.connect(filter);
        partial.connect(partialGain);
        partialGain.connect(filter);
        filter.connect(voice);
        voice.connect(panner);
        panner.connect(dry);
        dry.connect(master);
        panner.connect(wetSend);
        wetSend.connect(reverbSend);

        // Splash transient shaped by the selected drop style and landing surface.
        let noiseSrc = null;
        if (plunk && style.noiseAmt * surf.noiseMul > 0.01) {
            noiseSrc = actx.createBufferSource();
            noiseSrc.buffer = noiseBuf;
            const nf = actx.createBiquadFilter();
            nf.type = dropStyle === "deep" ? "lowpass" : "bandpass";
            nf.frequency.value = style.noiseCut * surf.noiseCutMul;
            nf.Q.value = dropStyle === "pebble" ? 1.2 : 0.7;
            const ng = actx.createGain();
            ng.gain.setValueAtTime(peak * style.noiseAmt * surf.noiseMul, t0);
            ng.gain.exponentialRampToValueAtTime(0.0001, t0 + style.noiseDur);
            noiseSrc.connect(nf);
            nf.connect(ng);
            ng.connect(panner);
            noiseSrc.start(t0);
            noiseSrc.stop(t0 + style.noiseDur + 0.05);
        }

        fund.start(t0);
        partial.start(t0);
        const stopAt = t0 + tail + 0.1;
        fund.stop(stopAt);
        partial.stop(stopAt);

        voiceCount++;
        fund.onended = () => {
            voiceCount--;
            try {
                fund.disconnect();
                partial.disconnect();
                partialGain.disconnect();
                filter.disconnect();
                voice.disconnect();
                panner.disconnect();
                dry.disconnect();
                wetSend.disconnect();
                if (noiseSrc) noiseSrc.disconnect();
            } catch (e) { /* already gone */ }
        };
    }

    // Very soft, very short high tick for a droplet landing. Cheap and capped
    // by the droplet system so it never becomes clutter.
    function tick(pan, freq) {
        if (!actx || voiceCount >= CONFIG.maxVoices) return;
        const t0 = actx.currentTime;
        const o = actx.createOscillator();
        o.type = "sine";
        o.frequency.value = freq;
        const g = actx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.03, t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
        const p = actx.createStereoPanner();
        p.pan.value = pan;
        o.connect(g);
        g.connect(p);
        p.connect(master);
        p.connect(reverbSend);
        o.start(t0);
        o.stop(t0 + 0.16);
        o.onended = () => { try { o.disconnect(); g.disconnect(); p.disconnect(); } catch (e) {} };
    }

    // A fish taking a bite or being petted. Timbre/register come from the species.
    function fishNote({ freq, wave, pan, dur, level, partialAmt, partialRatio, bright }) {
        ensure();
        if (actx.state === "suspended") actx.resume();
        if (voiceCount >= CONFIG.maxVoices) return;
        const t0 = actx.currentTime;
        const pAmt = partialAmt == null ? 0.18 : partialAmt;
        const pRatio = partialRatio == null ? 2 : partialRatio;
        const brightMul = bright == null ? 1 : bright;

        const osc = actx.createOscillator();
        osc.type = wave || "sine";
        osc.frequency.value = freq;

        const partial = actx.createOscillator();
        partial.type = "sine";
        partial.frequency.value = freq * pRatio;
        const partialGain = actx.createGain();
        partialGain.gain.value = level * pAmt;

        const filter = actx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = Math.min(10000, (freq * 6 + 600) * brightMul);
        filter.Q.value = 0.6;

        const g = actx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        const panner = actx.createStereoPanner();
        panner.pan.value = pan;

        osc.connect(filter);
        partial.connect(partialGain);
        partialGain.connect(filter);
        filter.connect(g);
        g.connect(panner);
        panner.connect(master);
        panner.connect(reverbSend);

        osc.start(t0);
        partial.start(t0);
        osc.stop(t0 + dur + 0.05);
        partial.stop(t0 + dur + 0.05);

        voiceCount++;
        osc.onended = () => {
            voiceCount--;
            try {
                osc.disconnect(); partial.disconnect(); partialGain.disconnect();
                filter.disconnect(); g.disconnect(); panner.disconnect();
            } catch (e) {}
        };
    }

    // Fiesta melody voice: brighter brass-ish tone, dry and punchy so pitches read as a tune.
    function mariachiNote({ freq, pan, dur }) {
        ensure();
        if (actx.state === "suspended") actx.resume();
        if (voiceCount >= CONFIG.maxVoices) return;
        const t0 = actx.currentTime;
        const level = 0.28;
        const attack = 0.01;
        const release = Math.min(0.07, Math.max(0.04, dur * 0.22));
        const body = Math.max(attack + 0.03, dur - release * 0.35);

        const fund = actx.createOscillator();
        fund.type = "triangle";
        fund.frequency.value = freq;

        const h2 = actx.createOscillator();
        h2.type = "square";
        h2.frequency.value = freq * 2;
        const h2g = actx.createGain();
        h2g.gain.value = level * 0.16;

        const h3 = actx.createOscillator();
        h3.type = "sine";
        h3.frequency.value = freq * 3;
        const h3g = actx.createGain();
        h3g.gain.value = level * 0.1;

        const filter = actx.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.value = 1.15;
        filter.frequency.setValueAtTime(Math.min(4800, freq * 9 + 900), t0);
        filter.frequency.exponentialRampToValueAtTime(Math.min(2600, freq * 4.5 + 500), t0 + body);

        const g = actx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(level, t0 + attack);
        g.gain.setValueAtTime(level * 0.82, t0 + body * 0.55);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        const panner = actx.createStereoPanner();
        panner.pan.value = pan == null ? 0 : pan;

        const dry = actx.createGain();
        dry.gain.value = 1;
        const wet = actx.createGain();
        wet.gain.value = 0.1;

        fund.connect(filter);
        h2.connect(h2g);
        h2g.connect(filter);
        h3.connect(h3g);
        h3g.connect(filter);
        filter.connect(g);
        g.connect(panner);
        panner.connect(dry);
        dry.connect(master);
        panner.connect(wet);
        wet.connect(reverbSend);

        fund.start(t0);
        h2.start(t0);
        h3.start(t0);
        const stopAt = t0 + dur + 0.06;
        fund.stop(stopAt);
        h2.stop(stopAt);
        h3.stop(stopAt);

        voiceCount++;
        fund.onended = () => {
            voiceCount--;
            try {
                fund.disconnect(); h2.disconnect(); h2g.disconnect();
                h3.disconnect(); h3g.disconnect(); filter.disconnect();
                g.disconnect(); panner.disconnect(); dry.disconnect(); wet.disconnect();
            } catch (e) {}
        };
    }

    // Soft contented whale purr when petted.
    function whalePurr(pan) {
        ensure();
        if (actx.state === "suspended") actx.resume();
        const t0 = actx.currentTime;
        const osc = actx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(62, t0);
        osc.frequency.exponentialRampToValueAtTime(40, t0 + 1.4);
        const osc2 = actx.createOscillator();
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(90, t0);
        osc2.frequency.exponentialRampToValueAtTime(55, t0 + 1.4);
        const g = actx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.12);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.7);
        const g2 = actx.createGain();
        g2.gain.value = 0.35;
        const p = actx.createStereoPanner();
        p.pan.value = pan;
        osc.connect(g); osc2.connect(g2); g2.connect(g);
        g.connect(p); p.connect(master); p.connect(reverbSend);
        osc.start(t0); osc2.start(t0);
        osc.stop(t0 + 1.8); osc2.stop(t0 + 1.8);
        osc.onended = () => {
            try { osc.disconnect(); osc2.disconnect(); g.disconnect(); g2.disconnect(); p.disconnect(); } catch (e) {}
        };
    }

    // Splashy whoosh for a shark barrel roll.
    function sharkRoll(pan) {
        ensure();
        if (actx.state === "suspended") actx.resume();
        const t0 = actx.currentTime;
        const osc = actx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(160, t0);
        osc.frequency.exponentialRampToValueAtTime(70, t0 + 0.55);
        const g = actx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
        const noiseSrc = actx.createBufferSource();
        noiseSrc.buffer = noiseBuf;
        const ng = actx.createGain();
        ng.gain.setValueAtTime(0.0001, t0);
        ng.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
        ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
        const nf = actx.createBiquadFilter();
        nf.type = "bandpass";
        nf.frequency.value = 900;
        nf.Q.value = 0.7;
        const p = actx.createStereoPanner();
        p.pan.value = pan;
        osc.connect(g); g.connect(p);
        noiseSrc.connect(nf); nf.connect(ng); ng.connect(p);
        p.connect(master); p.connect(reverbSend);
        osc.start(t0); noiseSrc.start(t0);
        osc.stop(t0 + 0.75); noiseSrc.stop(t0 + 0.5);
        osc.onended = () => {
            try { osc.disconnect(); g.disconnect(); noiseSrc.disconnect(); nf.disconnect(); ng.disconnect(); p.disconnect(); } catch (e) {}
        };
    }

    // A predator swallowing another fish: a low, ominous falling growl.
    function predatorEat(pan) {
        ensure();
        if (actx.state === "suspended") actx.resume();
        const t0 = actx.currentTime;
        const osc = actx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(120, t0);
        osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.4);
        const filter = actx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1400, t0);
        filter.frequency.exponentialRampToValueAtTime(300, t0 + 0.4);
        const g = actx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
        const p = actx.createStereoPanner();
        p.pan.value = pan;
        osc.connect(filter); filter.connect(g); g.connect(p);
        p.connect(master); p.connect(reverbSend);
        osc.start(t0); osc.stop(t0 + 0.55);
        osc.onended = () => { try { osc.disconnect(); filter.disconnect(); g.disconnect(); p.disconnect(); } catch (e) {} };
    }

    // The shark strike: a deep, cavernous boom with a splash of noise.
    function sharkStrike(pan) {
        ensure();
        if (actx.state === "suspended") actx.resume();
        const t0 = actx.currentTime;
        const osc = actx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(90, t0);
        osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.7);
        const g = actx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
        const noiseSrc = actx.createBufferSource();
        noiseSrc.buffer = noiseBuf;
        const nf = actx.createBiquadFilter();
        nf.type = "lowpass";
        nf.frequency.value = 900;
        const ng = actx.createGain();
        ng.gain.setValueAtTime(0.35, t0);
        ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
        const p = actx.createStereoPanner();
        p.pan.value = pan;
        osc.connect(g); g.connect(p);
        noiseSrc.connect(nf); nf.connect(ng); ng.connect(p);
        p.connect(master); p.connect(reverbSend);
        osc.start(t0); osc.stop(t0 + 0.95);
        noiseSrc.start(t0); noiseSrc.stop(t0 + 0.35);
        osc.onended = () => { try { osc.disconnect(); g.disconnect(); noiseSrc.disconnect(); nf.disconnect(); ng.disconnect(); p.disconnect(); } catch (e) {} };
    }

    // A golden transformation: a bright, shimmering little arpeggio.
    function goldChime(pan) {
        ensure();
        if (actx.state === "suspended") actx.resume();
        const t0 = actx.currentTime;
        const notes = [880, 1108.7, 1318.5, 1760]; // A5, C#6, E6, A6
        notes.forEach((f, k) => {
            const t = t0 + k * 0.07;
            const o = actx.createOscillator();
            o.type = "sine";
            o.frequency.value = f;
            const g = actx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
            const p = actx.createStereoPanner();
            p.pan.value = pan;
            o.connect(g); g.connect(p);
            p.connect(master); p.connect(reverbSend);
            o.start(t); o.stop(t + 0.65);
            o.onended = () => { try { o.disconnect(); g.disconnect(); p.disconnect(); } catch (e) {} };
        });
    }

    // Rainbow transformation: a quick rising cascade across the spectrum.
    function rainbowChime(pan) {
        ensure();
        if (actx.state === "suspended") actx.resume();
        const t0 = actx.currentTime;
        const notes = [523.25, 659.25, 783.99, 987.77, 1174.66, 1396.91];
        notes.forEach((f, k) => {
            const t = t0 + k * 0.05;
            const o = actx.createOscillator();
            o.type = "triangle";
            o.frequency.value = f;
            const g = actx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.1, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
            const p = actx.createStereoPanner();
            p.pan.value = pan;
            o.connect(g); g.connect(p);
            p.connect(master); p.connect(reverbSend);
            o.start(t); o.stop(t + 0.5);
            o.onended = () => { try { o.disconnect(); g.disconnect(); p.disconnect(); } catch (e) {} };
        });
    }

    // Whale arrival: a deep, rolling boom that fills the pond.
    function whaleCall(pan) {
        ensure();
        if (actx.state === "suspended") actx.resume();
        const t0 = actx.currentTime;
        const osc = actx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(48, t0);
        osc.frequency.exponentialRampToValueAtTime(28, t0 + 1.8);
        const g = actx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
        const p = actx.createStereoPanner();
        p.pan.value = pan;
        osc.connect(g); g.connect(p);
        p.connect(master); p.connect(reverbSend);
        osc.start(t0); osc.stop(t0 + 2.3);
        osc.onended = () => { try { osc.disconnect(); g.disconnect(); p.disconnect(); } catch (e) {} };
    }

    return {
        ensure,
        playDrop,
        tick,
        fishNote,
        mariachiNote,
        predatorEat,
        sharkStrike,
        sharkRoll,
        goldChime,
        rainbowChime,
        whaleCall,
        whalePurr,
        toggleAmbient,
        onModeChange: applyAmbientForMode,
        cycleDropStyle,
        getDropStyle,
        get isReady() { return !!actx; },
    };
})();

// ===========================================================================
// PHYSICS -> PARAMETERS (shared by visuals and sound)
// Everything below is derived from a single normalized impact velocity in [0,1].
// ===========================================================================

// Bigger/harder impact -> LOWER pitch, like a heavier stone. Log interpolation.
function velocityToFrequency(v) {
    return CONFIG.freqMax * Math.pow(CONFIG.freqMin / CONFIG.freqMax, v);
}
// The one constant shared by ring opacity and the gain envelope.
function velocityToDecay(v) {
    return CONFIG.decayFast + (CONFIG.decaySlow - CONFIG.decayFast) * v;
}
function velocityToRadius(v) {
    return CONFIG.baseRadius + CONFIG.maxExpansion * (0.25 + 0.75 * v);
}
function velocityToRings(v) {
    return 2 + Math.round(v * 2);
}
function clamp01(n) { return Math.max(0, Math.min(1, n)); }

// ===========================================================================
// HARMONY QUANTIZATION
// Recent tones remember where and when they sounded. A new impact near a
// still-ringing tone snaps toward a harmonic interval of it, so clusters of
// drops start to sound intentional rather than chaotic.
// ===========================================================================
const activeTones = [];

function registerTone(x, y, freq) {
    activeTones.push({ x, y, freq, t: performance.now() });
}
function quantizePitch(x, y, rawFreq) {
    const now = performance.now();
    let host = null;
    let bestDist = CONFIG.harmonyRange;
    for (let i = activeTones.length - 1; i >= 0; i--) {
        const tone = activeTones[i];
        if ((now - tone.t) / 1000 > CONFIG.harmonyLife) {
            activeTones.splice(i, 1);
            continue;
        }
        const d = Math.hypot(x - tone.x, y - tone.y);
        if (d < bestDist) { bestDist = d; host = tone; }
    }
    if (!host) return rawFreq;

    let best = rawFreq;
    let bestErr = Infinity;
    for (const ratio of CONFIG.harmonyRatios) {
        for (const oct of [0.5, 1, 2]) {
            const candidate = host.freq * ratio * oct;
            const err = Math.abs(Math.log2(candidate / rawFreq));
            if (err < bestErr) { bestErr = err; best = candidate; }
        }
    }
    return Math.max(CONFIG.freqMin * 0.5, Math.min(CONFIG.freqMax * 1.5, best));
}

// Turn an impact at (x,y) with normalized velocity into a played voice.
// Optional `surface` tints the timbre when food lands on pond elements.
function sound(x, y, v, plunk, surface) {
    let freq = velocityToFrequency(v);
    freq = quantizePitch(x, y, freq);
    registerTone(x, y, freq);
    const pan = Math.max(-1, Math.min(1, (x / viewW) * 2 - 1));
    Audio.playDrop({
        freq,
        decay: velocityToDecay(v),
        velocity: v,
        pan,
        plunk,
        surface: surface || "water",
    });
    return freq;
}

// What the food hits: debris, pads, greens, sticks, bank plants, shore stone, or open water.
function pondSurfaceAt(x, y) {
    if (scenery.debris) {
        const o = obstacleAt(x, y);
        if (o) {
            return (o.kind === "boulder" || o.kind === "mossrock") ? "stone" : "wood";
        }
    }
    if (scenery.lilies) {
        for (const L of sceneryItems.lilies) {
            if (Math.hypot(x - L.x, y - L.y) < L.r * 1.15) return "lily";
        }
    }
    if (scenery.duckweed) {
        for (const d of sceneryItems.duckweed) {
            if (Math.hypot(x - d.x, y - d.y) < d.r * 0.95) return "weed";
        }
        for (const L of sceneryItems.leaves) {
            if (Math.hypot(x - L.x, y - L.y) < L.len * 1.4) return "weed";
        }
    }
    if (scenery.sticks) {
        for (const s of sceneryItems.sticks) {
            const ca = Math.cos(s.rot), sa = Math.sin(s.rot);
            const lx = (x - s.x) * ca + (y - s.y) * sa;
            const ly = -(x - s.x) * sa + (y - s.y) * ca;
            if (Math.abs(lx) < s.len * 0.55 && Math.abs(ly) < Math.max(6, s.thick * 2.2)) {
                return "stick";
            }
        }
    }
    if (scenery.reeds || scenery.cattails) {
        const banks = [];
        if (scenery.reeds) banks.push(...sceneryItems.reeds);
        if (scenery.cattails) banks.push(...sceneryItems.cattails);
        for (const r of banks) {
            if (Math.hypot(x - r.x, y - r.y) < 18) return "reed";
        }
    }
    if (scenery.stones) {
        for (const s of sceneryItems.stones) {
            const dx = (x - s.x) / (s.rx + 4);
            const dy = (y - s.y) / (s.ry + 4);
            if (dx * dx + dy * dy < 1) return "stone";
        }
    }
    for (const p of pondPlants) {
        if (Math.hypot(x - p.x, y - p.y) < p.size * 0.7) {
            if (p.kind === "lily" || p.kind === "lotus") return "lily";
            if (p.kind === "reed" || p.kind === "cattail") return "reed";
            if (p.kind === "moss") return "stone";
            return "weed";
        }
    }
    return "water";
}

// ===========================================================================
// WATER SIMULATION (pond mode)
// A classic two-buffer height field. Each step, a cell's next height is the
// average of its neighbours minus its previous height, times a damping factor.
// Waves propagate outward, reflect off the grid edges (the pond banks), and
// where two waves meet their heights add: real interference and collision.
// ===========================================================================
class WaterSim {
    constructor() {
        this.scale = 5; // CSS px per grid cell
        this.resize();
        this.damping = 0.982;
    }

    resize() {
        this.cols = Math.max(48, Math.ceil(viewW / this.scale));
        this.rows = Math.max(48, Math.ceil(viewH / this.scale));
        const n = this.cols * this.rows;
        this.cur = new Float32Array(n);
        this.prev = new Float32Array(n);
        this.off = document.createElement("canvas");
        this.off.width = this.cols;
        this.off.height = this.rows;
        this.offctx = this.off.getContext("2d");
        this.img = this.offctx.createImageData(this.cols, this.rows);
    }

    // Push the surface down over a disc. Bigger/harder impact = wider, deeper.
    disturb(px, py, radius, power) {
        const { cols, rows, scale } = this;
        const cx = Math.floor(px / scale);
        const cy = Math.floor(py / scale);
        const r = Math.max(1, Math.floor(radius / scale));
        for (let dy = -r; dy <= r; dy++) {
            const y = cy + dy;
            if (y < 1 || y >= rows - 1) continue;
            for (let dx = -r; dx <= r; dx++) {
                const x = cx + dx;
                if (x < 1 || x >= cols - 1) continue;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > r) continue;
                const fall = 1 - dist / r;
                this.prev[y * cols + x] -= power * fall * fall;
            }
        }
    }

    step() {
        const { cols, rows, cur, prev, damping } = this;
        for (let y = 1; y < rows - 1; y++) {
            let i = y * cols + 1;
            for (let x = 1; x < cols - 1; x++, i++) {
                let v = ((prev[i - 1] + prev[i + 1] + prev[i - cols] + prev[i + cols]) * 0.5) - cur[i];
                cur[i] = v * damping;
            }
        }
        // The freshly computed field is now in `cur`; swap so `prev` holds it.
        const t = this.prev;
        this.prev = this.cur;
        this.cur = t;
    }

    // Surface slope and height at a world position, for pushing fish around.
    gradientAt(px, py) {
        const { cols, rows, scale, prev } = this;
        const x = Math.max(1, Math.min(cols - 2, Math.floor(px / scale)));
        const y = Math.max(1, Math.min(rows - 2, Math.floor(py / scale)));
        const i = y * cols + x;
        return {
            gx: prev[i - 1] - prev[i + 1],
            gy: prev[i - cols] - prev[i + cols],
            h: prev[i],
        };
    }

    render(ctx) {
        const field = this.prev;
        const { cols, rows } = this;
        const data = this.img.data;
        const showBed = typeof scenery !== "undefined" && scenery.bed;
        const sunOn = typeof scenery !== "undefined" && scenery.sun;
        // Clearer water when the bed is visible; sun stays mostly clear so the floor reads.
        const alpha = showBed ? (sunOn ? 118 : 132) : 255;
        const sunWarm = sunOn ? 1 : 0;
        const causticPhase = (typeof sceneryTime === "number" ? sceneryTime : 0) * 0.45;
        let p = 0;
        for (let y = 0; y < rows; y++) {
            // Soft pond teal; sun adds a mild golden-hour warmth, not harsh daylight.
            const ty = y / rows;
            const baseR = (showBed ? 18 : 8) + ty * 5 + sunWarm * 14;
            const baseG = (showBed ? 30 : 22) + ty * 11 + sunWarm * 8;
            const baseB = (showBed ? 36 : 26) + ty * 9 + sunWarm * 2;
            for (let x = 0; x < cols; x++) {
                const i = y * cols + x;
                const l = x > 0 ? field[i - 1] : field[i];
                const r = x < cols - 1 ? field[i + 1] : field[i];
                const u = y > 0 ? field[i - cols] : field[i];
                const d = y < rows - 1 ? field[i + cols] : field[i];
                // Surface slope as a normal; kept gentle so the water stays calm.
                const sx = l - r;
                const sy = u - d;
                const shade = (sx * (0.85 + sunWarm * 0.12) + sy * 0.8) * (0.75 + sunWarm * 0.08);
                // Soft crest highlight only on steeper slopes.
                let spec = 0;
                const s = sx * 0.55 + sy;
                if (s > 5.5) spec = Math.min(55, (s - 5.5) * (s - 5.5) * (0.22 + sunWarm * 0.06));
                // Very subtle surface shimmer when the sun is on (no lattice).
                let caustic = 0;
                if (sunOn) {
                    const cx = x * 0.11 + causticPhase + y * 0.03;
                    const cy = y * 0.09 - causticPhase * 0.55 + x * 0.02;
                    const n = Math.sin(cx) * Math.sin(cy * 1.1) + Math.sin(cx * 0.37 + cy * 0.6) * 0.45;
                    caustic = (n + 1.45) * 1.6 * sunWarm;
                }

                data[p] = clampByte(baseR + shade + spec * 0.55 + caustic * 1.1);
                data[p + 1] = clampByte(baseG + shade * 0.95 + spec * 0.65 + caustic * 0.75);
                data[p + 2] = clampByte(baseB + shade * 1.05 + spec * 0.55 + caustic * 0.35);
                data[p + 3] = alpha;
                p += 4;
            }
        }
        this.offctx.putImageData(this.img, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.off, 0, 0, viewW, viewH);
    }
}
function clampByte(n) { return n < 0 ? 0 : n > 255 ? 255 : n; }

let water = new WaterSim();

// ===========================================================================
// POND SCENERY
// Toggleable shore stones, fallen sticks, reeds, and lily pads. Drawn softly
// so they read as part of the pond without stealing focus from the fish.
// ===========================================================================
const scenery = {
    stones: true,
    sticks: true,
    reeds: true,
    lilies: true,
    cattails: true,
    duckweed: true,
    debris: true, // solid movable lake clutter (logs, rocks, driftwood, pots, and more)
    bed: true,    // rocky / sandy pond floor seen through the water
    sun: true,    // warm golden-hour light, soft floor caustics, and sharp shadows
    frogs: true,  // underwater frogs swimming with tadpole clusters (background)
};
let sceneryItems = {
    stones: [], sticks: [], reeds: [], lilies: [],
    cattails: [], duckweed: [], leaves: [],
};
let pondBedCanvas = null;
let sunPhase = 0;
// Solid props fish cannot swim through. Right-click drag moves them (with water drag).
let obstacles = [];
let grabbedObstacle = null;
let grabOffset = { x: 0, y: 0 };
let grabAim = null; // lethargic follow target while dragging

function seeded(n) {
    // Tiny deterministic hash so scenery stays stable until resize.
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
}

function rebuildScenery() {
    const stones = [];
    const sticks = [];
    const reeds = [];
    const lilies = [];
    const cattails = [];
    const duckweed = [];
    const leaves = [];
    const margin = Math.min(viewW, viewH) * 0.08;

    for (let i = 0; i < 14; i++) {
        const side = Math.floor(seeded(i + 1) * 4);
        let x, y;
        if (side === 0) { x = seeded(i + 10) * viewW; y = seeded(i + 20) * margin; }
        else if (side === 1) { x = seeded(i + 10) * viewW; y = viewH - seeded(i + 20) * margin; }
        else if (side === 2) { x = seeded(i + 10) * margin; y = seeded(i + 20) * viewH; }
        else { x = viewW - seeded(i + 10) * margin; y = seeded(i + 20) * viewH; }
        stones.push({
            x, y,
            rx: 10 + seeded(i + 30) * 22,
            ry: 7 + seeded(i + 40) * 12,
            rot: seeded(i + 50) * Math.PI,
            tone: 0.35 + seeded(i + 60) * 0.35,
        });
    }

    for (let i = 0; i < 8; i++) {
        sticks.push({
            x: margin + seeded(i + 100) * (viewW - margin * 2),
            y: margin + seeded(i + 110) * (viewH - margin * 2),
            len: 28 + seeded(i + 120) * 50,
            rot: seeded(i + 130) * Math.PI,
            thick: 1.4 + seeded(i + 140) * 1.8,
            wet: seeded(i + 150) > 0.45,
        });
    }

    for (let i = 0; i < 18; i++) {
        const side = Math.floor(seeded(i + 200) * 4);
        let x, y, ang;
        if (side === 0) { x = seeded(i + 210) * viewW; y = 4 + seeded(i + 220) * 18; ang = -0.2 + seeded(i + 230) * 0.4; }
        else if (side === 1) { x = seeded(i + 210) * viewW; y = viewH - 4 - seeded(i + 220) * 18; ang = Math.PI - 0.2 + seeded(i + 230) * 0.4; }
        else if (side === 2) { x = 4 + seeded(i + 220) * 18; y = seeded(i + 210) * viewH; ang = Math.PI * 0.5 - 0.25 + seeded(i + 230) * 0.5; }
        else { x = viewW - 4 - seeded(i + 220) * 18; y = seeded(i + 210) * viewH; ang = -Math.PI * 0.5 - 0.25 + seeded(i + 230) * 0.5; }
        reeds.push({
            x, y, ang,
            h: 22 + seeded(i + 240) * 38,
            sway: seeded(i + 250) * Math.PI * 2,
            green: 0.45 + seeded(i + 260) * 0.35,
        });
    }

    for (let i = 0; i < 7; i++) {
        lilies.push({
            x: margin * 1.4 + seeded(i + 300) * (viewW - margin * 2.8),
            y: margin * 1.4 + seeded(i + 310) * (viewH - margin * 2.8),
            r: 12 + seeded(i + 320) * 18,
            rot: seeded(i + 330) * Math.PI * 2,
            bob: seeded(i + 340) * Math.PI * 2,
        });
    }

    for (let i = 0; i < 10; i++) {
        const side = Math.floor(seeded(i + 400) * 4);
        let x, y, ang;
        if (side === 0) { x = seeded(i + 410) * viewW; y = 6 + seeded(i + 420) * 22; ang = -0.15 + seeded(i + 430) * 0.3; }
        else if (side === 1) { x = seeded(i + 410) * viewW; y = viewH - 6 - seeded(i + 420) * 22; ang = Math.PI + (-0.15 + seeded(i + 430) * 0.3); }
        else if (side === 2) { x = 6 + seeded(i + 420) * 22; y = seeded(i + 410) * viewH; ang = Math.PI * 0.5 + (-0.2 + seeded(i + 430) * 0.4); }
        else { x = viewW - 6 - seeded(i + 420) * 22; y = seeded(i + 410) * viewH; ang = -Math.PI * 0.5 + (-0.2 + seeded(i + 430) * 0.4); }
        cattails.push({
            x, y, ang,
            h: 34 + seeded(i + 440) * 46,
            sway: seeded(i + 450) * Math.PI * 2,
            green: 0.4 + seeded(i + 460) * 0.4,
        });
    }

    for (let i = 0; i < 12; i++) {
        duckweed.push({
            x: margin * 1.2 + seeded(i + 500) * (viewW - margin * 2.4),
            y: margin * 1.2 + seeded(i + 510) * (viewH - margin * 2.4),
            r: 16 + seeded(i + 520) * 28,
            rot: seeded(i + 530) * Math.PI * 2,
            bob: seeded(i + 540) * Math.PI * 2,
            density: 5 + Math.floor(seeded(i + 550) * 7),
        });
    }

    for (let i = 0; i < 9; i++) {
        leaves.push({
            x: margin + seeded(i + 600) * (viewW - margin * 2),
            y: margin + seeded(i + 610) * (viewH - margin * 2),
            len: 8 + seeded(i + 620) * 12,
            rot: seeded(i + 630) * Math.PI * 2,
            bob: seeded(i + 640) * Math.PI * 2,
            tone: 0.35 + seeded(i + 650) * 0.4,
        });
    }

    sceneryItems = { stones, sticks, reeds, lilies, cattails, duckweed, leaves };
    rebuildObstacles();
    rebuildPondBed();
}

// Pond floor texture: dirt, mud, rocks, and settled debris, seen through the water.
function rebuildPondBed() {
    if (!viewW || !viewH) return;
    const scale = 0.7;
    const w = Math.max(96, Math.floor(viewW * scale));
    const h = Math.max(96, Math.floor(viewH * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const b = c.getContext("2d");

    // Base dirt: mottled warm mud, no tiled wash.
    const base = b.createLinearGradient(0, 0, w * 0.2, h);
    base.addColorStop(0, "#3c3426");
    base.addColorStop(0.4, "#4c402c");
    base.addColorStop(0.75, "#322a20");
    base.addColorStop(1, "#282218");
    b.fillStyle = base;
    b.fillRect(0, 0, w, h);

    // Broad organic silt / clay stains (irregular blobs, not a lattice).
    for (let i = 0; i < 55; i++) {
        const x = seeded(i + 900) * w;
        const y = seeded(i + 910) * h;
        const rx = 18 + seeded(i + 920) * 85;
        const ry = 12 + seeded(i + 930) * 58;
        const g = b.createRadialGradient(x - rx * 0.15, y - ry * 0.1, 1, x, y, rx);
        const kind = seeded(i + 940);
        if (kind < 0.3) {
            g.addColorStop(0, "rgba(24, 20, 14, 0.72)");
            g.addColorStop(1, "rgba(24, 20, 14, 0)");
        } else if (kind < 0.55) {
            g.addColorStop(0, "rgba(98, 82, 50, 0.5)");
            g.addColorStop(1, "rgba(72, 60, 38, 0)");
        } else if (kind < 0.8) {
            g.addColorStop(0, "rgba(58, 64, 42, 0.4)");
            g.addColorStop(1, "rgba(40, 48, 34, 0)");
        } else {
            g.addColorStop(0, "rgba(120, 108, 78, 0.32)");
            g.addColorStop(1, "rgba(90, 80, 55, 0)");
        }
        b.fillStyle = g;
        b.beginPath();
        b.ellipse(x, y, rx, ry, seeded(i + 950) * Math.PI, 0, Math.PI * 2);
        b.fill();
    }

    // Fine silt dusting (soft noise, not a grid).
    for (let i = 0; i < 2200; i++) {
        const x = seeded(i + 980) * w;
        const y = seeded(i + 990) * h;
        const a = 0.05 + seeded(i + 1000) * 0.16;
        const warm = seeded(i + 1010);
        const c0 = 48 + warm * 78;
        const sz = seeded(i + 1020) > 0.85 ? 2 + seeded(i + 1025) * 2 : 1;
        b.fillStyle = `rgba(${c0},${c0 * (0.76 + warm * 0.12)},${c0 * (0.42 + warm * 0.18)},${a})`;
        b.fillRect(x, y, sz, 1 + seeded(i + 1030) * 1.4);
    }

    // Short local sand streaks in clearer pockets (never full-width stripes).
    for (let i = 0; i < 22; i++) {
        const x0 = seeded(i + 960) * w;
        const y0 = seeded(i + 965) * h;
        const span = 28 + seeded(i + 968) * 70;
        const ang = (seeded(i + 972) - 0.5) * 0.9;
        b.save();
        b.translate(x0, y0);
        b.rotate(ang);
        b.strokeStyle = `rgba(130, 112, 72, ${0.1 + seeded(i + 974) * 0.14})`;
        b.lineWidth = 0.8 + seeded(i + 976) * 1.1;
        b.lineCap = "round";
        b.beginPath();
        for (let t = 0; t <= 1.001; t += 0.08) {
            const x = (t - 0.5) * span;
            const y = Math.sin(t * 6.5 + i) * (1.2 + seeded(i + 978) * 2.4)
                + Math.sin(t * 14 + i * 0.7) * 0.8;
            if (t === 0) b.moveTo(x, y);
            else b.lineTo(x, y);
        }
        b.stroke();
        b.restore();
    }

    // Mixed gravel: pebbles of varied size, hue, and clustering.
    for (let i = 0; i < 340; i++) {
        const cluster = seeded(i + 1035) > 0.78;
        const cx = seeded(i + 1040) * w;
        const cy = seeded(i + 1050) * h;
        const count = cluster ? 2 + Math.floor(seeded(i + 1052) * 4) : 1;
        for (let j = 0; j < count; j++) {
            const x = cx + (cluster ? (seeded(i * 9 + j + 1054) - 0.5) * 10 : 0);
            const y = cy + (cluster ? (seeded(i * 9 + j + 1056) - 0.5) * 8 : 0);
            const r = 0.6 + seeded(i * 9 + j + 1060) * (cluster ? 2.4 : 3.6);
            const hue = seeded(i * 9 + j + 1070);
            let cr, cg, cb;
            if (hue < 0.35) {
                cr = 70 + hue * 90; cg = cr * 0.9; cb = cr * 0.72;
            } else if (hue < 0.65) {
                cr = 55 + hue * 60; cg = cr * 0.82; cb = cr * 0.55;
            } else if (hue < 0.85) {
                cr = 90 + hue * 40; cg = 85 + hue * 35; cb = 70 + hue * 25;
            } else {
                cr = 50 + hue * 30; cg = 58 + hue * 28; cb = 48 + hue * 22;
            }
            b.fillStyle = `rgba(${cr},${cg},${cb},${0.4 + seeded(i * 9 + j + 1080) * 0.45})`;
            b.beginPath();
            b.ellipse(x, y, r, r * (0.55 + seeded(i * 9 + j + 1090) * 0.5), seeded(i * 9 + j + 1100) * Math.PI, 0, Math.PI * 2);
            b.fill();
            if (seeded(i * 9 + j + 1105) > 0.65) {
                b.fillStyle = `rgba(${cr + 28},${cg + 22},${cb + 12},0.3)`;
                b.beginPath();
                b.ellipse(x - r * 0.22, y - r * 0.2, r * 0.32, r * 0.22, 0, 0, Math.PI * 2);
                b.fill();
            }
        }
    }

    // Larger river stones: rounded cobbles, flat slabs, and a few angular chips.
    for (let i = 0; i < 85; i++) {
        const x = seeded(i + 1110) * w;
        const y = seeded(i + 1120) * h;
        const r = 3.5 + seeded(i + 1130) * 18;
        const shape = seeded(i + 1135);
        const facets = shape < 0.4 ? 0 : 5 + Math.floor(seeded(i + 1140) * 6);
        const tone = seeded(i + 1150);
        const c0 = 48 + tone * 70;
        const mossy = seeded(i + 1155) > 0.7;
        const wet = seeded(i + 1157) > 0.55;
        b.save();
        b.translate(x, y);
        b.rotate(seeded(i + 1160) * Math.PI);
        b.beginPath();
        if (facets === 0) {
            // Smooth cobble.
            b.ellipse(0, 0, r, r * (0.55 + seeded(i + 1162) * 0.35), 0, 0, Math.PI * 2);
        } else {
            for (let k = 0; k < facets; k++) {
                const a = (k / facets) * Math.PI * 2;
                const rr = r * (0.62 + seeded(i * 13 + k + 1170) * 0.55);
                const flat = shape > 0.75 ? 0.5 : 0.7;
                const px = Math.cos(a) * rr;
                const py = Math.sin(a) * rr * flat;
                if (k === 0) b.moveTo(px, py);
                else b.lineTo(px, py);
            }
            b.closePath();
        }
        const rg = b.createRadialGradient(-r * 0.28, -r * 0.32, 1, 0, 0, r);
        if (tone < 0.25) {
            rg.addColorStop(0, `rgba(${c0 + 40},${c0 + 34},${c0 + 22},0.92)`);
            rg.addColorStop(0.55, `rgba(${c0 + 8},${c0},${c0 - 8},0.88)`);
            rg.addColorStop(1, `rgba(${c0 - 18},${c0 - 16},${c0 - 14},0.82)`);
        } else if (tone < 0.55) {
            rg.addColorStop(0, `rgba(${c0 + 28},${c0 + 22},${c0 + 12},0.9)`);
            rg.addColorStop(0.55, `rgba(${c0},${c0 - 6},${c0 - 14},0.86)`);
            rg.addColorStop(1, `rgba(${c0 - 24},${c0 - 22},${c0 - 20},0.8)`);
        } else if (tone < 0.8) {
            rg.addColorStop(0, `rgba(${c0 + 18},${c0 + 24},${c0 + 16},0.88)`);
            rg.addColorStop(0.55, `rgba(${c0 - 4},${c0},${c0 - 6},0.84)`);
            rg.addColorStop(1, `rgba(${c0 - 20},${c0 - 16},${c0 - 18},0.8)`);
        } else {
            rg.addColorStop(0, `rgba(${c0 + 35},${c0 + 28},${c0 + 18},0.9)`);
            rg.addColorStop(0.55, `rgba(${c0 + 10},${c0 + 4},${c0 - 6},0.85)`);
            rg.addColorStop(1, `rgba(${c0 - 16},${c0 - 18},${c0 - 22},0.8)`);
        }
        b.fillStyle = rg;
        b.fill();
        b.strokeStyle = `rgba(${c0 - 30},${c0 - 26},${c0 - 22},${wet ? 0.55 : 0.35})`;
        b.lineWidth = wet ? 1 : 0.7;
        b.stroke();
        if (seeded(i + 1175) > 0.4) {
            b.strokeStyle = `rgba(${c0 - 38},${c0 - 32},${c0 - 30},0.3)`;
            b.lineWidth = 0.6;
            b.beginPath();
            b.moveTo(-r * 0.45, -r * 0.08);
            b.quadraticCurveTo(0, r * (seeded(i + 1176) - 0.35) * 0.35, r * 0.4, -r * 0.12);
            b.stroke();
        }
        if (mossy) {
            b.fillStyle = `rgba(${48 + seeded(i + 1178) * 20}, ${78 + seeded(i + 1179) * 25}, 40, 0.32)`;
            b.beginPath();
            b.ellipse(-r * 0.08, r * 0.12, r * (0.28 + seeded(i + 1181) * 0.2), r * 0.18, 0.35, 0, Math.PI * 2);
            b.fill();
        }
        b.restore();
    }

    // Twigs and stick scraps on the mud.
    for (let i = 0; i < 40; i++) {
        const x = seeded(i + 1180) * w;
        const y = seeded(i + 1190) * h;
        const len = 5 + seeded(i + 1195) * 24;
        const ang = seeded(i + 1198) * Math.PI;
        const c0 = 42 + seeded(i + 1199) * 38;
        b.save();
        b.translate(x, y);
        b.rotate(ang);
        b.strokeStyle = `rgba(${c0},${c0 * 0.68},${c0 * 0.38},0.62)`;
        b.lineWidth = 0.7 + seeded(i + 1201) * 1.5;
        b.lineCap = "round";
        b.beginPath();
        b.moveTo(-len * 0.5, 0);
        b.quadraticCurveTo(0, (seeded(i + 1202) - 0.5) * 5, len * 0.5, 0);
        b.stroke();
        if (seeded(i + 1203) > 0.55) {
            b.beginPath();
            b.moveTo(len * 0.1, 0);
            b.lineTo(len * 0.35, -len * 0.25);
            b.stroke();
        }
        b.restore();
    }

    // Leaf litter and soft debris flakes.
    for (let i = 0; i < 52; i++) {
        const x = seeded(i + 1210) * w;
        const y = seeded(i + 1220) * h;
        const len = 2.5 + seeded(i + 1230) * 9;
        b.save();
        b.translate(x, y);
        b.rotate(seeded(i + 1240) * Math.PI * 2);
        const brown = 65 + seeded(i + 1250) * 55;
        b.fillStyle = `rgba(${brown},${brown * 0.62},${brown * 0.26},${0.3 + seeded(i + 1260) * 0.38})`;
        b.beginPath();
        b.ellipse(0, 0, len, len * (0.32 + seeded(i + 1262) * 0.2), 0, 0, Math.PI * 2);
        b.fill();
        b.strokeStyle = `rgba(${brown - 22},${brown * 0.42},18,0.3)`;
        b.lineWidth = 0.5;
        b.beginPath();
        b.moveTo(-len * 0.7, 0);
        b.lineTo(len * 0.7, 0);
        b.stroke();
        b.restore();
    }

    // Pale shell chips and bone-colored bits.
    for (let i = 0; i < 26; i++) {
        const x = seeded(i + 1270) * w;
        const y = seeded(i + 1280) * h;
        b.save();
        b.translate(x, y);
        b.rotate(seeded(i + 1290) * Math.PI * 2);
        b.strokeStyle = `rgba(175, 158, 118, ${0.3 + seeded(i + 1300) * 0.32})`;
        b.lineWidth = 1;
        b.beginPath();
        b.ellipse(0, 0, 2.2 + seeded(i + 1310) * 5.5, 1.2 + seeded(i + 1320) * 2.6, 0, 0.15, Math.PI * 1.45);
        b.stroke();
        b.restore();
    }

    // Darker sunk pockets in the silt.
    for (let i = 0; i < 20; i++) {
        const x = seeded(i + 1330) * w;
        const y = seeded(i + 1340) * h;
        const g = b.createRadialGradient(x, y, 1, x, y, 7 + seeded(i + 1350) * 16);
        g.addColorStop(0, "rgba(16, 14, 10, 0.48)");
        g.addColorStop(1, "rgba(16, 14, 10, 0)");
        b.fillStyle = g;
        b.beginPath();
        b.ellipse(x, y, 9 + seeded(i + 1360) * 14, 5 + seeded(i + 1370) * 9, seeded(i + 1380) * Math.PI, 0, Math.PI * 2);
        b.fill();
    }

    // Light water tint: keep the dirt readable, slight warm submerged cast.
    const murk = b.createRadialGradient(w * 0.5, h * 0.4, w * 0.08, w * 0.5, h * 0.55, w * 0.8);
    murk.addColorStop(0, "rgba(40, 68, 62, 0.07)");
    murk.addColorStop(0.55, "rgba(22, 44, 46, 0.13)");
    murk.addColorStop(1, "rgba(12, 26, 28, 0.26)");
    b.fillStyle = murk;
    b.fillRect(0, 0, w, h);

    pondBedCanvas = c;
}

function drawPondBed(ctx) {
    if (!scenery.bed || !pondBedCanvas) return;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 1;
    ctx.drawImage(pondBedCanvas, 0, 0, viewW, viewH);
    // Thin water-column veil so it still feels submerged, without hiding the floor.
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "rgba(22, 48, 46, 1)";
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
}

function sunShadowDir() {
    // Golden-hour light from above-right: longer shadows fall left and a bit down.
    return { x: -0.58, y: 0.52 };
}

// Transform to the sun-offset floor contact and slightly squash so the silhouette sits on the bed.
function withFloorShadow(ctx, x, y, sizeHint, alpha, rot, drawFn) {
    const d = sunShadowDir();
    const len = 22 + Math.max(8, sizeHint) * 0.95;
    ctx.save();
    ctx.translate(x + d.x * len, y + d.y * len);
    ctx.scale(1, 0.58);
    if (rot != null) ctx.rotate(rot);
    ctx.fillStyle = `rgba(12, 10, 8, ${Math.min(0.78, alpha * 1.15)})`;
    drawFn(ctx);
    ctx.restore();
}

// Fallback oval when a shape path is not available.
function drawFloorShadow(ctx, x, y, rx, ry, alpha, rot) {
    withFloorShadow(ctx, x, y, Math.max(rx, ry), alpha, rot ?? Math.atan2(sunShadowDir().y, sunShadowDir().x), (c) => {
        c.beginPath();
        c.ellipse(0, 0, rx * 1.02, ry * 1.05, 0, 0, Math.PI * 2);
        c.fill();
    });
}

function drawSoftShadowBlob(ctx, x, y, rx, ry, alpha) {
    drawFloorShadow(ctx, x, y, rx, ry, alpha);
}

function pathLilyPad(ctx, r) {
    ctx.beginPath();
    const lobes = 12;
    for (let i = 0; i <= lobes; i++) {
        const t0 = 0.28 + (i / lobes) * (Math.PI * 2 - 0.56);
        const lobe = 0.9 + 0.1 * Math.sin(i * 2.2);
        const x = Math.cos(t0) * r * lobe;
        const y = Math.sin(t0) * r * 0.88 * lobe;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.lineTo(0, 0);
    ctx.closePath();
}

function pathFacetRockOutline(ctx, o) {
    const facets = o.facets || 8;
    const profile = o.profile || makeObstacleDetail(2, facets, 3);
    ctx.beginPath();
    for (let i = 0; i < facets; i++) {
        const a = (i / facets) * Math.PI * 2 - 0.4;
        const rr = o.r * (0.72 + profile[i % profile.length] * 0.35);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr * 0.72;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

function pathPlankOutline(ctx, o) {
    const profile = o.profile || [];
    ctx.beginPath();
    ctx.moveTo(-o.len * 0.5, -o.thick * 0.5);
    for (let i = 0; i < 6; i++) {
        const t = i / 5;
        ctx.lineTo(-o.len * 0.5 + o.len * t, -o.thick * (0.45 + (profile[i] || 1) * 0.08));
    }
    ctx.lineTo(o.len * 0.5, o.thick * 0.5);
    for (let i = 5; i >= 0; i--) {
        const t = i / 5;
        ctx.lineTo(-o.len * 0.5 + o.len * t, o.thick * (0.4 + (profile[i] || 1) * 0.1));
    }
    ctx.closePath();
}

function pathPotSilhouette(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.42, r * 0.58);
    ctx.bezierCurveTo(-r * 0.95, r * 0.15, -r * 0.88, -r * 0.25, -r * 0.38, -r * 0.52);
    ctx.quadraticCurveTo(-r * 0.1, -r * 0.62, r * 0.12, -r * 0.58);
    ctx.bezierCurveTo(r * 0.55, -r * 0.52, r * 0.95, -r * 0.1, r * 0.62, r * 0.55);
    ctx.quadraticCurveTo(0.1, r * 0.72, -r * 0.42, r * 0.58);
    ctx.closePath();
}

function pathStumpOutline(ctx, o) {
    const facets = 9;
    const profile = o.profile || makeObstacleDetail(3, facets, 4);
    ctx.beginPath();
    for (let i = 0; i < facets; i++) {
        const a = (i / facets) * Math.PI * 2;
        const rr = o.r * (0.75 + profile[i % profile.length] * 0.3);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr * 0.68;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

function pathObstacleShadow(ctx, o) {
    if (o.kind === "log" || o.kind === "driftwood") {
        const thick = o.kind === "driftwood" ? o.thick * 0.85 : o.thick;
        const profile = o.profile || makeObstacleDetail(1, 10, 1);
        const endJags = o.knobs || [1, 0.75, 1.15, 0.85];
        pathJaggedCapsule(ctx, o.len, thick, profile, endJags);
    } else if (o.kind === "plank") {
        pathPlankOutline(ctx, o);
    } else if (o.kind === "boulder" || o.kind === "mossrock") {
        pathFacetRockOutline(ctx, o);
    } else if (o.kind === "crate") {
        pathWornCrate(ctx, o.r * 1.55, o.profile);
    } else if (o.kind === "barrel") {
        pathBarrelSilhouette(ctx, o.r * 0.88, o.r, o.profile);
    } else if (o.kind === "pot") {
        pathPotSilhouette(ctx, o.r);
    } else if (o.kind === "reedraft") {
        ctx.beginPath();
        ctx.ellipse(0, o.r * 0.1, o.r * 0.7, o.r * 0.45, 0, 0, Math.PI * 2);
    } else {
        pathStumpOutline(ctx, o);
    }
}

function fishShadowDims(f) {
    const shape = f.type.shape || "oval";
    const slim = f.type.slim != null ? f.type.slim
        : shape === "slim" ? 0.58
        : shape === "round" ? 0.72
        : shape === "diamond" ? 0.85
        : shape === "longfin" ? 0.55
        : shape === "koi" ? 0.62
        : 0.5;
    const L = f.size;
    const W = f.size * 0.5 * slim;
    return { L, W, shape };
}

function fillFishShadowPaths(ctx, L, W, shape) {
    // Tail lobe.
    ctx.beginPath();
    if (shape === "koi" || shape === "longfin") {
        ctx.moveTo(-L * 0.4, 0);
        ctx.bezierCurveTo(-L * 0.62, -W * 0.9, -L * 0.85, -W * 1.35, -L * 1.08, -W * 1.05);
        ctx.quadraticCurveTo(-L * 0.78, -W * 0.15, -L * 0.55, 0);
        ctx.quadraticCurveTo(-L * 0.78, W * 0.15, -L * 1.08, W * 1.05);
        ctx.bezierCurveTo(-L * 0.85, W * 1.35, -L * 0.62, W * 0.9, -L * 0.4, 0);
    } else if (shape === "diamond") {
        ctx.moveTo(-L * 0.34, 0);
        ctx.quadraticCurveTo(-L * 0.55, -W * 0.9, -L * 0.78, -W * 1.45);
        ctx.quadraticCurveTo(-L * 0.58, 0, -L * 0.78, W * 1.45);
        ctx.quadraticCurveTo(-L * 0.55, W * 0.9, -L * 0.34, 0);
    } else {
        ctx.moveTo(-L * 0.42, 0);
        ctx.quadraticCurveTo(-L * 0.62, -W * 0.55, -L * 0.92, -W * 0.95);
        ctx.quadraticCurveTo(-L * 0.7, 0, -L * 0.92, W * 0.95);
        ctx.quadraticCurveTo(-L * 0.62, W * 0.55, -L * 0.42, 0);
    }
    ctx.fill();
    // Body.
    if (shape === "diamond") {
        ctx.beginPath();
        ctx.moveTo(L * 0.48, 0);
        ctx.bezierCurveTo(L * 0.2, -W * 0.9, -L * 0.05, -W * 1.2, -L * 0.38, 0);
        ctx.bezierCurveTo(-L * 0.05, W * 1.2, L * 0.2, W * 0.9, L * 0.48, 0);
        ctx.closePath();
    } else {
        pathFishFusiform(ctx, L, W, shape);
    }
    ctx.fill();
}

function fillReptileShadowPaths(ctx, r) {
    const L = r.size;
    const W = r.size * (r.kind === "alligator" ? 0.34 : 0.28);
    const snout = r.kind === "alligator" ? 0.22 : 0.32;
    ctx.beginPath();
    ctx.moveTo(-L * 0.4, 0);
    ctx.lineTo(-L * 0.85, -W * 0.7);
    ctx.lineTo(-L * 0.7, 0);
    ctx.lineTo(-L * 0.85, W * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.42, W, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    if (r.kind === "alligator") {
        ctx.ellipse(L * 0.38, 0, L * snout, W * 0.85, 0, 0, Math.PI * 2);
    } else {
        ctx.moveTo(L * 0.25, -W * 0.45);
        ctx.lineTo(L * 0.62, -W * 0.22);
        ctx.lineTo(L * 0.62, W * 0.22);
        ctx.lineTo(L * 0.25, W * 0.45);
        ctx.closePath();
    }
    ctx.fill();
}

function fillSharkShadowPaths(ctx, L, W) {
    ctx.beginPath();
    ctx.moveTo(-L * 0.48, 0);
    ctx.lineTo(-L * 0.78, -W * 0.75);
    ctx.lineTo(-L * 0.64, 0);
    ctx.lineTo(-L * 0.78, W * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.48, W, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(L * 0.42, 0, L * 0.2, W * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -W * 0.65);
    ctx.lineTo(-L * 0.1, -W * 1.35);
    ctx.lineTo(-L * 0.22, -W * 0.65);
    ctx.closePath();
    ctx.fill();
}

function fillWhaleShadowPaths(ctx, L, W) {
    ctx.beginPath();
    ctx.moveTo(-L * 0.46, 0);
    ctx.lineTo(-L * 0.74, -W * 0.95);
    ctx.lineTo(-L * 0.6, 0);
    ctx.lineTo(-L * 0.74, W * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.46, W, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(L * 0.4, 0, L * 0.17, W * 0.68, 0, 0, Math.PI * 2);
    ctx.fill();
}

// Soft organic caustic shimmer on the pond bed (no lattice, no sun rays).
function drawBedCaustics(ctx) {
    if (!scenery.sun) return;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const t = sunPhase;

    // Scattered warm light pools that drift slowly (organic, not a grid).
    for (let n = 0; n < 18; n++) {
        const x = ((n * 137.1 + Math.sin(t * 0.35 + n * 1.7) * 55 + Math.cos(t * 0.22 + n) * 30) % viewW + viewW) % viewW;
        const y = ((n * 89.4 + Math.cos(t * 0.28 + n * 1.1) * 48 + Math.sin(t * 0.18 + n * 0.6) * 25) % viewH + viewH) % viewH;
        const tw = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.9 + n * 1.3));
        const rr = 22 + tw * 28 + (n % 5) * 4;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, `rgba(255, 220, 150, ${0.05 * tw})`);
        g.addColorStop(0.4, `rgba(255, 200, 120, ${0.028 * tw})`);
        g.addColorStop(1, "rgba(255, 180, 90, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, rr, rr * (0.55 + (n % 3) * 0.12), n * 0.7, 0, Math.PI * 2);
        ctx.fill();
    }

    // A few short, irregular warm ribbons (never evenly spaced H/V lines).
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let n = 0; n < 9; n++) {
        const x0 = ((n * 211.7 + Math.sin(t * 0.4 + n) * 80) % viewW + viewW) % viewW;
        const y0 = ((n * 163.3 + Math.cos(t * 0.33 + n * 1.4) * 70) % viewH + viewH) % viewH;
        const len = 40 + (n % 4) * 28;
        const ang = n * 0.9 + Math.sin(t * 0.25 + n) * 0.5;
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.75 + n * 1.1);
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
            const u = i / 10;
            const x = x0 + Math.cos(ang) * (u - 0.5) * len
                + Math.sin(u * 5 + t * 0.8 + n) * 8;
            const y = y0 + Math.sin(ang) * (u - 0.5) * len * 0.65
                + Math.cos(u * 4.2 + t * 0.6 + n) * 6;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(255, 210, 140, ${0.035 + pulse * 0.03})`;
        ctx.lineWidth = 1.4 + (n % 3) * 0.5;
        ctx.stroke();
    }
    ctx.restore();
}

function drawSunContactShadows(ctx) {
    if (!scenery.sun) return;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.95;

    if (scenery.debris) {
        for (const o of obstacles) {
            const hint = isLongObstacle(o) ? o.len * 0.45 : obstacleRadius(o);
            withFloorShadow(ctx, o.x, o.y, hint, isLongObstacle(o) ? 0.58 : 0.55, o.rot, (c) => {
                if (o.kind === "driftwood") {
                    pathJaggedCapsule(c, o.len, o.thick * 0.85, o.profile, o.knobs);
                    c.fill();
                    const fork = o.fork || 0.45;
                    c.beginPath();
                    c.moveTo(o.len * 0.05, -o.thick * 0.1);
                    c.quadraticCurveTo(o.len * 0.25, -o.thick * (0.8 + fork), o.len * 0.42, -o.thick * (1.1 + fork));
                    c.lineTo(o.len * 0.38, -o.thick * (0.7 + fork));
                    c.quadraticCurveTo(o.len * 0.2, -o.thick * 0.35, o.len * 0.02, 0);
                    c.closePath();
                    c.fill();
                } else {
                    pathObstacleShadow(c, o);
                    c.fill();
                }
            });
        }
    }
    if (scenery.stones) {
        for (const s of sceneryItems.stones) {
            if (!s.profile) s.profile = makeObstacleDetail(Math.floor(s.x + s.y), 9, 5);
            withFloorShadow(ctx, s.x, s.y, Math.max(s.rx, s.ry), 0.5, s.rot, (c) => {
                pathOrganicOval(c, s.rx * 1.05, s.ry * 0.95, 9, s.profile, 0.2);
                c.fill();
            });
        }
    }
    if (scenery.lilies) {
        for (const L of sceneryItems.lilies) {
            withFloorShadow(ctx, L.x, L.y, L.r, 0.52, L.rot, (c) => {
                pathLilyPad(c, L.r);
                c.fill();
            });
        }
    }
    ctx.restore();
}

function drawSunCreatureShadows(ctx) {
    if (!scenery.sun) return;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.95;
    for (const f of fishes) {
        if (f.dead) continue;
        const { L, W, shape } = fishShadowDims(f);
        const scale = f.golden ? (1 - (f.sinkDepth || 0) * 0.35) : 1;
        const yOff = f.golden ? (f.sinkDepth || 0) * 6 : 0;
        withFloorShadow(ctx, f.x, f.y + yOff, L, f.golden ? 0.45 : 0.6, f.dir, (c) => {
            c.scale(scale, scale);
            fillFishShadowPaths(c, L, W, shape);
        });
    }
    for (const r of reptiles) {
        if (r.dead) continue;
        withFloorShadow(ctx, r.x, r.y, r.size, 0.58, r.dir, (c) => {
            fillReptileShadowPaths(c, r);
        });
    }
    if (shark && !shark.dead) {
        const L = shark.size;
        const W = shark.size * 0.38;
        withFloorShadow(ctx, shark.x, shark.y, L, 0.62, shark.dir, (c) => {
            fillSharkShadowPaths(c, L, W);
        });
    }
    if (whale && !whale.dead) {
        const L = whale.size;
        const W = whale.size * 0.3;
        withFloorShadow(ctx, whale.x, whale.y, L, 0.52, whale.dir, (c) => {
            fillWhaleShadowPaths(c, L, W);
        });
    }
    ctx.restore();
}

// Warm golden-hour wash from the viewer: amber light, no sun disc, no rays.
function drawSunAmbience(ctx) {
    if (!scenery.sun) return;
    const shimmer = 0.5 + 0.5 * Math.sin(sunPhase * 0.55);

    ctx.save();

    // Golden-hour amber wash, a bit stronger toward the top of the frame.
    ctx.globalCompositeOperation = "soft-light";
    const wash = ctx.createLinearGradient(0, 0, 0, viewH);
    wash.addColorStop(0, `rgba(255, 210, 140, ${0.24 + shimmer * 0.04})`);
    wash.addColorStop(0.4, "rgba(255, 180, 100, 0.12)");
    wash.addColorStop(1, "rgba(90, 55, 40, 0.12)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, viewW, viewH);

    // Soft warm glow near the light source, still no beams.
    ctx.globalCompositeOperation = "screen";
    const hot = ctx.createRadialGradient(
        viewW * 0.62, viewH * 0.18, 18,
        viewW * 0.52, viewH * 0.42, Math.max(viewW, viewH) * 0.68
    );
    hot.addColorStop(0, `rgba(255, 220, 150, ${0.09 + shimmer * 0.025})`);
    hot.addColorStop(0.45, "rgba(255, 170, 90, 0.035)");
    hot.addColorStop(1, "rgba(200, 120, 60, 0)");
    ctx.fillStyle = hot;
    ctx.fillRect(0, 0, viewW, viewH);

    // Warm edge shade so the glow reads without drawing a sun.
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.38;
    const shade = ctx.createRadialGradient(
        viewW * 0.55, viewH * 0.32, viewH * 0.14,
        viewW * 0.5, viewH * 0.52, Math.max(viewW, viewH) * 0.74
    );
    shade.addColorStop(0, "rgba(255, 248, 230, 1)");
    shade.addColorStop(0.6, "rgba(245, 220, 185, 1)");
    shade.addColorStop(1, "rgba(70, 48, 38, 1)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.restore();
}

function isLongObstacle(o) {
    return o.kind === "log" || o.kind === "plank" || o.kind === "driftwood";
}

function makeObstacleDetail(i, n, scale) {
    const pts = [];
    for (let k = 0; k < n; k++) {
        pts.push(0.65 + seeded(i * 17 + k * 3 + scale * 11) * 0.55);
    }
    return pts;
}

function rebuildObstacles() {
    const next = [];
    const pad = Math.min(viewW, viewH) * 0.12;
    // Shore and lake clutter: weathered wood, stone, and a few human remnants.
    const kinds = [
        "boulder", "log", "log", "stump", "plank", "driftwood",
        "mossrock", "pot", "reedraft", "crate", "barrel",
    ];
    for (let i = 0; i < 13; i++) {
        const kind = kinds[Math.floor(seeded(i + 700) * kinds.length)];
        const x = pad + seeded(i + 710) * (viewW - pad * 2);
        const y = pad + seeded(i + 720) * (viewH - pad * 2);
        const base = {
            kind, x, y,
            rot: seeded(i + 740) * Math.PI,
            tone: 0.3 + seeded(i + 750) * 0.4,
            moss: 0.15 + seeded(i + 755) * 0.55,
            vx: 0, vy: 0, spin: 0,
            profile: makeObstacleDetail(i, 10, 1),
            knobs: makeObstacleDetail(i, 5, 2),
        };
        if (kind === "boulder" || kind === "mossrock") {
            next.push({
                ...base,
                r: 24 + seeded(i + 730) * 30,
                facets: 7 + Math.floor(seeded(i + 735) * 4),
            });
        } else if (kind === "log") {
            next.push({
                ...base,
                len: 78 + seeded(i + 730) * 78,
                thick: 15 + seeded(i + 740) * 13,
                broken: seeded(i + 745) > 0.45,
            });
        } else if (kind === "driftwood") {
            next.push({
                ...base,
                len: 72 + seeded(i + 730) * 70,
                thick: 10 + seeded(i + 740) * 8,
                fork: 0.35 + seeded(i + 748) * 0.35,
            });
        } else if (kind === "plank") {
            next.push({
                ...base,
                len: 80 + seeded(i + 730) * 90,
                thick: 7 + seeded(i + 740) * 6,
            });
        } else if (kind === "crate") {
            next.push({
                ...base,
                r: 20 + seeded(i + 730) * 16,
                rot: seeded(i + 740) * Math.PI * 0.5,
            });
        } else if (kind === "barrel") {
            next.push({
                ...base,
                r: 22 + seeded(i + 730) * 18,
            });
        } else if (kind === "pot") {
            next.push({
                ...base,
                r: 16 + seeded(i + 730) * 14,
            });
        } else if (kind === "reedraft") {
            next.push({
                ...base,
                r: 20 + seeded(i + 730) * 16,
                stems: 5 + Math.floor(seeded(i + 742) * 4),
            });
        } else {
            next.push({
                ...base,
                kind: "stump",
                r: 18 + seeded(i + 730) * 16,
            });
        }
    }
    obstacles = next;
    grabbedObstacle = null;
    grabAim = null;
}

function obstacleMass(o) {
    if (o.kind === "boulder" || o.kind === "mossrock") return 1.85;
    if (o.kind === "barrel") return 1.45;
    if (o.kind === "crate") return 1.25;
    if (o.kind === "log") return 1.35;
    if (o.kind === "driftwood") return 1.05;
    if (o.kind === "plank") return 0.95;
    if (o.kind === "pot") return 1.15;
    if (o.kind === "reedraft") return 0.85;
    return 1.1;
}

// Heavy water resistance: debris lags behind a fast cursor, coasts, and yaws in the flow.
function updateObstacles(dt) {
    const pad = 24;
    for (const o of obstacles) {
        if (!o.vx) o.vx = 0;
        if (!o.vy) o.vy = 0;
        if (o.spin == null) o.spin = 0;
        const mass = obstacleMass(o);

        if (o === grabbedObstacle && grabAim) {
            const dx = grabAim.x - o.x;
            const dy = grabAim.y - o.y;
            const dist = Math.hypot(dx, dy);
            // Soft spring + strong damping: feels like dragging through water.
            const pull = 2.1 / mass;
            o.vx += dx * pull * dt;
            o.vy += dy * pull * dt;
            const damp = Math.exp(-3.8 * dt);
            o.vx *= damp;
            o.vy *= damp;
            // Cap so a whip of the mouse still trails behind.
            const maxSpd = 150 / mass;
            const spd = Math.hypot(o.vx, o.vy);
            if (spd > maxSpd) {
                o.vx *= maxSpd / spd;
                o.vy *= maxSpd / spd;
            }
            // Extra lag when the cursor is far ahead.
            if (dist > 90) {
                o.vx *= 0.92;
                o.vy *= 0.92;
            }
            // Light torque while hauled: slow yaw, not a spin cycle.
            if (dist > 4) {
                const pullAng = Math.atan2(dy, dx);
                const align = isLongObstacle(o) ? pullAng : pullAng + Math.PI * 0.2;
                o.spin += normAngle(align - o.rot) * (0.85 / mass) * dt;
            }
        } else if (o.vx * o.vx + o.vy * o.vy > 4) {
            // Coast and settle after release.
            const coast = Math.exp(-2.6 * dt);
            o.vx *= coast;
            o.vy *= coast;
            o.spin *= Math.exp(-3.2 * dt);
        } else {
            o.vx = 0;
            o.vy = 0;
            o.spin *= Math.exp(-5.5 * dt);
            if (Math.abs(o.spin) < 0.01) o.spin = 0;
        }

        if (o.vx || o.vy || o.spin) {
            o.x = Math.max(pad, Math.min(viewW - pad, o.x + o.vx * dt));
            o.y = Math.max(pad, Math.min(viewH - pad, o.y + o.vy * dt));

            const spd = Math.hypot(o.vx, o.vy);
            if (spd > 6) {
                const travelAng = Math.atan2(o.vy, o.vx);
                if (isLongObstacle(o)) {
                    // Long axis gently lines up with the current.
                    const diff = normAngle(travelAng - o.rot);
                    o.rot += diff * Math.min(1, dt * 1.2);
                    o.spin += diff * 0.18 * dt;
                } else {
                    // Chunkier debris only drifts a little in yaw.
                    o.spin += (o.vx * 0.004 + o.vy * 0.003) * dt * 10;
                    const diff = normAngle(travelAng - o.rot);
                    o.rot += diff * Math.min(1, dt * 0.45);
                }
            }
            o.spin = Math.max(-1.8, Math.min(1.8, o.spin));
            o.rot += o.spin * dt;
            o.spin *= Math.exp(-2.6 * dt);

            if (spd > 18) {
                const wake = Math.min(1, spd / 120);
                if (Math.random() < 0.35 + wake * 0.5) {
                    water.disturb(o.x, o.y, obstacleRadius(o) * (0.4 + wake * 0.5), 40 + wake * 90);
                }
                scareFishFromDebris(o, spd);
            }
        }
    }

    // Debris can smack into each other and bounce.
    resolveObstacleCollisions();
    resolveObstacleCollisions();
}

function resolveObstacleCollisions() {
    const pad = 24;
    for (let i = 0; i < obstacles.length; i++) {
        for (let j = i + 1; j < obstacles.length; j++) {
            const a = obstacles[i];
            const b = obstacles[j];
            const ra = obstacleRadius(a);
            const rb = obstacleRadius(b);
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let dist = Math.hypot(dx, dy);
            const minDist = ra + rb;
            if (dist >= minDist) continue;
            if (dist < 0.001) {
                dx = 1;
                dy = 0;
                dist = 1;
            }
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;
            const ma = obstacleMass(a);
            const mb = obstacleMass(b);
            const invSum = 1 / (ma + mb);
            a.x -= nx * overlap * mb * invSum;
            a.y -= ny * overlap * mb * invSum;
            b.x += nx * overlap * ma * invSum;
            b.y += ny * overlap * ma * invSum;
            a.x = Math.max(pad, Math.min(viewW - pad, a.x));
            a.y = Math.max(pad, Math.min(viewH - pad, a.y));
            b.x = Math.max(pad, Math.min(viewW - pad, b.x));
            b.y = Math.max(pad, Math.min(viewH - pad, b.y));

            const rvx = (b.vx || 0) - (a.vx || 0);
            const rvy = (b.vy || 0) - (a.vy || 0);
            const velAlong = rvx * nx + rvy * ny;
            if (velAlong >= 0) continue; // already separating

            const restitution = 0.48;
            const impulse = -(1 + restitution) * velAlong / (1 / ma + 1 / mb);
            a.vx = (a.vx || 0) - (impulse / ma) * nx;
            a.vy = (a.vy || 0) - (impulse / ma) * ny;
            b.vx = (b.vx || 0) + (impulse / mb) * nx;
            b.vy = (b.vy || 0) + (impulse / mb) * ny;

            // Glancing hits add a little yaw, kept mild in water.
            const tangent = rvx * (-ny) + rvy * nx;
            a.spin = (a.spin || 0) - tangent * 0.01 / ma;
            b.spin = (b.spin || 0) + tangent * 0.01 / mb;

            const impact = Math.abs(impulse);
            if (impact > 18) {
                const mx = (a.x + b.x) * 0.5;
                const my = (a.y + b.y) * 0.5;
                water.disturb(mx, my, 10 + impact * 0.12, 50 + impact * 1.2);
                if (impact > 32) {
                    scareFishFromDebris({ x: mx, y: my, kind: "boulder", r: (ra + rb) * 0.45 }, impact * 2.2);
                }
            }
        }
    }
}

// Nearby fish flinch and swim away from a hauled boulder or log.
function scareFishFromDebris(o, spd) {
    const reach = obstacleRadius(o) + 55 + spd * 0.35;
    for (const f of fishes) {
        if (f.dead || f.golden || f.rainbowLeaving) continue;
        const d = Math.hypot(f.x - o.x, f.y - o.y);
        if (d >= reach || d < 1) continue;
        const force = (1 - d / reach) * Math.min(1.4, spd / 90);
        f.debrisFlee = {
            x: o.x,
            y: o.y,
            t: 0.35 + force * 0.45,
            force,
        };
        // Small positional shove so the reaction is immediate.
        f.x += ((f.x - o.x) / d) * force * 2.2;
        f.y += ((f.y - o.y) / d) * force * 2.2;
    }
}

function obstacleRadius(o) {
    if (isLongObstacle(o)) return Math.max(o.thick, o.len * 0.28);
    if (o.kind === "crate") return o.r * 0.95;
    if (o.kind === "reedraft") return o.r * 1.05;
    return o.r;
}

function obstacleAt(x, y) {
    if (!scenery.debris) return null;
    let best = null, bd = 16;
    for (const o of obstacles) {
        let d;
        if (isLongObstacle(o)) {
            const ca = Math.cos(o.rot), sa = Math.sin(o.rot);
            const lx = (x - o.x) * ca + (y - o.y) * sa;
            const ly = -(x - o.x) * sa + (y - o.y) * ca;
            const dx = Math.max(Math.abs(lx) - o.len * 0.5, 0);
            const dy = Math.max(Math.abs(ly) - o.thick * 0.55, 0);
            d = Math.hypot(dx, dy);
        } else if (o.kind === "crate") {
            const ca = Math.cos(o.rot), sa = Math.sin(o.rot);
            const lx = (x - o.x) * ca + (y - o.y) * sa;
            const ly = -(x - o.x) * sa + (y - o.y) * ca;
            const half = o.r * 0.85;
            const dx = Math.max(Math.abs(lx) - half, 0);
            const dy = Math.max(Math.abs(ly) - half, 0);
            d = Math.hypot(dx, dy);
        } else {
            d = Math.max(0, Math.hypot(x - o.x, y - o.y) - o.r);
        }
        if (d < bd) { bd = d; best = o; }
    }
    return best;
}

// Large enough swimmers can shoulder aside smaller debris instead of steering around it.
function canShoveObstacle(ent, o) {
    if (!ent || ent.size == null) return false;
    if (o === grabbedObstacle) return false;
    return ent.size >= obstacleRadius(o) * 1.05;
}

// Bias heading away from nearby solids (skip debris the swimmer can shove).
function obstacleAvoidDir(x, y, bodyR, fishSize) {
    if (!scenery.debris || !obstacles.length) return null;
    let ax = 0, ay = 0, hits = 0;
    for (const o of obstacles) {
        if (fishSize != null && fishSize >= obstacleRadius(o) * 1.05) continue;
        const rr = obstacleRadius(o) + bodyR;
        const dx = x - o.x, dy = y - o.y;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d < rr * 1.65) {
            const w = (1 - d / (rr * 1.65));
            ax += (dx / d) * w;
            ay += (dy / d) * w;
            hits++;
        }
    }
    if (!hits) return null;
    return Math.atan2(ay, ax);
}

// Resolve overlap: small debris is shoved aside by large fish; otherwise the swimmer yields.
function resolveObstacleOverlap(ent, bodyR) {
    if (!scenery.debris || !obstacles.length) return;
    const pad = 24;
    for (const o of obstacles) {
        const shove = canShoveObstacle(ent, o);
        const shoveForce = shove ? Math.min(90, (ent.baseSpeed || ent.speed || 50) * 0.55) : 0;
        if (isLongObstacle(o)) {
            const ca = Math.cos(o.rot), sa = Math.sin(o.rot);
            const lx = (ent.x - o.x) * ca + (ent.y - o.y) * sa;
            const ly = -(ent.x - o.x) * sa + (ent.y - o.y) * ca;
            const hx = o.len * 0.5 + bodyR;
            const hy = o.thick * 0.55 + bodyR;
            if (Math.abs(lx) <= hx && Math.abs(ly) <= hy) {
                const ox = hx - Math.abs(lx);
                const oy = hy - Math.abs(ly);
                if (ox < oy) {
                    const nx = Math.sign(lx) || 1;
                    if (shove) {
                        o.x -= ca * nx * ox;
                        o.y -= sa * nx * ox;
                        o.vx = (o.vx || 0) - ca * nx * shoveForce;
                        o.vy = (o.vy || 0) - sa * nx * shoveForce;
                        o.spin = (o.spin || 0) + nx * 0.25;
                    } else {
                        ent.x += ca * nx * ox;
                        ent.y += sa * nx * ox;
                    }
                } else {
                    const ny = Math.sign(ly) || 1;
                    if (shove) {
                        o.x -= -sa * ny * oy;
                        o.y -= ca * ny * oy;
                        o.vx = (o.vx || 0) + sa * ny * shoveForce;
                        o.vy = (o.vy || 0) - ca * ny * shoveForce;
                        o.spin = (o.spin || 0) + ny * 0.2;
                    } else {
                        ent.x += -sa * ny * oy;
                        ent.y += ca * ny * oy;
                    }
                }
            }
        } else {
            const rr = obstacleRadius(o) + bodyR;
            const dx = ent.x - o.x, dy = ent.y - o.y;
            const d = Math.hypot(dx, dy) || 0.001;
            if (d < rr) {
                const overlap = rr - d;
                const nx = dx / d;
                const ny = dy / d;
                if (shove) {
                    o.x -= nx * overlap;
                    o.y -= ny * overlap;
                    o.vx = (o.vx || 0) - nx * shoveForce;
                    o.vy = (o.vy || 0) - ny * shoveForce;
                    o.spin = (o.spin || 0) + (nx - ny) * 0.15;
                } else {
                    ent.x += nx * overlap;
                    ent.y += ny * overlap;
                }
            }
        }
        if (shove) {
            o.x = Math.max(pad, Math.min(viewW - pad, o.x));
            o.y = Math.max(pad, Math.min(viewH - pad, o.y));
        }
    }
}

function drawCattails(ctx, t, dt) {
    if (!scenery.cattails) return;
    for (const c of sceneryItems.cattails) {
        const wake = sceneryWake(c.x, c.y);
        const wakeSway = smoothBob(c, wake * 0.13, dt);
        const sway = Math.sin(t * 0.95 + c.sway) * 0.1 + wakeSway;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.ang + sway);
        const g = Math.floor(65 + c.green * 85);
        ctx.strokeStyle = `rgba(${35 + g * 0.15},${g},${50 + g * 0.1},0.78)`;
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(5 + sway * 12, -c.h * 0.5, sway * 14, -c.h);
        ctx.stroke();
        ctx.fillStyle = "rgba(105,75,38,0.82)";
        ctx.beginPath();
        ctx.ellipse(sway * 14, -c.h * 0.82, 3.8, 11, sway, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawDuckweed(ctx, t, dt) {
    if (!scenery.duckweed) return;
    for (const d of sceneryItems.duckweed) {
        const wake = sceneryWake(d.x, d.y);
        const lift = smoothBob(d, wake * 2.4, dt);
        const bob = Math.sin(t * 0.7 + d.bob) * 0.8 + lift;
        ctx.save();
        ctx.translate(d.x, d.y + bob);
        ctx.rotate(d.rot);
        ctx.globalAlpha = 0.58;
        for (let i = 0; i < d.density; i++) {
            const a = (i / d.density) * Math.PI * 2 + d.bob;
            const rr = d.r * (0.25 + (i % 3) * 0.12);
            const px = Math.cos(a) * d.r * 0.45;
            const py = Math.sin(a) * d.r * 0.35;
            ctx.fillStyle = i % 2 ? "rgba(90,140,70,0.78)" : "rgba(60,110,55,0.72)";
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(a);
            pathOrganicOval(ctx, rr * 0.55, rr * 0.38, 7, null, 0.22);
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }
}

function drawLeaves(ctx, t, dt) {
    if (!scenery.duckweed) return; // share the surface-greens toggle
    for (const L of sceneryItems.leaves) {
        const wake = sceneryWake(L.x, L.y);
        const lift = smoothBob(L, wake * 2.5, dt);
        const bob = Math.sin(t * 0.85 + L.bob) * 1.1 + lift;
        ctx.save();
        ctx.translate(L.x, L.y + bob);
        ctx.rotate(L.rot + lift * 0.06);
        ctx.globalAlpha = 0.72;
        const c = Math.floor(90 + L.tone * 70);
        ctx.fillStyle = `rgba(${c},${Math.floor(c * 0.7)},${Math.floor(c * 0.25)},0.8)`;
        ctx.beginPath();
        ctx.moveTo(-L.len * 0.85, 0);
        ctx.quadraticCurveTo(-L.len * 0.2, -L.len * 0.55, L.len * 0.75, -L.len * 0.08);
        ctx.quadraticCurveTo(L.len * 0.95, 0, L.len * 0.75, L.len * 0.1);
        ctx.quadraticCurveTo(-L.len * 0.15, L.len * 0.5, -L.len * 0.85, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(${c - 30},${Math.floor(c * 0.5)},20,0.5)`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-L.len * 0.7, 0);
        ctx.quadraticCurveTo(0, L.len * 0.04, L.len * 0.7, 0);
        ctx.moveTo(-L.len * 0.15, -L.len * 0.15);
        ctx.quadraticCurveTo(L.len * 0.1, 0, L.len * 0.35, L.len * 0.12);
        ctx.stroke();
        ctx.restore();
    }
}

// ===========================================================================
// FROGS + TADPOLES (underwater background life)
// Occasional frog groups swimming mid-depth with six tadpoles each. Quiet
// breaststroke kicks; they do not interact with fish gameplay.
// ===========================================================================
let frogGroups = [];
let frogCheckTimer = 0;

function easeInOutCubic(t) {
    const x = clamp01(t);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function easeOutQuad(t) {
    const x = clamp01(t);
    return 1 - (1 - x) * (1 - x);
}
function easeInQuad(t) {
    const x = clamp01(t);
    return x * x;
}

function spawnFrogGroup() {
    const x = viewW * (0.15 + Math.random() * 0.7);
    // Swim in the lower half of the water column, under the surface.
    const y = viewH * (0.55 + Math.random() * 0.28);
    const dir = Math.random() < 0.5 ? 0 : Math.PI;
    const frog = {
        x,
        y,
        size: 12 + Math.random() * 8,
        dir,
        tone: Math.random(),
        state: "glide", // glide | kick | rest
        stateT: 0,
        stateFor: 0.8 + Math.random() * 1.4,
        kick: 0, // 0 tucked, 1 fully extended hind kick
        speed: 18 + Math.random() * 14,
        breath: Math.random() * Math.PI * 2,
        blink: 0,
        nextBlink: 1.5 + Math.random() * 3,
        pitch: 0,
        bobPhase: Math.random() * Math.PI * 2,
        age: 0,
        turnTo: null,
    };
    const tadpoles = [];
    for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
        tadpoles.push({
            x: x + Math.cos(ang) * (18 + Math.random() * 24),
            y: y + Math.sin(ang) * (10 + Math.random() * 14),
            ang,
            orbit: 16 + Math.random() * 28,
            orbitY: 0.55 + Math.random() * 0.4,
            speed: 0.6 + Math.random() * 0.75,
            phase: Math.random() * Math.PI * 2,
            size: 4.4 + Math.random() * 3,
            dir: Math.random() * Math.PI * 2,
            tone: Math.random(),
        });
    }
    frogGroups.push({
        frog,
        tadpoles,
        life: 40 + Math.random() * 50,
        fade: 0,
        leaving: false,
    });
}

function updateFrogGroups(dt) {
    if (!scenery.frogs) return;
    const padX = viewW * 0.08;
    const yMin = viewH * 0.42;
    const yMax = viewH * 0.88;

    for (let i = frogGroups.length - 1; i >= 0; i--) {
        const g = frogGroups[i];
        g.life -= dt;
        if (g.life <= 0 && !g.leaving) g.leaving = true;
        if (g.leaving) {
            g.fade += dt * 0.65;
            if (g.fade >= 1) {
                frogGroups.splice(i, 1);
                continue;
            }
        }
        const frog = g.frog;
        frog.age += dt;
        frog.breath += dt * 1.8;
        frog.bobPhase += dt * 1.1;
        frog.nextBlink -= dt;
        if (frog.nextBlink <= 0) {
            frog.blink = 0.12;
            frog.nextBlink = 2 + Math.random() * 3.5;
        }
        if (frog.blink > 0) frog.blink = Math.max(0, frog.blink - dt);

        frog.stateT += dt;
        if (frog.state === "rest") {
            frog.kick = Math.max(0, frog.kick - dt * 2.5);
            frog.speed *= 1 - 1.8 * dt;
            if (frog.stateT >= frog.stateFor) {
                frog.state = "kick";
                frog.stateT = 0;
                frog.stateFor = 0.28 + Math.random() * 0.12;
                // Pick a new heading for the next kick-glide.
                const wander = (Math.random() - 0.5) * 1.1;
                frog.turnTo = frog.dir + wander;
                if (frog.x < padX) frog.turnTo = 0;
                if (frog.x > viewW - padX) frog.turnTo = Math.PI;
                if (frog.y < yMin) frog.turnTo = Math.atan2(0.6, Math.cos(frog.dir));
                if (frog.y > yMax) frog.turnTo = Math.atan2(-0.55, Math.cos(frog.dir));
            }
        } else if (frog.state === "kick") {
            const u = clamp01(frog.stateT / frog.stateFor);
            frog.kick = easeOutQuad(u);
            if (frog.turnTo != null) {
                const diff = normAngle(frog.turnTo - frog.dir);
                frog.dir += Math.max(-2.8 * dt, Math.min(2.8 * dt, diff));
            }
            frog.speed = 38 + 55 * easeOutQuad(u);
            if (u >= 1) {
                frog.state = "glide";
                frog.stateT = 0;
                frog.stateFor = 1.1 + Math.random() * 1.6;
                frog.turnTo = null;
                if (water && Math.random() < 0.45) {
                    water.disturb(frog.x, frog.y, 5, 22);
                }
            }
        } else {
            // Glide: legs tuck, coast, then rest or kick again.
            const u = clamp01(frog.stateT / Math.max(0.2, frog.stateFor));
            frog.kick = Math.max(0, 1 - easeInQuad(u * 1.4));
            frog.speed = Math.max(6, frog.speed * (1 - 0.55 * dt));
            if (frog.stateT >= frog.stateFor) {
                if (Math.random() < 0.35) {
                    frog.state = "rest";
                    frog.stateT = 0;
                    frog.stateFor = 0.9 + Math.random() * 2.2;
                    frog.speed *= 0.4;
                } else {
                    frog.state = "kick";
                    frog.stateT = 0;
                    frog.stateFor = 0.26 + Math.random() * 0.14;
                    frog.turnTo = frog.dir + (Math.random() - 0.5) * 0.9;
                }
            }
        }

        frog.x += Math.cos(frog.dir) * frog.speed * dt;
        frog.y += Math.sin(frog.dir) * frog.speed * dt * 0.55
            + Math.sin(frog.bobPhase) * 4.5 * dt;
        frog.x = Math.max(padX * 0.5, Math.min(viewW - padX * 0.5, frog.x));
        frog.y = Math.max(yMin, Math.min(yMax, frog.y));
        // Slight body pitch follows vertical motion intent.
        const desiredPitch = Math.sin(frog.dir) * 0.35 + Math.sin(frog.bobPhase) * 0.08;
        frog.pitch += (desiredPitch - frog.pitch) * Math.min(1, 4 * dt);

        // Tadpoles trail and orbit the swimming frog.
        for (const t of g.tadpoles) {
            t.phase += dt * t.speed;
            t.ang += dt * t.speed * 0.65;
            const trail = 14 + t.orbit * 0.35;
            const ox = Math.cos(t.ang) * t.orbit * 0.55
                - Math.cos(frog.dir) * trail
                + Math.sin(t.phase * 1.6) * 4;
            const oy = Math.sin(t.ang * 1.2) * t.orbit * t.orbitY
                - Math.sin(frog.dir) * trail * 0.4
                + Math.cos(t.phase * 1.4) * 3;
            const tx = frog.x + ox;
            const ty = frog.y + oy;
            const dx = tx - t.x;
            const dy = ty - t.y;
            t.x += dx * Math.min(1, 2.8 * dt);
            t.y += dy * Math.min(1, 2.8 * dt);
            t.y = Math.max(yMin * 0.95, Math.min(yMax, t.y));
            if (Math.hypot(dx, dy) > 0.35) t.dir = Math.atan2(dy, dx);
        }
    }
}

function drawTadpole(ctx, t, alpha) {
    const L = t.size;
    const tailWave = Math.sin(t.phase * 3.4) * 0.55;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.dir);
    ctx.globalAlpha = 0.72 * alpha;

    // Soft shadow on the bed.
    ctx.fillStyle = "rgba(20,30,25,0.18)";
    ctx.beginPath();
    ctx.ellipse(1, L * 0.35, L * 0.7, L * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    const g = 70 + Math.floor(t.tone * 40);
    const body = ctx.createLinearGradient(-L * 0.2, -L * 0.4, L * 0.3, L * 0.5);
    body.addColorStop(0, `rgba(${40 + g * 0.2},${g + 20},${55},0.92)`);
    body.addColorStop(0.55, `rgba(${30 + g * 0.15},${g},${48},0.88)`);
    body.addColorStop(1, `rgba(${25 + g * 0.1},${g - 10},${40},0.55)`);

    // Head / yolk sac.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(L * 0.15, 0, L * 0.55, L * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    // Belly highlight.
    ctx.fillStyle = `rgba(160,190,120,${0.28 * alpha})`;
    ctx.beginPath();
    ctx.ellipse(L * 0.2, L * 0.12, L * 0.28, L * 0.18, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // External gill wisps.
    ctx.strokeStyle = `rgba(${50 + g * 0.2},${g + 10},70,0.45)`;
    ctx.lineWidth = Math.max(0.6, L * 0.08);
    ctx.lineCap = "round";
    for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-L * 0.05, i * L * 0.18);
        ctx.quadraticCurveTo(-L * 0.35, i * L * 0.35 + tailWave * 2, -L * 0.55, i * L * 0.1);
        ctx.stroke();
    }

    // Tail with undulating fin membrane.
    ctx.beginPath();
    ctx.moveTo(-L * 0.15, 0);
    ctx.quadraticCurveTo(-L * 0.7, -L * 0.08 + tailWave * L * 0.15, -L * 1.55, tailWave * L * 0.55);
    ctx.quadraticCurveTo(-L * 0.95, L * 0.35, -L * 0.55, L * 0.12);
    ctx.quadraticCurveTo(-L * 0.3, L * 0.05, -L * 0.15, 0);
    ctx.closePath();
    const tailG = ctx.createLinearGradient(-L * 0.2, 0, -L * 1.5, 0);
    tailG.addColorStop(0, `rgba(${35 + g * 0.15},${g},${50},0.75)`);
    tailG.addColorStop(0.5, `rgba(${40 + g * 0.1},${g - 5},${55},0.4)`);
    tailG.addColorStop(1, `rgba(80,120,90,0.05)`);
    ctx.fillStyle = tailG;
    ctx.fill();
    // Tail nerve line.
    ctx.strokeStyle = `rgba(30,50,35,${0.35 * alpha})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-L * 0.2, 0);
    ctx.quadraticCurveTo(-L * 0.85, tailWave * L * 0.1, -L * 1.4, tailWave * L * 0.4);
    ctx.stroke();

    // Eye.
    ctx.fillStyle = "rgba(245,245,230,0.9)";
    ctx.beginPath();
    ctx.arc(L * 0.35, -L * 0.12, Math.max(0.9, L * 0.12), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(15,20,18,0.92)";
    ctx.beginPath();
    ctx.arc(L * 0.38, -L * 0.12, Math.max(0.55, L * 0.07), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawFrogModel(ctx, frog, alpha) {
    // Side-profile swimmer: head forward, hind legs tuck/kick behind.
    const S = frog.size;
    const kick = frog.kick || 0;
    const breath = 1 + Math.sin(frog.breath) * 0.04;
    const tone = frog.tone;
    const r = 50 + Math.floor(tone * 30);
    const g = 105 + Math.floor(tone * 50);
    const b = 70 + Math.floor(tone * 30);
    const bellyR = 130 + Math.floor(tone * 35);
    const bellyG = 155 + Math.floor(tone * 28);
    const bellyB = 100 + Math.floor(tone * 20);

    ctx.save();
    ctx.translate(frog.x, frog.y);
    ctx.rotate(frog.dir + (frog.pitch || 0));
    // Submerged look: cooler, a bit translucent.
    ctx.globalAlpha = 0.62 * alpha;

    // Soft underwater shadow beneath the body.
    ctx.fillStyle = "rgba(10,25,30,0.2)";
    ctx.beginPath();
    ctx.ellipse(-S * 0.05, S * 0.45, S * 1.1, S * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hind legs: tucked along the body when kick~0, swept back when kick~1.
    const tuckX = -S * (0.35 + kick * 0.85);
    const tuckY = S * (0.2 - kick * 0.05);
    const footSpread = S * (0.15 + kick * 0.55);
    for (const side of [-1, 1]) {
        ctx.fillStyle = `rgba(${r - 10},${g - 15},${b - 8},0.9)`;
        ctx.beginPath();
        ctx.moveTo(-S * 0.2, side * S * 0.08);
        ctx.quadraticCurveTo(-S * (0.45 + kick * 0.35), side * S * (0.28 + kick * 0.1), tuckX, side * tuckY);
        ctx.quadraticCurveTo(-S * (0.55 + kick * 0.5), side * S * 0.05, -S * 0.25, 0);
        ctx.closePath();
        ctx.fill();
        // Webbed foot flare at the end of the kick.
        ctx.fillStyle = `rgba(${r},${g + 15},${b + 10},0.5)`;
        ctx.beginPath();
        ctx.moveTo(tuckX, side * tuckY * 0.85);
        ctx.lineTo(tuckX - S * (0.2 + kick * 0.35), side * (tuckY + footSpread));
        ctx.lineTo(tuckX - S * (0.35 + kick * 0.4), side * tuckY * 0.2);
        ctx.lineTo(tuckX - S * (0.15 + kick * 0.2), side * (tuckY - footSpread * 0.4));
        ctx.closePath();
        ctx.fill();
    }

    // Forelimbs tucked under the chest while swimming.
    ctx.fillStyle = `rgba(${r - 5},${g - 10},${b - 5},0.75)`;
    ctx.beginPath();
    ctx.moveTo(S * 0.15, S * 0.1);
    ctx.quadraticCurveTo(S * 0.35, S * 0.28, S * 0.22, S * 0.32);
    ctx.quadraticCurveTo(S * 0.08, S * 0.22, S * 0.1, S * 0.08);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(S * 0.12, -S * 0.05);
    ctx.quadraticCurveTo(S * 0.28, -S * 0.22, S * 0.18, -S * 0.28);
    ctx.quadraticCurveTo(S * 0.05, -S * 0.15, S * 0.08, -S * 0.02);
    ctx.fill();

    // Streamlined body.
    const bodyG = ctx.createLinearGradient(0, -S * 0.35, 0, S * 0.35);
    bodyG.addColorStop(0, `rgba(${r + 15},${g + 25},${b + 20},0.95)`);
    bodyG.addColorStop(0.45, `rgba(${r},${g},${b},0.92)`);
    bodyG.addColorStop(1, `rgba(${bellyR},${bellyG},${bellyB},0.9)`);
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.moveTo(S * 0.75, 0);
    ctx.bezierCurveTo(S * 0.55, -S * 0.38 * breath, -S * 0.1, -S * 0.42 * breath, -S * 0.55, -S * 0.12);
    ctx.bezierCurveTo(-S * 0.72, 0, -S * 0.55, S * 0.14, -S * 0.2, S * 0.32);
    ctx.bezierCurveTo(S * 0.2, S * 0.4, S * 0.55, S * 0.28, S * 0.75, 0);
    ctx.closePath();
    ctx.fill();

    // Mottling.
    ctx.fillStyle = `rgba(${r - 25},${g - 35},${b - 15},0.28)`;
    for (const [sx, sy, sr] of [[0.1, -0.12, 0.1], [-0.15, 0.08, 0.08], [0.35, 0.05, 0.06], [-0.35, -0.05, 0.07]]) {
        ctx.beginPath();
        ctx.ellipse(S * sx, S * sy, S * sr, S * sr * 0.65, 0.2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Head / snout.
    ctx.fillStyle = `rgba(${r + 10},${g + 18},${b + 12},0.95)`;
    ctx.beginPath();
    ctx.ellipse(S * 0.55, -S * 0.06, S * 0.32, S * 0.26 * breath, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${r - 20},${g - 25},${b - 10},0.4)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(S * 0.42, -S * 0.02, S * 0.09, 0, Math.PI * 2);
    ctx.stroke();

    // Eye on the upper head.
    const ex = S * 0.58;
    const ey = -S * 0.22;
    ctx.fillStyle = `rgba(${r + 20},${g + 30},${b + 15},0.95)`;
    ctx.beginPath();
    ctx.ellipse(ex, ey, S * 0.11, S * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    if (frog.blink > 0.02) {
        ctx.strokeStyle = "rgba(25,35,30,0.85)";
        ctx.lineWidth = Math.max(1.1, S * 0.05);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(ex - S * 0.07, ey);
        ctx.quadraticCurveTo(ex, ey + S * 0.03, ex + S * 0.07, ey);
        ctx.stroke();
    } else {
        ctx.fillStyle = "rgba(245,248,240,0.92)";
        ctx.beginPath();
        ctx.ellipse(ex, ey, S * 0.07, S * 0.065, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(18,26,22,0.95)";
        ctx.beginPath();
        ctx.arc(ex + S * 0.012, ey, S * 0.038, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.beginPath();
        ctx.arc(ex, ey - S * 0.02, S * 0.015, 0, Math.PI * 2);
        ctx.fill();
    }

    // Small bubble trail while kicking.
    if (kick > 0.35 && Math.sin(frog.age * 14) > 0.4) {
        ctx.fillStyle = `rgba(200,230,240,${0.25 * kick * alpha})`;
        ctx.beginPath();
        ctx.arc(-S * (0.7 + kick * 0.3), -S * 0.15, 1.2 + kick, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawFrogGroups(ctx) {
    if (!scenery.frogs) return;
    for (const g of frogGroups) {
        const alpha = g.leaving ? 1 - clamp01(g.fade) : 1;
        for (const t of g.tadpoles) drawTadpole(ctx, t, alpha * 0.9);
        drawFrogModel(ctx, g.frog, alpha);
    }
}

function woodTone(tone, lift) {
    const c = Math.floor(62 + tone * 48 + (lift || 0));
    return {
        c,
        fill: `rgb(${c},${Math.floor(c * 0.7)},${Math.floor(c * 0.4)})`,
        dark: `rgb(${c - 22},${Math.floor(c * 0.52)},${Math.floor(c * 0.28)})`,
        light: `rgb(${Math.min(200, c + 28)},${Math.floor(c * 0.85)},${Math.floor(c * 0.52)})`,
        line: `rgba(${c - 28},${Math.floor(c * 0.48)},${Math.floor(c * 0.22)},0.65)`,
        moss: `rgba(${40 + Math.floor(tone * 30)},${95 + Math.floor(tone * 50)},${55 + Math.floor(tone * 20)},`,
    };
}

// Irregular closed outline instead of a clean oval / circle.
function pathOrganicOval(ctx, rx, ry, points, profile, wobble) {
    const n = Math.max(6, points | 0);
    const w = wobble == null ? 0.18 : wobble;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = t * Math.PI * 2 - Math.PI * 0.5;
        const jag = profile && profile.length
            ? 0.78 + profile[i % profile.length] * 0.35
            : 0.88 + 0.12 * Math.sin(t * 11.3);
        const bump = 1 + Math.sin(t * 6.2) * w * 0.45 + Math.sin(t * 13.7) * w * 0.25;
        const x = Math.cos(a) * rx * jag * bump;
        const y = Math.sin(a) * ry * jag * (0.92 + bump * 0.08);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

// Weathered crate / box with bowed sides and chewed corners.
function pathWornCrate(ctx, s, profile) {
    const h = s * 0.5;
    const bow = s * 0.04;
    const p = profile || [];
    ctx.beginPath();
    ctx.moveTo(-h + s * 0.04, -h + s * 0.06);
    ctx.quadraticCurveTo(0, -h - bow * (p[0] || 1), h - s * 0.05, -h + s * 0.04);
    ctx.quadraticCurveTo(h + bow * 0.8, 0, h - s * 0.03, h - s * 0.05);
    ctx.quadraticCurveTo(0, h + bow * (p[1] || 1), -h + s * 0.06, h - s * 0.04);
    ctx.quadraticCurveTo(-h - bow, 0, -h + s * 0.04, -h + s * 0.06);
    ctx.closePath();
}

// Barrel / drum silhouette with bulged staves.
function pathBarrelSilhouette(ctx, rx, ry, profile) {
    const n = 14;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = -Math.PI * 0.5 + t * Math.PI * 2;
        const stave = 0.9 + 0.12 * Math.sin(t * Math.PI * 8);
        const jag = profile ? 0.92 + (profile[i % profile.length] - 0.8) * 0.12 : 1;
        // Slight waist / belly so it is not a perfect ellipse.
        const belly = 1 + 0.08 * Math.cos(a * 2);
        const x = Math.cos(a) * rx * stave * jag * belly;
        const y = Math.sin(a) * ry * jag;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

// Fusiform fish body: pointed head, fuller midsection, taper to the peduncle.
function pathFishFusiform(ctx, L, W, shape) {
    const head = shape === "round" ? L * 0.38 : shape === "diamond" ? L * 0.46 : L * 0.5;
    const back = shape === "slim" ? W * 0.78 : shape === "round" ? W * 1.05 : W;
    const belly = shape === "slim" ? W * 0.7 : shape === "round" ? W * 1.1 : W * 0.95;
    const ped = shape === "diamond" ? -L * 0.36 : -L * 0.42;
    ctx.beginPath();
    ctx.moveTo(head, 0);
    // Upper jaw / back to peduncle.
    ctx.bezierCurveTo(head * 0.55, -back * 0.55, L * 0.05, -back * 1.05, ped * 0.15, -back * 0.85);
    ctx.bezierCurveTo(ped * 0.55, -back * 0.55, ped * 0.9, -back * 0.35, ped, 0);
    // Lower belly back to the snout.
    ctx.bezierCurveTo(ped * 0.9, belly * 0.35, ped * 0.55, belly * 0.55, ped * 0.15, belly * 0.8);
    ctx.bezierCurveTo(L * 0.05, belly * 1.0, head * 0.55, belly * 0.5, head, 0);
    ctx.closePath();
}

function pathJaggedCapsule(ctx, len, thick, profile, endJags) {
    const half = len * 0.5;
    const n = profile.length || 8;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = -half + len * t;
        const jag = profile[Math.min(n - 1, i)] || 1;
        const y = -thick * 0.48 * jag;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    // Broken right end.
    const ej = endJags || [1, 0.7, 1.1, 0.8];
    for (let i = 0; i < ej.length; i++) {
        const y = -thick * 0.45 + (thick * 0.9 * i) / (ej.length - 1);
        ctx.lineTo(half + thick * 0.12 * (ej[i] - 0.9), y);
    }
    for (let i = n; i >= 0; i--) {
        const t = i / n;
        const x = -half + len * t;
        const jag = profile[Math.min(n - 1, i)] || 1;
        const y = thick * 0.48 * (0.85 + (1.15 - jag) * 0.5);
        ctx.lineTo(x, y);
    }
    // Broken left end.
    for (let i = ej.length - 1; i >= 0; i--) {
        const y = thick * 0.45 - (thick * 0.9 * i) / (ej.length - 1);
        ctx.lineTo(-half - thick * 0.1 * (ej[i] - 0.85), y);
    }
    ctx.closePath();
}

function drawMossPatches(ctx, o, w, spreadX, spreadY) {
    const moss = o.moss || 0.3;
    ctx.fillStyle = w.moss + (0.22 + moss * 0.35) + ")";
    const knobs = o.knobs || [];
    for (let i = 0; i < knobs.length; i++) {
        const k = knobs[i];
        const x = (i / Math.max(1, knobs.length - 1) - 0.5) * spreadX * 1.4;
        const y = (k - 1) * spreadY * 1.8;
        ctx.beginPath();
        ctx.ellipse(x, y, 3 + k * 5, 2 + k * 3.2, k * 1.7, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawLogBody(ctx, o) {
    const w = woodTone(o.tone);
    const profile = o.profile || makeObstacleDetail(1, 10, 1);
    const endJags = o.knobs || [1, 0.75, 1.15, 0.85];
    pathJaggedCapsule(ctx, o.len, o.thick, profile, endJags);
    const g = ctx.createLinearGradient(0, -o.thick, 0, o.thick);
    g.addColorStop(0, w.light);
    g.addColorStop(0.45, w.fill);
    g.addColorStop(1, w.dark);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = w.line;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Bark ridges along the length.
    ctx.strokeStyle = `rgba(${w.c - 30},${Math.floor(w.c * 0.45)},${Math.floor(w.c * 0.22)},0.45)`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
        const y = -o.thick * 0.32 + i * o.thick * 0.16;
        ctx.beginPath();
        for (let s = 0; s <= 10; s++) {
            const t = s / 10;
            const x = -o.len * 0.46 + o.len * 0.92 * t;
            const wave = Math.sin(t * 9 + i * 1.3) * o.thick * 0.05
                + (profile[Math.min(profile.length - 1, s)] - 1) * o.thick * 0.08;
            if (s === 0) ctx.moveTo(x, y + wave);
            else ctx.lineTo(x, y + wave);
        }
        ctx.stroke();
    }

    // Knots / burrs.
    for (let i = 0; i < 3; i++) {
        const t = 0.2 + (o.knobs[i] || 0.5) * 0.55;
        const x = -o.len * 0.4 + o.len * t;
        const y = ((i % 2) * 2 - 1) * o.thick * 0.18;
        ctx.fillStyle = w.dark;
        ctx.beginPath();
        ctx.ellipse(x, y, o.thick * 0.16, o.thick * 0.12, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = w.line;
        ctx.beginPath();
        ctx.ellipse(x, y, o.thick * 0.08, o.thick * 0.06, 0.4, 0, Math.PI * 2);
        ctx.stroke();
    }

    // End grain: broken rings, not clean ovals.
    const drawEnd = (side) => {
        const x = side * o.len * 0.47;
        ctx.fillStyle = w.light;
        ctx.beginPath();
        ctx.ellipse(x, 0, o.thick * 0.2, o.thick * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(${w.c + 10},${Math.floor(w.c * 0.75)},${Math.floor(w.c * 0.45)},0.55)`;
        for (let r = 1; r <= 3; r++) {
            ctx.beginPath();
            const rr = o.thick * (0.08 + r * 0.09);
            for (let a = 0; a <= 12; a++) {
                const ang = (a / 12) * Math.PI * 2;
                const jag = 0.85 + (profile[a % profile.length] - 0.8) * 0.35;
                const px = x + Math.cos(ang) * rr * 0.55 * jag;
                const py = Math.sin(ang) * rr * jag;
                if (a === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
        }
        if (o.broken && side > 0) {
            ctx.strokeStyle = w.line;
            ctx.beginPath();
            ctx.moveTo(x + o.thick * 0.05, -o.thick * 0.3);
            ctx.lineTo(x + o.thick * 0.28, -o.thick * 0.05);
            ctx.lineTo(x + o.thick * 0.1, o.thick * 0.25);
            ctx.stroke();
        }
    };
    drawEnd(-1);
    drawEnd(1);
    drawMossPatches(ctx, o, w, o.len * 0.35, o.thick * 0.25);
}

function drawDriftwood(ctx, o) {
    const w = woodTone(o.tone, -6);
    pathJaggedCapsule(ctx, o.len, o.thick * 0.85, o.profile, o.knobs);
    ctx.fillStyle = w.fill;
    ctx.fill();
    ctx.strokeStyle = w.line;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // Forked limb.
    const fork = o.fork || 0.45;
    ctx.beginPath();
    ctx.moveTo(o.len * 0.05, -o.thick * 0.1);
    ctx.quadraticCurveTo(o.len * 0.25, -o.thick * (0.8 + fork), o.len * 0.42, -o.thick * (1.1 + fork));
    ctx.lineTo(o.len * 0.38, -o.thick * (0.7 + fork));
    ctx.quadraticCurveTo(o.len * 0.2, -o.thick * 0.35, o.len * 0.02, 0);
    ctx.closePath();
    ctx.fillStyle = w.dark;
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = w.line;
    ctx.beginPath();
    ctx.moveTo(-o.len * 0.3, o.thick * 0.1);
    ctx.quadraticCurveTo(0, o.thick * 0.25, o.len * 0.2, -o.thick * 0.05);
    ctx.stroke();
    drawMossPatches(ctx, o, w, o.len * 0.3, o.thick * 0.3);
}

function drawFacetRock(ctx, o, mossy) {
    const c = Math.floor(70 + o.tone * 50);
    pathFacetRockOutline(ctx, o);
    const g = ctx.createRadialGradient(-o.r * 0.2, -o.r * 0.25, 2, 0, 0, o.r);
    g.addColorStop(0, `rgb(${c + 22},${c + 18},${c + 14})`);
    g.addColorStop(1, `rgb(${c - 30},${c - 26},${c - 24})`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(120,140,130,0.28)";
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // Crack lines.
    ctx.strokeStyle = `rgba(${c - 25},${c - 20},${c - 18},0.4)`;
    ctx.beginPath();
    ctx.moveTo(-o.r * 0.35, -o.r * 0.1);
    ctx.quadraticCurveTo(0, o.r * 0.05, o.r * 0.3, -o.r * 0.15);
    ctx.moveTo(-o.r * 0.1, -o.r * 0.3);
    ctx.lineTo(o.r * 0.05, o.r * 0.25);
    ctx.stroke();
    if (mossy) {
        const w = woodTone(o.tone);
        drawMossPatches(ctx, o, w, o.r * 0.7, o.r * 0.45);
    }
}

function drawObstacles(ctx, dt) {
    if (!scenery.debris) return;
    for (const o of obstacles) {
        const wake = sceneryWake(o.x, o.y);
        const lift = smoothBob(o, wake * 1.15, dt);
        const dragging = o === grabbedObstacle;
        ctx.save();
        ctx.translate(o.x, o.y - lift);
        ctx.rotate(o.rot);
        ctx.globalAlpha = dragging ? 0.95 : 0.88;
        if (dragging) {
            ctx.shadowColor = "rgba(180,210,200,0.35)";
            ctx.shadowBlur = 14;
        }
        if (o.kind === "boulder") {
            drawFacetRock(ctx, o, false);
        } else if (o.kind === "mossrock") {
            drawFacetRock(ctx, o, true);
        } else if (o.kind === "log") {
            drawLogBody(ctx, o);
        } else if (o.kind === "driftwood") {
            drawDriftwood(ctx, o);
        } else if (o.kind === "plank") {
            const w = woodTone(o.tone, 8);
            pathPlankOutline(ctx, o);
            ctx.fillStyle = w.fill;
            ctx.fill();
            ctx.strokeStyle = w.line;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-o.len * 0.35, -o.thick * 0.12);
            ctx.lineTo(o.len * 0.4, -o.thick * 0.08);
            ctx.moveTo(-o.len * 0.28, o.thick * 0.15);
            ctx.lineTo(o.len * 0.35, o.thick * 0.1);
            ctx.stroke();
            drawMossPatches(ctx, o, w, o.len * 0.3, o.thick);
        } else if (o.kind === "crate") {
            const w = woodTone(o.tone);
            const s = o.r * 1.55;
            const g = ctx.createLinearGradient(-s * 0.4, -s * 0.4, s * 0.4, s * 0.4);
            g.addColorStop(0, w.light);
            g.addColorStop(0.55, w.fill);
            g.addColorStop(1, w.dark);
            pathWornCrate(ctx, s, o.profile);
            ctx.fillStyle = g;
            ctx.fill();
            ctx.strokeStyle = w.line;
            ctx.lineWidth = 1.3;
            ctx.stroke();
            // Warped plank seams.
            ctx.beginPath();
            ctx.moveTo(-s * 0.42, s * 0.02);
            ctx.quadraticCurveTo(0, s * 0.06, s * 0.4, -s * 0.02);
            ctx.moveTo(s * 0.02, -s * 0.4);
            ctx.quadraticCurveTo(-s * 0.04, 0, s * 0.04, s * 0.4);
            ctx.moveTo(-s * 0.28, -s * 0.28);
            ctx.quadraticCurveTo(0, 0, s * 0.3, s * 0.26);
            ctx.stroke();
            // Missing corner notch.
            ctx.fillStyle = w.dark;
            ctx.beginPath();
            ctx.moveTo(s * 0.32, -s * 0.48);
            ctx.lineTo(s * 0.48, -s * 0.28);
            ctx.lineTo(s * 0.28, -s * 0.22);
            ctx.closePath();
            ctx.fill();
            drawMossPatches(ctx, o, w, s * 0.35, s * 0.35);
        } else if (o.kind === "barrel") {
            const w = woodTone(o.tone, -4);
            const g = ctx.createLinearGradient(-o.r * 0.5, 0, o.r * 0.5, 0);
            g.addColorStop(0, w.dark);
            g.addColorStop(0.45, w.fill);
            g.addColorStop(1, w.light);
            pathBarrelSilhouette(ctx, o.r * 0.88, o.r, o.profile);
            ctx.fillStyle = g;
            ctx.fill();
            ctx.strokeStyle = w.line;
            ctx.lineWidth = 1.4;
            ctx.stroke();
            // Hoops follow the bulged outline.
            for (const yy of [-o.r * 0.48, -o.r * 0.05, o.r * 0.38]) {
                ctx.save();
                ctx.translate(0, yy);
                pathOrganicOval(ctx, o.r * 0.8, o.r * 0.11, 12, o.profile, 0.08);
                ctx.stroke();
                ctx.restore();
            }
            ctx.strokeStyle = `rgba(${w.c - 15},${Math.floor(w.c * 0.5)},${Math.floor(w.c * 0.25)},0.4)`;
            for (let i = -3; i <= 3; i++) {
                ctx.beginPath();
                ctx.moveTo(i * o.r * 0.18, -o.r * 0.78);
                ctx.quadraticCurveTo(i * o.r * 0.24, 0, i * o.r * 0.16, o.r * 0.78);
                ctx.stroke();
            }
            drawMossPatches(ctx, o, w, o.r * 0.5, o.r * 0.5);
        } else if (o.kind === "pot") {
            const c = Math.floor(95 + o.tone * 40);
            const g = ctx.createLinearGradient(-o.r * 0.4, -o.r * 0.4, o.r * 0.5, o.r * 0.5);
            g.addColorStop(0, `rgb(${c + 20},${Math.floor(c * 0.7)},${Math.floor(c * 0.48)})`);
            g.addColorStop(1, `rgb(${c - 25},${Math.floor(c * 0.48)},${Math.floor(c * 0.3)})`);
            ctx.fillStyle = g;
            pathPotSilhouette(ctx, o.r);
            ctx.fill();
            ctx.strokeStyle = `rgba(${c - 35},${Math.floor(c * 0.38)},${Math.floor(c * 0.22)},0.55)`;
            ctx.lineWidth = 1.1;
            ctx.stroke();
            // Irregular rim opening.
            ctx.fillStyle = `rgba(${c - 30},${Math.floor(c * 0.42)},${Math.floor(c * 0.25)},0.9)`;
            ctx.save();
            ctx.translate(0, -o.r * 0.52);
            pathOrganicOval(ctx, o.r * 0.4, o.r * 0.14, 10, o.profile, 0.12);
            ctx.fill();
            ctx.restore();
            // Chip on the rim.
            ctx.beginPath();
            ctx.moveTo(o.r * 0.15, -o.r * 0.62);
            ctx.lineTo(o.r * 0.3, -o.r * 0.4);
            ctx.lineTo(o.r * 0.02, -o.r * 0.46);
            ctx.fillStyle = `rgba(${c - 45},${Math.floor(c * 0.32)},${Math.floor(c * 0.18)},0.75)`;
            ctx.fill();
            drawMossPatches(ctx, o, woodTone(o.tone), o.r * 0.45, o.r * 0.35);
        } else if (o.kind === "reedraft") {
            const stems = o.stems || 6;
            for (let i = 0; i < stems; i++) {
                const t = (i / (stems - 1) - 0.5) * o.r * 1.6;
                const lean = (o.profile[i % o.profile.length] - 1) * 0.4;
                const g = Math.floor(70 + o.tone * 60 + i * 3);
                ctx.strokeStyle = `rgba(${40 + g * 0.2},${g},${55 + g * 0.15},0.8)`;
                ctx.lineWidth = 2.2;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(t * 0.3, o.r * 0.35);
                ctx.quadraticCurveTo(t + lean * 8, 0, t * 1.1 + lean * 14, -o.r * 0.95);
                ctx.stroke();
            }
            // Twine binding.
            ctx.strokeStyle = "rgba(120,95,55,0.7)";
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.ellipse(0, o.r * 0.05, o.r * 0.7, o.r * 0.22, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = "rgba(55,80,50,0.35)";
            ctx.beginPath();
            ctx.ellipse(0, o.r * 0.25, o.r * 0.65, o.r * 0.28, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Stump: bark sides + jagged ringed cut face.
            const w = woodTone(o.tone);
            const profile = o.profile || makeObstacleDetail(3, 9, 4);
            pathStumpOutline(ctx, o);
            ctx.fillStyle = w.dark;
            ctx.fill();
            ctx.fillStyle = w.light;
            ctx.beginPath();
            ctx.ellipse(0, -o.r * 0.12, o.r * 0.52, o.r * 0.48, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = `rgba(${w.c + 20},${Math.floor(w.c * 0.8)},${Math.floor(w.c * 0.48)},0.5)`;
            ctx.lineWidth = 1;
            for (let i = 1; i <= 3; i++) {
                ctx.beginPath();
                for (let a = 0; a <= 14; a++) {
                    const ang = (a / 14) * Math.PI * 2;
                    const jag = 0.9 + (profile[a % profile.length] - 0.9) * 0.25;
                    const px = Math.cos(ang) * o.r * 0.12 * i * jag;
                    const py = -o.r * 0.12 + Math.sin(ang) * o.r * 0.11 * i * jag;
                    if (a === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.stroke();
            }
            // Root nubs.
            ctx.fillStyle = w.fill;
            for (let i = 0; i < 3; i++) {
                const a = -0.6 + i * 0.7;
                ctx.beginPath();
                ctx.ellipse(Math.cos(a) * o.r * 0.7, Math.sin(a) * o.r * 0.45, o.r * 0.22, o.r * 0.12, a, 0, Math.PI * 2);
                ctx.fill();
            }
            drawMossPatches(ctx, o, w, o.r * 0.5, o.r * 0.35);
        }
        ctx.restore();
    }
}

// Wake from fish, visitors, and the height-field ripples: floating scenery bobs on it.
function sceneryWake(x, y) {
    let w = 0;
    for (const f of fishes) {
        if (f.dead || f.golden) continue;
        const d = Math.hypot(f.x - x, f.y - y);
        const r = 90 + f.size * 1.35;
        if (d < r) w += (1 - d / r) * Math.min(2.4, f.size / 22);
    }
    if (shark && !shark.dead) {
        const d = Math.hypot(shark.x - x, shark.y - y);
        const r = 110 + shark.size * 0.7;
        if (d < r) w += (1 - d / r) * 2.2;
    }
    if (whale && !whale.dead) {
        const d = Math.hypot(whale.x - x, whale.y - y);
        const r = 140 + whale.size * 0.45;
        if (d < r) w += (1 - d / r) * 2.8;
    }
    if (water && typeof water.gradientAt === "function") {
        const g = water.gradientAt(x, y);
        w += Math.min(3.2, Math.abs(g.h) * 0.045 + Math.hypot(g.gx, g.gy) * 0.12);
    }
    return Math.min(7.5, w);
}

function smoothBob(item, target, dt) {
    if (item.bobLift == null) item.bobLift = 0;
    // Snappier follow so wakes read clearly without feeling jittery.
    item.bobLift += (target - item.bobLift) * Math.min(1, dt * 5.5);
    return item.bobLift;
}

function drawShoreStones(ctx, dt) {
    if (!scenery.stones) return;
    for (const s of sceneryItems.stones) {
        // Shore stones only nudge a little from wakes.
        const lift = smoothBob(s, sceneryWake(s.x, s.y) * 0.55, dt);
        ctx.save();
        ctx.translate(s.x, s.y - lift);
        ctx.rotate(s.rot);
        const g = ctx.createRadialGradient(-s.rx * 0.2, -s.ry * 0.3, 1, 0, 0, s.rx);
        const c = Math.floor(70 + s.tone * 50);
        g.addColorStop(0, `rgb(${c + 20},${c + 18},${c + 12})`);
        g.addColorStop(1, `rgb(${c - 25},${c - 20},${c - 18})`);
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.78;
        if (!s.profile) {
            s.profile = makeObstacleDetail(Math.floor(s.x + s.y), 9, 5);
        }
        pathOrganicOval(ctx, s.rx, s.ry, 9, s.profile, 0.2);
        ctx.fill();
        ctx.strokeStyle = "rgba(140,170,160,0.28)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.strokeStyle = `rgba(${c - 30},${c - 25},${c - 22},0.35)`;
        ctx.beginPath();
        ctx.moveTo(-s.rx * 0.35, -s.ry * 0.1);
        ctx.quadraticCurveTo(0, s.ry * 0.1, s.rx * 0.3, -s.ry * 0.15);
        ctx.stroke();
        ctx.restore();
    }
}

function drawSticks(ctx, dt) {
    if (!scenery.sticks) return;
    for (const s of sceneryItems.sticks) {
        const wake = sceneryWake(s.x, s.y);
        const lift = smoothBob(s, wake * 2.2, dt);
        const tip = (s.tipBob || 0) + ((wake * 0.14) - (s.tipBob || 0)) * Math.min(1, dt * 3.4);
        s.tipBob = tip;
        ctx.save();
        ctx.translate(s.x, s.y - lift);
        ctx.rotate(s.rot + tip);
        const bend = (s.wet ? 2.5 : 0.5) + lift * 0.25;
        ctx.fillStyle = s.wet ? "rgba(90,70,45,0.58)" : "rgba(110,85,55,0.68)";
        ctx.beginPath();
        ctx.moveTo(-s.len * 0.5, -s.thick * 0.35);
        ctx.quadraticCurveTo(0, bend - s.thick * 0.5, s.len * 0.48, -s.thick * 0.15);
        ctx.lineTo(s.len * 0.52, s.thick * 0.2);
        ctx.quadraticCurveTo(0, bend + s.thick * 0.55, -s.len * 0.5, s.thick * 0.45);
        ctx.closePath();
        ctx.fill();
        if (s.wet) {
            ctx.strokeStyle = "rgba(160,200,190,0.18)";
            ctx.lineWidth = Math.max(0.8, s.thick * 0.3);
            ctx.stroke();
        }
        ctx.restore();
    }
}

function drawReeds(ctx, t, dt) {
    if (!scenery.reeds) return;
    for (const r of sceneryItems.reeds) {
        const wake = sceneryWake(r.x, r.y);
        const wakeSway = smoothBob(r, wake * 0.14, dt);
        const sway = Math.sin(t * 1.1 + r.sway) * 0.12 + wakeSway;
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.ang + sway);
        const g = Math.floor(70 + r.green * 90);
        ctx.strokeStyle = `rgba(${40 + g * 0.2},${g},${60 + g * 0.15},0.72)`;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(4 + sway * 10, -r.h * 0.5, sway * 16, -r.h);
        ctx.stroke();
        ctx.fillStyle = `rgba(${50 + g * 0.15},${g - 10},55,0.55)`;
        ctx.beginPath();
        ctx.ellipse(sway * 16, -r.h, 2.2, 4.5, sway, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawLilies(ctx, t, dt) {
    if (!scenery.lilies) return;
    for (const L of sceneryItems.lilies) {
        const wake = sceneryWake(L.x, L.y);
        const lift = smoothBob(L, wake * 2.6, dt);
        const bob = Math.sin(t * 0.9 + L.bob) * 1.2 + lift;
        const tip = (L.tipBob || 0) + ((wake * 0.1) - (L.tipBob || 0)) * Math.min(1, dt * 3.2);
        L.tipBob = tip;
        ctx.save();
        ctx.translate(L.x, L.y + bob);
        ctx.rotate(L.rot + tip);
        ctx.globalAlpha = 0.82;
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.save();
        ctx.translate(1.5, 2.5);
        pathOrganicOval(ctx, L.r * 1.05, L.r * 0.82, 10, null, 0.12);
        ctx.fill();
        ctx.restore();
        const g = ctx.createRadialGradient(-L.r * 0.2, -L.r * 0.2, 2, 0, 0, L.r);
        g.addColorStop(0, "#6f9a5a");
        g.addColorStop(0.55, "#4a7a42");
        g.addColorStop(1, "#2a4a2c");
        ctx.fillStyle = g;
        // Lobed pad with a V-notch slit.
        pathLilyPad(ctx, L.r);
        ctx.fill();
        ctx.strokeStyle = "rgba(30, 60, 35, 0.35)";
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 5; i++) {
            const a = 0.5 + i * 0.9;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(
                Math.cos(a) * L.r * 0.35,
                Math.sin(a) * L.r * 0.3,
                Math.cos(a) * L.r * 0.85,
                Math.sin(a) * L.r * 0.75
            );
            ctx.stroke();
        }
        ctx.restore();
    }
}

// ===========================================================================
// PLANTS FROM GREEN FOOD
// A fish that eats green food becomes a random pond plant here. These stay
// until the page is refreshed (separate from toggleable scenery).
// ===========================================================================
const pondPlants = [];
const PLANT_KINDS = ["reed", "lily", "cattail", "weed", "lotus", "moss"];

function makePondPlant(x, y, size) {
    const kind = PLANT_KINDS[Math.floor(Math.random() * PLANT_KINDS.length)];
    return {
        kind,
        x, y,
        size: Math.max(14, size * 0.9),
        rot: Math.random() * Math.PI * 2,
        sway: Math.random() * Math.PI * 2,
        green: 0.45 + Math.random() * 0.4,
        age: 0,
    };
}

function drawPondPlants(ctx, t, dt) {
    for (const p of pondPlants) {
        p.age += dt || 0.016;
        const wake = sceneryWake(p.x, p.y);
        const lift = smoothBob(p, wake * 2.2, dt || 0.016);
        const sway = Math.sin(t * 1.05 + p.sway) * 0.14 + lift * 0.035;
        ctx.save();
        ctx.translate(p.x, p.y - lift * 0.85);
        ctx.globalAlpha = 0.88;

        if (p.kind === "lily" || p.kind === "lotus") {
            ctx.rotate(p.rot + (p.tipBob || 0));
            p.tipBob = (p.tipBob || 0) + ((wake * 0.04) - (p.tipBob || 0)) * Math.min(1, (dt || 0.016) * 2.5);
            const r = p.size * (p.kind === "lotus" ? 0.7 : 0.55);
            ctx.fillStyle = "rgba(0,0,0,0.16)";
            ctx.beginPath();
            ctx.ellipse(1, 2, r * 1.05, r * 0.85, 0, 0, Math.PI * 2);
            ctx.fill();
            const g = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 2, 0, 0, r);
            g.addColorStop(0, p.kind === "lotus" ? "#7eb86a" : "#6f9a5a");
            g.addColorStop(0.7, "#3f6a3a");
            g.addColorStop(1, "#2a4a2c");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0.35, Math.PI * 2 - 0.35);
            ctx.lineTo(0, 0);
            ctx.closePath();
            ctx.fill();
            if (p.kind === "lotus") {
                ctx.fillStyle = "rgba(230,180,190,0.75)";
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (p.kind === "reed" || p.kind === "cattail") {
            ctx.rotate(sway * 0.6);
            const h = p.size * (p.kind === "cattail" ? 1.6 : 1.35);
            const g = Math.floor(70 + p.green * 90);
            ctx.strokeStyle = `rgba(${40 + g * 0.2},${g},${60 + g * 0.15},0.8)`;
            ctx.lineWidth = p.kind === "cattail" ? 2.4 : 1.8;
            ctx.lineCap = "round";
            for (let i = -1; i <= 1; i++) {
                ctx.beginPath();
                ctx.moveTo(i * 4, 0);
                ctx.quadraticCurveTo(i * 4 + sway * 10, -h * 0.5, i * 3 + sway * 14, -h);
                ctx.stroke();
            }
            if (p.kind === "cattail") {
                ctx.fillStyle = "rgba(110,80,40,0.85)";
                ctx.beginPath();
                ctx.ellipse(sway * 14, -h * 0.85, 3.5, 9, sway, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (p.kind === "weed") {
            ctx.rotate(p.rot + sway);
            ctx.strokeStyle = `rgba(50,120,70,0.7)`;
            ctx.lineWidth = 1.5;
            ctx.lineCap = "round";
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(
                    Math.cos(a) * p.size * 0.35,
                    Math.sin(a) * p.size * 0.2,
                    Math.cos(a + sway) * p.size * 0.7,
                    Math.sin(a + sway) * p.size * 0.55
                );
                ctx.stroke();
            }
        } else { // moss rock
            ctx.rotate(p.rot);
            const rx = p.size * 0.55, ry = p.size * 0.35;
            const stone = ctx.createRadialGradient(-rx * 0.2, -ry * 0.3, 1, 0, 0, rx);
            stone.addColorStop(0, "#6a7068");
            stone.addColorStop(1, "#3a4038");
            ctx.fillStyle = stone;
            ctx.beginPath();
            ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "rgba(70,130,60,0.55)";
            ctx.beginPath();
            ctx.ellipse(-rx * 0.15, -ry * 0.1, rx * 0.45, ry * 0.35, 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(rx * 0.2, ry * 0.05, rx * 0.3, ry * 0.22, -0.4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

// ===========================================================================
// ROCKS (pond mode) with arc/throw flight and splash on impact
// ===========================================================================
const rocks = [];

class Rock {
    // sx,sy = launch point; tx,ty = target on water; v = normalized velocity.
    constructor(sx, sy, tx, ty, v) {
        this.sx = sx; this.sy = sy;
        this.tx = tx; this.ty = ty;
        this.v = v;
        this.size = 7 + v * 24;              // visual + splash size
        this.age = 0;
        const dist = Math.hypot(tx - sx, ty - sy);
        this.thrown = dist > 6;
        this.dur = this.thrown ? 0.34 + dist / 1700 : 0.42;
        this.arc = this.thrown ? 60 + dist * 0.35 + v * 60 : 120 + v * 60;
        this.dead = false;
        // Rare special pellets are mutually exclusive. Typed keywords (or a pet streak) can force one.
        applyFoodVariant(this, pickFoodVariant());
        // Slightly irregular pellet silhouette.
        this.shape = [];
        const pts = 8;
        for (let k = 0; k < pts; k++) {
            const a = (k / pts) * Math.PI * 2;
            this.shape.push({ a, r: 0.85 + Math.random() * 0.25 });
        }
        this.rot = Math.random() * Math.PI * 2;
    }

    update(dt) {
        this.age += dt;
        this.rot += dt * 2.2;
        const t = this.age / this.dur;
        if (t >= 1) {
            this.land();
            this.dead = true;
        }
    }

    // Current on-screen position and apparent height above the water.
    frame() {
        const t = clamp01(this.age / this.dur);
        const x = this.sx + (this.tx - this.sx) * t;
        const y = this.sy + (this.ty - this.sy) * t;
        // Thrown rocks arc up and over; dropped rocks accelerate straight down.
        const z = this.thrown
            ? this.arc * Math.sin(Math.PI * t)
            : this.arc * (1 - t * t);
        return { x, y, z, t };
    }

    land() {
        // Push the water down and fling a splash.
        water.disturb(this.tx, this.ty, this.size * 1.6, 260 + this.v * 500);
        // Timbre shifts when food hits pads, debris, reeds, and other pond elements.
        sound(this.tx, this.ty, this.v, true, pondSurfaceAt(this.tx, this.ty));
        spawnSplash(this.tx, this.ty, this.size, this.v);
        // The rock is now fish food resting on the surface.
        // Always place it: if at the cap, drop the oldest common pellet first so
        // throws never silently vanish, and rare pellets stay until eaten.
        while (foods.length >= CONFIG.maxFoods) {
            const common = foods.findIndex((f) => !isRareFoodFlags(f));
            if (common >= 0) foods.splice(common, 1);
            else foods.shift();
        }
        // Rebuild flags from the exclusive variant so a forced pink drop never lands as brown.
        const flags = {
            golden: false,
            rainbow: false,
            green: false,
            grower: false,
            pink: false,
        };
        applyFoodVariant(flags, foodVariantKey({
            golden: !!this.golden,
            rainbow: !!this.rainbow,
            green: !!this.green,
            grower: !!this.grower,
            pink: !!this.pink,
        }));
        foods.push(new Food(this.tx, this.ty, this.size, flags));
    }

    draw(ctx) {
        const { x, y, z, t } = this.frame();
        const screenY = y - z; // height reads as an upward offset in top-down
        const scale = 1 + z / 260;
        const rad = this.size * scale;

        // Shadow on the water: tightens and darkens as the rock nears.
        const shR = this.size * (1.4 - 0.5 * (z / (this.arc + 1)));
        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - z / (this.arc + 1)) + 0.05})`;
        ctx.beginPath();
        ctx.ellipse(x, y, shR * 1.2, shR * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // The food pellet itself: brown, golden, green, pink, or rainbow.
        ctx.save();
        ctx.translate(x, screenY);
        ctx.rotate(this.rot);
        const g = ctx.createRadialGradient(-rad * 0.3, -rad * 0.3, rad * 0.1, 0, 0, rad);
        if (this.rainbow) {
            ctx.shadowColor = "rgba(255,120,255,0.95)";
            ctx.shadowBlur = 16;
            const hue = (performance.now() * 0.2) % 360;
            g.addColorStop(0, `hsl(${hue}, 90%, 75%)`);
            g.addColorStop(0.5, `hsl(${(hue + 120) % 360}, 85%, 55%)`);
            g.addColorStop(1, `hsl(${(hue + 240) % 360}, 80%, 40%)`);
        } else if (this.green) {
            ctx.shadowColor = "rgba(100,220,120,0.9)";
            ctx.shadowBlur = 14;
            g.addColorStop(0, "#c8f5b0");
            g.addColorStop(0.55, "#5db84a");
            g.addColorStop(1, "#2a6b2e");
        } else if (this.pink) {
            // Soft rose breeding pellet (distinct from grower's hotter magenta).
            ctx.shadowColor = "rgba(255,140,200,0.95)";
            ctx.shadowBlur = 15;
            g.addColorStop(0, "#ffe8f4");
            g.addColorStop(0.5, "#ff7eb6");
            g.addColorStop(1, "#d63a7a");
        } else if (this.grower) {
            ctx.shadowColor = "rgba(255,120,160,0.95)";
            ctx.shadowBlur = 16;
            g.addColorStop(0, "#ffe0f0");
            g.addColorStop(0.45, "#ff6fa0");
            g.addColorStop(1, "#b03060");
        } else if (this.golden) {
            ctx.shadowColor = "rgba(255,215,90,0.9)";
            ctx.shadowBlur = 14;
            g.addColorStop(0, "#fff3b0");
            g.addColorStop(0.6, "#f0c437");
            g.addColorStop(1, "#a9791a");
        } else {
            g.addColorStop(0, "#b98a48");
            g.addColorStop(0.6, "#8a6531");
            g.addColorStop(1, "#5c4321");
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let k = 0; k < this.shape.length; k++) {
            const pt = this.shape[k];
            const px = Math.cos(pt.a) * rad * pt.r;
            const py = Math.sin(pt.a) * rad * pt.r;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

// ===========================================================================
// SPLASH DROPLETS (pond mode)
// Little beads of water flung up by an impact. They arc under gravity and, when
// they fall back to the surface, poke the height field and make a tiny ripple.
// ===========================================================================
const droplets = [];

function spawnSplash(x, y, size, v) {
    const count = Math.min(6 + Math.floor(size * 0.9), 22);
    for (let k = 0; k < count; k++) {
        if (droplets.length >= CONFIG.maxDroplets) break;
        const a = Math.random() * Math.PI * 2;
        const spread = 40 + Math.random() * (90 + size * 4);
        droplets.push({
            x, y,
            vx: Math.cos(a) * spread,
            vy: Math.sin(a) * spread * 0.7,
            z: 0,
            vz: 150 + Math.random() * (140 + v * 160),
            r: 1 + Math.random() * (1.5 + size * 0.08),
            alive: true,
        });
    }
}

function updateDroplets(dt) {
    const g = 620; // gravity for the arc
    for (let i = droplets.length - 1; i >= 0; i--) {
        const d = droplets[i];
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vz -= g * dt;
        d.z += d.vz * dt;
        if (d.z <= 0 && d.vz < 0) {
            // Landed: make a small ripple and, sometimes, a faint tick.
            if (d.x > 0 && d.x < viewW && d.y > 0 && d.y < viewH) {
                water.disturb(d.x, d.y, Math.max(3, d.r * 2), 60 + d.r * 30);
                if (Math.random() < 0.18) {
                    const pan = Math.max(-1, Math.min(1, (d.x / viewW) * 2 - 1));
                    Audio.tick(pan, 900 + Math.random() * 700);
                }
            }
            droplets.splice(i, 1);
        }
    }
}

function drawDroplets(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const d of droplets) {
        const sy = d.y - d.z; // height as upward offset
        const rr = d.r * (0.7 + d.z / 120);
        ctx.fillStyle = "rgba(190,222,255,0.85)";
        ctx.beginPath();
        ctx.arc(d.x, sy, rr, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// ===========================================================================
// FOOD (pond mode)
// A landed rock becomes a floating pellet. It bobs, nudging the surface, and
// fish come to eat it. Its `amount` is how much is left; bigger food takes more
// bites and each bite is slower, so large food lingers and draws a crowd.
// ===========================================================================
const foods = [];

class Food {
    constructor(x, y, size, flags) {
        this.x = x;
        this.y = y;
        this.size = size;        // original size, sets how hard it is to finish
        this.amount = size;      // remaining, shrinks as it is eaten
        this.biteCount = 0;      // sequences the melodic run across all bites
        this.phase = Math.random() * Math.PI * 2;
        this.golden = !!(flags && flags.golden);
        this.rainbow = !!(flags && flags.rainbow);
        this.green = !!(flags && flags.green);
        this.grower = !!(flags && flags.grower);
        this.pink = !!(flags && flags.pink);
        this.carcass = !!(flags && flags.carcass);
        this.rare = isRareFoodFlags(this);
        this.eaten = false;
        this.age = 0;
        // Larger common pellets are heavier and sink sooner.
        // Rare pellets never sink: they wait to be eaten.
        this.floatLife = this.rare ? Infinity : Math.max(3.2, 15.5 - size * 0.38);
        this.sinkProgress = 0;   // 0..1 while going under
        this.sinking = false;
    }
    // Bigger food = slower bites (harder to eat).
    biteInterval() { return 0.3 + this.size * 0.035; }
    radius() { return Math.max(1.2, (3 + this.amount * 0.34) * (1 - this.sinkProgress * 0.55)); }
    update(dt) {
        this.age += dt;
        this.phase += dt * 2.2;

        if (!this.rare && !this.sinking && this.age >= this.floatLife) {
            this.sinking = true;
        }
        if (this.sinking) {
            // Larger food also sinks faster once it starts going under.
            const sinkRate = 0.45 + this.size * 0.028;
            this.sinkProgress = Math.min(1, this.sinkProgress + sinkRate * dt);
            if (this.sinkProgress >= 1) {
                this.eaten = true;
                water.disturb(this.x, this.y, this.size * 0.5, 80);
            }
        }

        // Gentle bobbing pushes the surface now and then.
        if (!this.sinking && Math.random() < 0.04) {
            water.disturb(this.x, this.y, this.radius() * 0.8, 26);
        }
    }
    draw(ctx) {
        const bob = this.sinking ? 0 : Math.sin(this.phase) * 1.6;
        const r = this.radius();
        const alpha = 1 - this.sinkProgress;
        const depthY = this.y + this.sinkProgress * 10;
        // Soft shadow on the water.
        ctx.fillStyle = `rgba(0,0,0,${0.22 * alpha})`;
        ctx.beginPath();
        ctx.ellipse(this.x, depthY + 2, r * 1.1, r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        // Pellet: brown normally; rare kinds glow until eaten.
        ctx.save();
        ctx.globalAlpha = alpha;
        const g = ctx.createRadialGradient(
            this.x - r * 0.3, depthY - r * 0.3 + bob, r * 0.2, this.x, depthY + bob, r
        );
        if (this.rainbow) {
            ctx.shadowColor = "rgba(255,120,255,0.95)";
            ctx.shadowBlur = 14 * alpha;
            const hue = (performance.now() * 0.2) % 360;
            g.addColorStop(0, `hsl(${hue}, 90%, 75%)`);
            g.addColorStop(0.5, `hsl(${(hue + 120) % 360}, 85%, 55%)`);
            g.addColorStop(1, `hsl(${(hue + 240) % 360}, 80%, 40%)`);
        } else if (this.green) {
            ctx.shadowColor = "rgba(100,220,120,0.9)";
            ctx.shadowBlur = 12 * alpha;
            g.addColorStop(0, "#c8f5b0");
            g.addColorStop(0.55, "#5db84a");
            g.addColorStop(1, "#2a6b2e");
        } else if (this.pink) {
            ctx.shadowColor = "rgba(255,140,200,0.95)";
            ctx.shadowBlur = 13 * alpha;
            g.addColorStop(0, "#ffe8f4");
            g.addColorStop(0.5, "#ff7eb6");
            g.addColorStop(1, "#d63a7a");
        } else if (this.grower) {
            ctx.shadowColor = "rgba(255,120,160,0.95)";
            ctx.shadowBlur = 13 * alpha;
            g.addColorStop(0, "#ffe0f0");
            g.addColorStop(0.45, "#ff6fa0");
            g.addColorStop(1, "#b03060");
        } else if (this.carcass) {
            ctx.shadowColor = "rgba(120,30,30,0.7)";
            ctx.shadowBlur = 10 * alpha;
            g.addColorStop(0, "#d07060");
            g.addColorStop(0.55, "#8a3030");
            g.addColorStop(1, "#4a1818");
        } else if (this.golden) {
            ctx.shadowColor = "rgba(255,215,90,0.9)";
            ctx.shadowBlur = 12 * alpha;
            g.addColorStop(0, "#fff3b0");
            g.addColorStop(0.6, "#f0c437");
            g.addColorStop(1, "#a9791a");
        } else {
            g.addColorStop(0, "#a9803f");
            g.addColorStop(1, "#5c4321");
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(this.x, depthY + bob, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function nearestFood(x, y, range) {
    let best = null;
    let bestD = range;
    for (const f of foods) {
        if (f.eaten || f.sinkProgress > 0.7) continue; // nearly sunk: too deep to nibble
        const d = Math.hypot(x - f.x, y - f.y);
        if (d < bestD) { bestD = d; best = f; }
    }
    return best;
}

// Rainbow trail that spells the exit message, then fades after the fish leaves.
const rainbowScriptTrail = [];

// Continuous cursive-friendly letterforms (each letter is one flowing polyline).
function letterCursive(ch) {
    switch (ch) {
        case "E": return [[0.15, 0.95], [0.1, 0.5], [0.12, 0.08], [0.85, 0.08], [0.2, 0.1], [0.18, 0.5], [0.7, 0.5], [0.2, 0.52], [0.18, 0.95], [0.88, 0.95]];
        case "A": return [[0.08, 0.98], [0.22, 0.55], [0.5, 0.05], [0.78, 0.55], [0.25, 0.58], [0.75, 0.58], [0.78, 0.55], [0.92, 0.98]];
        case "S": return [[0.85, 0.22], [0.55, 0.05], [0.18, 0.22], [0.2, 0.42], [0.78, 0.58], [0.82, 0.78], [0.5, 0.98], [0.15, 0.82]];
        case "T": return [[0.08, 0.1], [0.5, 0.08], [0.92, 0.1], [0.5, 0.1], [0.5, 0.98]];
        case "R": return [[0.12, 0.98], [0.12, 0.08], [0.7, 0.08], [0.88, 0.22], [0.7, 0.42], [0.12, 0.42], [0.48, 0.45], [0.92, 0.98]];
        case "G": return [[0.85, 0.25], [0.55, 0.05], [0.18, 0.28], [0.1, 0.55], [0.2, 0.85], [0.55, 0.98], [0.9, 0.78], [0.9, 0.55], [0.55, 0.55]];
        case "a": return [[0.2, 0.62], [0.45, 0.42], [0.78, 0.55], [0.82, 0.85], [0.55, 1.0], [0.22, 0.85], [0.25, 0.6], [0.78, 0.55], [0.85, 0.42], [0.85, 1.02]];
        case "e": return [[0.2, 0.7], [0.55, 0.55], [0.82, 0.65], [0.7, 0.42], [0.35, 0.42], [0.15, 0.65], [0.25, 0.92], [0.55, 1.02], [0.88, 0.88]];
        case "s": return [[0.8, 0.52], [0.5, 0.4], [0.2, 0.52], [0.25, 0.7], [0.75, 0.8], [0.78, 0.95], [0.45, 1.08], [0.18, 0.95]];
        case "t": return [[0.42, 0.15], [0.45, 0.55], [0.18, 0.5], [0.78, 0.5], [0.48, 0.52], [0.5, 1.05], [0.7, 0.95]];
        case "r": return [[0.2, 1.02], [0.22, 0.45], [0.25, 0.55], [0.5, 0.4], [0.78, 0.48]];
        case "g": return [[0.25, 0.62], [0.5, 0.42], [0.8, 0.55], [0.82, 0.82], [0.55, 0.98], [0.25, 0.82], [0.28, 0.58], [0.8, 0.55], [0.85, 0.4], [0.85, 1.15], [0.55, 1.28], [0.22, 1.12]];
        case " ": return [[0.15, 0.75], [0.5, 0.55], [0.85, 0.75]];
        default: return [[0.2, 0.7], [0.8, 0.7]];
    }
}

function quadBezier(p0, p1, p2, t) {
    const u = 1 - t;
    return {
        x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    };
}

function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    };
}

function smoothPolyline(points, samplesPerSeg) {
    if (points.length < 2) return points.slice();
    const out = [];
    const n = samplesPerSeg || 6;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        for (let k = 0; k < n; k++) {
            const p = catmullRom(p0, p1, p2, p3, k / n);
            out.push({ x: p.x, y: p.y, strokeId: 1 });
        }
    }
    const last = points[points.length - 1];
    out.push({ x: last.x, y: last.y, strokeId: 1 });
    return out;
}

function cursiveConnector(from, to, samples) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    // Handwriting arc: rise a little between letters, like ink staying on the page.
    const mid = {
        x: (from.x + to.x) * 0.5 + (-dy / dist) * dist * 0.12,
        y: (from.y + to.y) * 0.5 - Math.abs(dx) * 0.22 - 8,
    };
    const pts = [];
    const n = samples || 12;
    for (let k = 1; k <= n; k++) {
        const p = quadBezier(from, mid, to, k / (n + 1));
        pts.push({ x: p.x, y: p.y, strokeId: 1 });
    }
    return pts;
}

function buildEasterEggPath(fromX, fromY) {
    const text = "Easter Egg";
    const padX = viewW * 0.07;
    const padY = viewH * 0.2;
    const usableW = Math.max(160, viewW - padX * 2);
    const usableH = Math.max(100, viewH - padY * 2);
    const letterW = usableW / text.length;
    const letterH = Math.min(usableH * 0.62, letterW * 1.55);
    const anchors = [];

    for (let i = 0; i < text.length; i++) {
        const poly = letterCursive(text[i]);
        const ox = padX + i * letterW + letterW * 0.08;
        const oy = padY + (usableH - letterH) * 0.3;
        const sx = letterW * 0.82;
        const sy = letterH;
        const letterPts = poly.map(([u, v]) => ({
            x: ox + u * sx,
            y: oy + v * sy,
            strokeId: 1,
        }));
        if (!anchors.length) {
            anchors.push(...letterPts);
        } else {
            const prev = anchors[anchors.length - 1];
            const next = letterPts[0];
            anchors.push(...cursiveConnector(prev, next, text[i] === " " ? 5 : 7));
            anchors.push(...letterPts);
        }
    }

    // Swim in from the fish's current spot with a cursive approach curve.
    if (fromX != null && fromY != null && anchors.length) {
        const start = { x: fromX, y: fromY, strokeId: 1 };
        const approach = cursiveConnector(start, anchors[0], 8);
        anchors.unshift(start, ...approach);
    }

    // Fewer samples: still reads as cursive, much cheaper to follow and draw.
    return smoothPolyline(anchors, 3);
}

const RAINBOW_TRAIL_CAP = 220;

function pushRainbowTrail(x, y, life, pathIndex) {
    rainbowScriptTrail.push({
        x, y,
        age: 0,
        life: life == null ? 5 : life,
        hue: ((pathIndex || 0) * 3.1) % 360,
        r: 4.2,
        strokeId: 1,
    });
    // Hard cap so a long write cannot balloon into thousands of draw calls.
    if (rainbowScriptTrail.length > RAINBOW_TRAIL_CAP) {
        rainbowScriptTrail.splice(0, rainbowScriptTrail.length - RAINBOW_TRAIL_CAP);
    }
}

function updateRainbowTrail(dt) {
    // Hold the script steady while writing; afterglow fades once the exit starts.
    const writing = fishes.some((f) => f.isRainbow && f.rainbowLeaving && f.rainbowPhase === "write");
    if (!writing) {
        for (const p of rainbowScriptTrail) p.age += dt;
    }
    // Compact from the front when old; avoid splicing every point mid-array each frame.
    let trim = 0;
    while (trim < rainbowScriptTrail.length
        && rainbowScriptTrail[trim].age >= rainbowScriptTrail[trim].life) {
        trim++;
    }
    if (trim) rainbowScriptTrail.splice(0, trim);
}

function drawRainbowTrail(ctx) {
    const n = rainbowScriptTrail.length;
    if (n < 2) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = 0;
    // Batch into short polylines: one stroke per chunk instead of two glow strokes per segment.
    const chunk = 18;
    for (let start = 1; start < n; start += chunk) {
        const end = Math.min(n, start + chunk);
        const head = rainbowScriptTrail[end - 1];
        const fade = Math.max(0, 1 - head.age / head.life);
        if (fade <= 0.03) continue;
        ctx.beginPath();
        const a0 = rainbowScriptTrail[start - 1];
        ctx.moveTo(a0.x, a0.y);
        for (let i = start; i < end; i++) {
            const p = rainbowScriptTrail[i];
            ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = `hsla(${head.hue}, 90%, 62%, ${0.22 * fade})`;
        ctx.lineWidth = Math.max(3.5, head.r * 2.1 * fade);
        ctx.stroke();
        ctx.strokeStyle = `hsla(${(head.hue + 35) % 360}, 100%, 72%, ${0.55 * fade})`;
        ctx.lineWidth = Math.max(1.4, head.r * 0.85 * fade);
        ctx.stroke();
    }
    ctx.restore();
}

// ===========================================================================
// FISH (pond mode)
// Fish wander, notice food, chase it, and bite (melodic run in the species'
// voice). Eating food makes them GROW. Grow past a threshold and a fish turns
// predator: it hunts smaller fish, and everyone smaller flees from it.
// Some fish are heroes: they hunt smaller predators (evil fish, aggressive
// exotics, crocs, sharks, whales) but never target rainbow fish.
// ===========================================================================
const fishes = [];

class Fish {
    constructor(type) {
        this.type = type;
        this.size = rand(type.size[0], type.size[1]);
        this.baseSpeed = rand(type.speed[0], type.speed[1]);
        this.x = Math.random() * viewW;
        this.y = Math.random() * viewH;
        this.dir = Math.random() * Math.PI * 2;
        this.tailPhase = Math.random() * Math.PI * 2;
        this.age = Math.random() * 10;
        this.biteTimer = 0;
        this.wanderTimer = 0;
        this.target = null;   // current food
        this.prey = null;     // current fish being hunted (predators)
        this.isPredator = false;
        this.isRainbow = false; // rainbow apex predator form
        this.isMonster = false; // ate a croc/alligator and became apex
        // Heroes hunt smaller evil fish and exotic hunters; rainbow never becomes one.
        this.isHero = Math.random() < CONFIG.heroChance;
        this.rainbowLeaving = false;
        this.rainbowPhase = null; // "write" | "exit" during victory lap
        this.eggPath = null;
        this.eggIndex = 0;
        this.trailDrop = 0;
        this.erraticTimer = 0;
        this.golden = false;  // turned to gold and resting on the lakebed
        this.isPink = false;  // breeding blush from pink food; stays until gold/rainbow/etc.
        this.breedCooldown = 0;
        this.sinkTimer = 0;
        this.sinkDepth = 0;
        this.lifting = false; // being slowly lifted out for the hats unlock
        this.petTimer = 0;    // >0 means being petted: closed eyes, calm
        this.evilPetCount = 0; // discrete pets while evil
        this.evilPetProgress = 0; // continuous soothe time while being petted
        this.redeemed = false; // once good again, never turns evil from eating
        this.debrisFlee = null; // flinch away from hauled debris
        this.dead = false;
        this.giantEnded = false; // one-shot: already triggered the half-screen ending
        this._chaseBoost = 1;
        this.hatSeed = Math.random();
    }

    // Stable chase: slow near the target and when turning hard so rainbow fish do not softlock.
    chaseToward(tx, ty, baseSpeed) {
        const dx = tx - this.x;
        const dy = ty - this.y;
        const dist = Math.hypot(dx, dy) || 1;
        const desired = Math.atan2(dy, dx);
        const slowR = Math.max(32, this.size * 2.4);
        let speed = baseSpeed;
        if (dist < slowR) speed *= Math.max(0.2, dist / slowR);
        const angErr = Math.abs(normAngle(desired - this.dir));
        if (angErr > 0.45) speed *= Math.max(0.3, 1 - angErr / Math.PI);
        return { desired, speed, dist };
    }

    pet() {
        if (this.dead || this.golden || this.rainbowLeaving) return;
        this.petTimer = 1.4;
        // Species-specific contented note while being petted.
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        const t = this.type;
        Audio.fishNote({
            freq: t.petFreq || (320 * (t.register || 1)),
            wave: t.petWave || "sine",
            pan,
            dur: t.petDur || 0.35,
            level: 0.065,
            partialAmt: (t.bitePartial != null ? t.bitePartial : 0.18) * 0.7,
            partialRatio: 2.2,
            bright: (t.biteBright != null ? t.biteBright : 1) * 0.9,
        });
        // Tiny affectionate ripple.
        water.disturb(this.x, this.y, this.size * 0.4, 40);

        // Affection soothes evil fish (discrete pets plus continuous stroke time).
        if (this.isPredator && !this.isMonster && !this.isRainbow && !this.redeemed) {
            this.evilPetCount++;
            this.evilPetProgress += 0.55;
            if (this.evilPetCount >= CONFIG.petsToRedeem
                || this.evilPetProgress >= CONFIG.evilSootheTime) {
                this.redeem();
            }
        }

        // Hidden streak: enough pets with no throws guarantees rainbow food next.
        if (!guaranteeRainbow) {
            petStreak++;
            if (petStreak >= CONFIG.petsForRainbow) {
                guaranteeRainbow = true;
                petStreak = 0;
            }
        }
    }

    // Soften an evil fish: stop hunting, and never turn predator from food again.
    redeem() {
        if (this.redeemed || this.isMonster || this.isRainbow || !this.isPredator) return;
        this.redeemed = true;
        this.isPredator = false;
        this.isHero = true; // redeemed fish join the heroes
        this.prey = null;
        this.evilPetCount = 0;
        this.evilPetProgress = 0;
        this.baseSpeed = Math.max(this.type.speed[0], this.baseSpeed / 1.12);
        this.petTimer = Math.max(this.petTimer, 1.8);
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        Audio.fishNote({
            freq: (this.type.petFreq || 320) * 1.15,
            wave: "sine",
            pan,
            dur: 0.55,
            level: 0.1,
            partialAmt: 0.35,
            partialRatio: 2.5,
            bright: 1.3,
        });
        Audio.fishNote({
            freq: (this.type.petFreq || 320) * 1.6,
            wave: "triangle",
            pan,
            dur: 0.4,
            level: 0.07,
            partialAmt: 0.25,
            bright: 1.4,
        });
        water.disturb(this.x, this.y, this.size * 0.7, 120);
        spawnSplash(this.x, this.y, this.size * 0.35, 0.35);
    }

    // Green food: the fish becomes a lasting pond plant at this spot.
    turnToPlant() {
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        Audio.fishNote({
            freq: 180 * (this.type.register || 1),
            wave: "triangle",
            pan,
            dur: 0.7,
            level: 0.12,
        });
        water.disturb(this.x, this.y, this.size, 220);
        spawnSplash(this.x, this.y, this.size * 0.4, 0.4);
        pondPlants.push(makePondPlant(this.x, this.y, this.size));
        this.dead = true;
    }

    grow(amount, opts) {
        if (this.golden || this.isRainbow) return;
        const cap = fishGrowCap(this, opts);
        this.size = Math.min(cap, this.size + amount);
        // Redeemed and hero fish keep growing but never turn evil.
        if (this.redeemed || this.isHero || this.isMonster) {
            this.maybeBeginGiantEnding();
            return;
        }
        if (!this.isPredator && this.size >= CONFIG.predatorSize) {
            this.isPredator = true;
            this.isHero = false;
            // Evil fish is slightly faster than a normal fish of its size class.
            // Species habits (dart, turn, wiggle) stay with the type.
            this.baseSpeed *= 1.12;
            this.evilPetCount = 0;
            this.evilPetProgress = 0;
        }
        this.maybeBeginGiantEnding();
    }

    // Half-screen legend: heroes / redeemed get a calm farewell; untamed giants get a darker close.
    maybeBeginGiantEnding() {
        if (this.dead || this.golden || this.isRainbow || this.rainbowLeaving) return;
        if (this.giantEnded || pondFinaleActive()) return;
        if (this.size < giantSizeThreshold()) return;
        beginGiantEnding(this);
    }

    // Ate a crocodile/alligator while larger than it: become a monster fish.
    becomeMonster() {
        this.isMonster = true;
        this.isPredator = true;
        this.isHero = false;
        this.isRainbow = false;
        this.golden = false;
        this.isPink = false;
        this.target = null;
        this.prey = null;
        this.size = Math.min(fishGrowCap(this, { huge: true }), this.size + 28);
        this.baseSpeed = Math.max(this.baseSpeed, 48) * 1.35;
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        Audio.predatorEat(pan);
        Audio.sharkStrike(pan);
        water.disturb(this.x, this.y, this.size, 500);
        spawnSplash(this.x, this.y, this.size * 0.7, 0.9);
        this.maybeBeginGiantEnding();
    }

    // Eating golden food: freeze into gold and settle on the lakebed until refresh.
    turnToGold() {
        this.golden = true;
        this.isPredator = false;
        this.isHero = false;
        this.isRainbow = false;
        this.isPink = false;
        this.target = null;
        this.prey = null;
        this.sinkTimer = 0;
        this.sinkDepth = 0;
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        Audio.goldChime(pan);
        water.disturb(this.x, this.y, this.size * 1.2, 280);
        spawnSplash(this.x, this.y, this.size * 0.5, 0.5);
    }

    // Eating rainbow food: become a fast apex predator with stable tracking.
    turnToRainbow() {
        this.isRainbow = true;
        this.isPredator = true;
        this.isHero = false; // hero behavior does not apply to rainbow fish
        this.golden = false;
        this.isPink = false;
        this.target = null;
        this.prey = null;
        this.rainbowLeaving = false;
        this.rainbowPhase = null;
        this.eggPath = null;
        this.eggIndex = 0;
        this.baseSpeed = Math.max(this.baseSpeed, 48) * 1.35;
        this.size = Math.max(this.size, 36);
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        Audio.rainbowChime(pan);
        water.disturb(this.x, this.y, this.size * 1.4, 360);
        spawnSplash(this.x, this.y, this.size * 0.7, 0.8);
    }

    // Eating pink breeding food: soft blush; stays pink after breeding.
    turnPink() {
        if (this.dead || this.golden || this.isRainbow || this.rainbowLeaving) return;
        this.isPink = true;
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        Audio.fishNote({
            freq: 360 * (this.type.register || 1),
            wave: "sine",
            pan,
            dur: 0.45,
            level: 0.12,
            partialAmt: 0.3,
            bright: 1.25,
        });
        water.disturb(this.x, this.y, this.size * 0.6, 140);
        spawnSplash(this.x, this.y, this.size * 0.28, 0.35);
    }

    // Victory lap: swim a smooth cursive "Easter Egg" trail, then glide away.
    beginRainbowExit() {
        this.rainbowLeaving = true;
        this.rainbowPhase = "write";
        rainbowScriptTrail.length = 0;
        this.eggPath = buildEasterEggPath(this.x, this.y);
        this.eggIndex = 0;
        this.trailDrop = 0;
        this.erraticTimer = 0;
        this.prey = null;
        this.target = null;
        this.petTimer = 0;
        this._exitDir = undefined;
        this._writePathI = 0;
        if (this.eggPath.length > 1) {
            const n = this.eggPath[1];
            this.dir = Math.atan2(n.y - this.y, n.x - this.x);
        }
        pushRainbowTrail(this.x, this.y, 8, 0);
    }

    // Nearest threat: whale, shark, reptiles (if bigger), larger predators, rainbow/monster.
    // Heroes do not flee hunters they outsize (or can hunt after a whale meal); they chase those instead.
    findThreat() {
        if (this.golden || this.isRainbow || this.isMonster) return null;
        if (whale && !whale.dead) {
            const d = Math.hypot(whale.x - this.x, whale.y - this.y);
            if (d < CONFIG.fleeRange * 2.2
                && !(this.isHero && heroCanHuntWhale(this))) {
                return { x: whale.x, y: whale.y };
            }
        }
        if (shark && !shark.dead && !shark.leaving) {
            const d = Math.hypot(shark.x - this.x, shark.y - this.y);
            if (d < CONFIG.fleeRange * 1.6
                && !(this.isHero && this.size > shark.size)) {
                return { x: shark.x, y: shark.y };
            }
        }
        // Flee wild reptiles only if they are larger than us. Tamed ones are friends.
        for (const r of reptiles) {
            if (r.dead || r.tamed || r.golden) continue;
            if (this.size > r.size * 1.02) continue;
            const d = Math.hypot(r.x - this.x, r.y - this.y);
            if (d < CONFIG.fleeRange * 1.8) return { x: r.x, y: r.y };
        }
        let best = null, bd = CONFIG.fleeRange;
        for (const p of fishes) {
            if (p === this || p.dead || p.golden) continue;
            const scary = p.isRainbow || p.isMonster
                || (p.isPredator && p.size > this.size * 1.05)
                || (p.isHero && p.size > this.size);
            if (!scary) continue;
            const d = Math.hypot(p.x - this.x, p.y - this.y);
            if (d < bd) { bd = d; best = p; }
        }
        return best ? { x: best.x, y: best.y } : null;
    }

    // Nearest wild reptile we can eat (we must be bigger). Tamed ones are left alone.
    findEdibleReptile() {
        // Heroes lock crocs/gators from farther away so they prioritize them.
        let best = null, bd = CONFIG.huntRange * (this.isHero ? 1.65 : 1.3);
        for (const r of reptiles) {
            if (r.dead || r.tamed || r.golden) continue;
            if (this.size <= r.size) continue;
            const d = Math.hypot(r.x - this.x, r.y - this.y);
            if (d < bd) { bd = d; best = r; }
        }
        return best;
    }

    // Aggressive exotic: exotic-type fish that is a predator or monster hunter.
    isAggressiveExotic(p) {
        return !!(p && p.type && p.type.exotic && (p.isPredator || p.isMonster));
    }

    // Hero target: smaller hunters. Prefers aggressive exotics. Never rainbows.
    findHeroPrey() {
        let best = null, bd = CONFIG.huntRange * 1.4;
        for (const p of fishes) {
            if (p === this || p.dead || p.golden || p.isRainbow) continue;
            // Evil fish, monsters, and aggressive exotic hunters only.
            if (!p.isPredator && !p.isMonster) continue;
            if (this.size <= p.size) continue; // must be strictly larger
            const d = Math.hypot(p.x - this.x, p.y - this.y);
            // Bias lock-on toward aggressive exotics.
            const score = d * (this.isAggressiveExotic(p) ? 0.78 : 1);
            if (score < bd) { bd = score; best = p; }
        }
        return best;
    }

    heroPreyStillValid(p) {
        return !!(p && !p.dead && !p.golden && !p.isRainbow
            && (p.isPredator || p.isMonster)
            && this.size > p.size);
    }

    // Nearest eligible pink partner for breeding (both may seek each other).
    findPinkMate() {
        if (!canBreedFish(this)) return null;
        let best = null;
        let bd = Infinity;
        for (const f of fishes) {
            if (f === this || !canBreedFish(f)) continue;
            const d = Math.hypot(f.x - this.x, f.y - this.y);
            if (d < bd) { bd = d; best = f; }
        }
        return best;
    }

    // Hunt target: prefer smaller fish. Evil fish may overreach slightly and get eaten instead.
    findPrey() {
        let best = null, bd = CONFIG.huntRange * (this.isRainbow || this.isMonster ? 1.4 : 1);
        for (const p of fishes) {
            if (p === this || p.dead || p.golden || p.isRainbow || p.isMonster) continue;
            if (this.isRainbow || this.isMonster) {
                // Apex forms eat everyone else.
            } else if (p.size > this.size * 1.2) {
                continue; // will not even attempt fish that are much larger
            }
            const d = Math.hypot(p.x - this.x, p.y - this.y);
            // Prefer clearly smaller prey, but still consider slightly larger ones.
            const sizeBias = p.size <= this.size ? 1 : 1.35;
            const score = d * sizeBias;
            if (score < bd) { bd = score; best = p; }
        }
        return best;
    }

    // Hero finish: swallow a smaller exotic hunter without becoming a monster / rainbow.
    heroFinishKill(kind, sizeGain) {
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        if (kind === "shark") Audio.sharkStrike(pan);
        else Audio.predatorEat(pan);
        water.disturb(this.x, this.y, this.size * 0.8, 420);
        spawnSplash(this.x, this.y, this.size * 0.45, 0.75);
        this.grow(sizeGain, { huge: true });
        this.prey = null;
    }

    tryBiteFood(dt) {
        // Rainbow always locks the nearest food in a wide radius, not prey.
        const range = this.isRainbow ? CONFIG.perception * 3.2 : CONFIG.perception;
        if (this.isRainbow || !this.target || this.target.eaten) {
            this.target = nearestFood(this.x, this.y, range);
        }
        if (!this.target) return false;
        this.biteTimer -= dt;
        if (this.isRainbow) {
            const chase = this.chaseToward(
                this.target.x, this.target.y,
                this.baseSpeed * CONFIG.rainbowSpeed * 0.9
            );
            const eatDist = this.size * 0.55 + this.target.radius() + 8;
            if (chase.dist < eatDist && this.biteTimer <= 0) this.bite();
            return { desired: chase.desired, speed: chase.speed, chasing: true };
        }
        const desired = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
        const eatDist = this.size * 0.5 + this.target.radius() + 4;
        if (dist < eatDist && this.biteTimer <= 0) this.bite();
        return { desired, speed: this.baseSpeed * 1.5, chasing: true };
    }

    update(dt) {
        this.age += dt;
        if (this.petTimer > 0) this.petTimer = Math.max(0, this.petTimer - dt);
        if (this.breedCooldown > 0) this.breedCooldown = Math.max(0, this.breedCooldown - dt);

        // Continuous stroking soothes evil fish even when quiet pet refreshes skip notes.
        if (this.petTimer > 0 && this.isPredator && !this.isMonster
            && !this.isRainbow && !this.redeemed) {
            this.evilPetProgress += dt;
            if (this.evilPetProgress >= CONFIG.evilSootheTime) this.redeem();
        }
        if (this.debrisFlee) {
            this.debrisFlee.t -= dt;
            if (this.debrisFlee.t <= 0) this.debrisFlee = null;
        }

        // Golden fish sink to the lakebed and stay there until the page refreshes.
        if (this.golden) {
            if (this.lifting) return; // position driven by the slow lift gesture
            this.sinkTimer += dt;
            this.sinkDepth = Math.min(1, this.sinkTimer / CONFIG.goldSinkTime);
            if (this.sinkDepth < 1 && Math.random() < 0.08) {
                water.disturb(this.x, this.y, this.size * (1 - this.sinkDepth * 0.5), 40);
            }
            return;
        }

        let speed = this.baseSpeed;
        let desired = this.dir;
        let freeRoam = false; // when leaving, ignore bank steering
        let hardChase = false;

        // Rainbow victory lap: smooth cursive "Easter Egg", then exit with afterglow.
        if (this.rainbowLeaving) {
            freeRoam = true;
            if (this.rainbowPhase === "write" && this.eggPath && this.eggIndex < this.eggPath.length) {
                this.trailDrop -= dt;
                // Look ahead a little so turns stay rounded instead of corner-snapping.
                const look = Math.min(this.eggPath.length - 1, this.eggIndex + 3);
                const wp = this.eggPath[look];
                const desiredWrite = Math.atan2(wp.y - this.y, wp.x - this.x);
                const turnRate = 5.5;
                const diff = normAngle(desiredWrite - this.dir);
                this.dir += Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
                // Ease speed in corners; keep a steady ink flow on straights.
                const align = 1 - Math.min(1, Math.abs(diff) / Math.PI);
                const writeSpeed = 175 + 55 * align;
                this.x += Math.cos(this.dir) * writeSpeed * dt;
                this.y += Math.sin(this.dir) * writeSpeed * dt;
                // Advance along the ribbon when close enough to the current knot.
                while (this.eggIndex < this.eggPath.length) {
                    const p = this.eggPath[this.eggIndex];
                    if (Math.hypot(p.x - this.x, p.y - this.y) > 14) break;
                    this.eggIndex++;
                }
                // Also advance if we have mostly passed the waypoint along our heading.
                if (this.eggIndex < this.eggPath.length) {
                    const p = this.eggPath[this.eggIndex];
                    const tox = p.x - this.x, toy = p.y - this.y;
                    if (tox * Math.cos(this.dir) + toy * Math.sin(this.dir) < -2) {
                        this.eggIndex++;
                    }
                }
                if (this.trailDrop <= 0) {
                    this.trailDrop = 0.055;
                    this._writePathI = (this._writePathI || 0) + 1;
                    pushRainbowTrail(this.x, this.y, 5.5, this._writePathI);
                }
                this.tailPhase += dt * 9;
                if (Math.random() < 0.06) {
                    water.disturb(this.x, this.y, 5, 18);
                }
                if (this.eggIndex >= this.eggPath.length) {
                    this.rainbowPhase = "exit";
                    this._exitDir = undefined;
                    for (const p of rainbowScriptTrail) {
                        p.life = Math.max(p.life, p.age + 4.5);
                    }
                }
                return;
            }

            this.rainbowPhase = "exit";
            if (this._exitDir === undefined) {
                const toLeft = this.x, toRight = viewW - this.x;
                const toTop = this.y, toBottom = viewH - this.y;
                const m = Math.min(toLeft, toRight, toTop, toBottom);
                if (m === toLeft) this._exitDir = Math.PI;
                else if (m === toRight) this._exitDir = 0;
                else if (m === toTop) this._exitDir = -Math.PI / 2;
                else this._exitDir = Math.PI / 2;
            }
            desired = this._exitDir;
            speed = this.baseSpeed * CONFIG.rainbowSpeed * 1.15;
            this.trailDrop -= dt;
            if (this.trailDrop <= 0) {
                this.trailDrop = 0.08;
                this._writePathI = (this._writePathI || 0) + 1;
                pushRainbowTrail(this.x, this.y, 2.2, this._writePathI);
            }
            const m = this.size * 2;
            if (this.x < -m || this.x > viewW + m || this.y < -m || this.y > viewH + m) {
                this.dead = true;
            }
        } else if (this.debrisFlee && !this.isRainbow && !this.isMonster) {
            // Flinch away from hauled lake debris.
            desired = Math.atan2(this.y - this.debrisFlee.y, this.x - this.debrisFlee.x);
            speed = this.baseSpeed * (1.6 + (this.debrisFlee.force || 0.5));
        } else if (this.petTimer > 0 && !this.isRainbow && !this.isMonster) {
            desired = this.wander(dt);
            speed = this.baseSpeed * 0.25;
        } else {
            const threat = this.findThreat();
            // Even evil fish flee from something bigger (or a rainbow / shark).
            if (threat) {
                desired = Math.atan2(this.y - threat.y, this.x - threat.x);
                speed = this.baseSpeed * CONFIG.fleeSpeedMult;
            } else {
            // Pink fish lock onto the nearest eligible mate (full speed; no chaseToward softlock).
            const mate = this.findPinkMate();
            if (mate) {
                hardChase = true;
                desired = Math.atan2(mate.y - this.y, mate.x - this.x);
                speed = this.baseSpeed * CONFIG.predatorChaseMult;
            } else if (this.isRainbow) {
                // Rainbow priority: nearest food, then shark, then prey.
                hardChase = true;
                const foodChase = this.tryBiteFood(dt);
                if (foodChase) {
                    desired = foodChase.desired;
                    speed = foodChase.speed;
                } else if (shark && !shark.dead && !shark.leaving) {
                    const chase = this.chaseToward(
                        shark.x, shark.y,
                        this.baseSpeed * CONFIG.rainbowSpeed
                    );
                    desired = chase.desired;
                    speed = chase.speed;
                    if (chase.dist < this.size * 0.5 + shark.size * 0.45 + 12) this.eatShark();
                } else {
                    const meal = this.findEdibleReptile();
                    if (meal) {
                        const chase = this.chaseToward(
                            meal.x, meal.y,
                            this.baseSpeed * CONFIG.rainbowSpeed * 0.95
                        );
                        desired = chase.desired;
                        speed = chase.speed;
                        if (chase.dist < this.size * 0.5 + meal.size * 0.45 + 8) {
                            meal.dead = true;
                            this.becomeMonster();
                        }
                    } else {
                        if (!this.prey || this.prey.dead || this.prey.golden
                            || (!this.isRainbow && !this.isMonster && this.prey.size > this.size * 1.2)) {
                            this.prey = this.findPrey();
                        }
                        if (this.prey) {
                            const chase = this.chaseToward(
                                this.prey.x, this.prey.y,
                                this.baseSpeed * CONFIG.rainbowSpeed
                            );
                            desired = chase.desired;
                            speed = chase.speed;
                            if (chase.dist < this.size * 0.5 + this.prey.size * 0.5 + 8) {
                                this.eatFish(this.prey);
                            }
                        } else {
                            desired = this.wander(dt);
                            speed = this.baseSpeed * 1.15;
                            hardChase = false;
                        }
                    }
                }
            } else if (this.isPredator || this.isMonster) {
                // Monster endgame: hunt the shark instead of fleeing.
                if (this.isMonster && shark && !shark.dead && !shark.leaving) {
                    desired = Math.atan2(shark.y - this.y, shark.x - this.x);
                    speed = this.baseSpeed * 2.6;
                    const dist = Math.hypot(shark.x - this.x, shark.y - this.y);
                    if (dist < this.size * 0.5 + shark.size * 0.45 + 10) this.eatShark();
                } else {
                    // If we outgrew a reptile, hunt it and become a monster.
                    const meal = this.findEdibleReptile();
                    if (meal) {
                        desired = Math.atan2(meal.y - this.y, meal.x - this.x);
                        speed = this.baseSpeed * CONFIG.predatorChaseMult * 1.15;
                        const dist = Math.hypot(meal.x - this.x, meal.y - this.y);
                        if (dist < this.size * 0.5 + meal.size * 0.45 + 8) {
                            meal.dead = true;
                            this.becomeMonster();
                        }
                    } else {
                        // Evil fish prefer the nearest food over hunting other fish.
                        const foodChase = this.tryBiteFood(dt);
                        if (foodChase) {
                            desired = foodChase.desired;
                            speed = foodChase.speed * (this.isMonster ? 1.25 : 1);
                        } else {
                            if (!this.prey || this.prey.dead || this.prey.golden
                                || (!this.isRainbow && !this.isMonster && this.prey.size > this.size * 1.2)) {
                                this.prey = this.findPrey();
                            }
                            if (this.prey) {
                                desired = Math.atan2(this.prey.y - this.y, this.prey.x - this.x);
                                speed = this.baseSpeed * CONFIG.predatorChaseMult;
                                const dist = Math.hypot(this.prey.x - this.x, this.prey.y - this.y);
                                if (dist < this.size * 0.5 + this.prey.size * 0.5 + 6) this.eatFish(this.prey);
                            } else {
                                desired = this.wander(dt);
                                speed = this.baseSpeed * (this.isMonster ? 1.2 : 0.7);
                            }
                        }
                    }
                }
            } else if (this.isHero) {
                // Heroes: crocs/gators first, then aggressive exotics/evil fish,
                // then shark. If the whale already ate a fish, that hunt jumps
                // ahead for the one-shot remorse finale. Rainbows never targeted.
                hardChase = true;
                const whaleRemorseHunt = whale && !whale.dead && whale.ateFish
                    && !whaleRemorseDone && heroCanHuntWhale(this);
                const meal = whaleRemorseHunt ? null : this.findEdibleReptile();
                if (whaleRemorseHunt) {
                    const chase = this.chaseToward(
                        whale.x, whale.y,
                        this.baseSpeed * CONFIG.heroChaseMult
                    );
                    desired = chase.desired;
                    speed = chase.speed;
                    if (chase.dist < this.size * 0.55 + whale.size * 0.35 + 10) {
                        whale.dead = true;
                        whale = null;
                        beginHeroRemorseEnding(this);
                    }
                } else if (meal) {
                    const chase = this.chaseToward(
                        meal.x, meal.y,
                        this.baseSpeed * CONFIG.heroChaseMult
                    );
                    desired = chase.desired;
                    speed = chase.speed;
                    if (chase.dist < this.size * 0.5 + meal.size * 0.45 + 8) {
                        const gain = meal.size * 0.35;
                        meal.dead = true;
                        this.heroFinishKill("reptile", gain);
                    }
                } else {
                    if (!this.heroPreyStillValid(this.prey)) {
                        this.prey = this.findHeroPrey();
                    }
                    if (this.prey) {
                        const chase = this.chaseToward(
                            this.prey.x, this.prey.y,
                            this.baseSpeed * CONFIG.heroChaseMult
                        );
                        desired = chase.desired;
                        speed = chase.speed;
                        if (chase.dist < this.size * 0.5 + this.prey.size * 0.5 + 6) {
                            this.eatFish(this.prey);
                        }
                    } else if (shark && !shark.dead && !shark.leaving && this.size > shark.size) {
                        const chase = this.chaseToward(
                            shark.x, shark.y,
                            this.baseSpeed * CONFIG.heroChaseMult
                        );
                        desired = chase.desired;
                        speed = chase.speed;
                        if (chase.dist < this.size * 0.5 + shark.size * 0.45 + 10) {
                            const gain = shark.size * 0.35;
                            shark.dead = true;
                            shark = null;
                            this.heroFinishKill("shark", gain);
                        }
                    } else if (whale && !whale.dead && heroCanHuntWhale(this)) {
                        const chase = this.chaseToward(
                            whale.x, whale.y,
                            this.baseSpeed * CONFIG.heroChaseMult
                        );
                        desired = chase.desired;
                        speed = chase.speed;
                        if (chase.dist < this.size * 0.55 + whale.size * 0.35 + 10) {
                            const ateFish = !!whale.ateFish;
                            const gain = whale.size * 0.22;
                            whale.dead = true;
                            whale = null;
                            if (ateFish && !whaleRemorseDone) {
                                beginHeroRemorseEnding(this);
                            } else {
                                this.heroFinishKill("whale", gain);
                            }
                        }
                    } else {
                        const foodChase = this.tryBiteFood(dt);
                        if (foodChase) {
                            desired = foodChase.desired;
                            speed = foodChase.speed;
                            hardChase = false;
                        } else {
                            desired = this.wander(dt);
                            speed = this.baseSpeed * 0.65;
                            hardChase = false;
                        }
                    }
                }
            } else {
                // Normal fish that outgrew a reptile can still hunt it.
                const meal = this.findEdibleReptile();
                if (meal) {
                    desired = Math.atan2(meal.y - this.y, meal.x - this.x);
                    speed = this.baseSpeed * 1.8;
                    const dist = Math.hypot(meal.x - this.x, meal.y - this.y);
                    if (dist < this.size * 0.5 + meal.size * 0.45 + 8) {
                        meal.dead = true;
                        this.becomeMonster();
                    }
                } else {
                    const foodChase = this.tryBiteFood(dt);
                    if (foodChase) {
                        desired = foodChase.desired;
                        speed = foodChase.speed;
                    } else {
                        desired = this.wander(dt);
                        speed = this.baseSpeed * 0.6;
                    }
                }
            }
            } // end non-threat: mate seek / role AI
        }

        // Species dart habit still shows on evil forms (not rainbow: keeps tracking stable).
        if (this.type.dart && this.petTimer <= 0 && !this.rainbowLeaving && !this.isRainbow) {
            speed *= 1 + 0.5 * Math.max(0, Math.sin(this.age * 6));
        }
        // Exotic odd swims also shape cruising speed.
        if (this.type.odd && this.petTimer <= 0 && !this.rainbowLeaving && !this.isRainbow) {
            if (this.type.odd === "spiral") speed *= 0.78 + 0.22 * Math.sin(this.age * 1.7);
            else if (this.type.odd === "jitter") speed *= 0.7 + 0.9 * Math.random();
            else if (this.type.odd === "glide") {
                if (this._glideBurst > 0) {
                    this._glideBurst -= dt;
                    speed *= 1.55;
                } else {
                    speed *= 0.55;
                }
            } else if (this.type.odd === "drift") {
                speed *= 0.65;
            }
        }

        // Steer away from the banks (unless exiting or locked on a chase).
        if (!freeRoam && !hardChase) {
            const margin = 60;
            if (this.x < margin) desired = 0;
            else if (this.x > viewW - margin) desired = Math.PI;
            if (this.y < margin) desired = Math.PI / 2;
            else if (this.y > viewH - margin) desired = -Math.PI / 2;
        }

        // Softly steer around debris too large to shove aside.
        if (!freeRoam) {
            const avoid = obstacleAvoidDir(this.x, this.y, this.size * 0.4, this.size);
            if (avoid != null) desired = avoid;
        }

        // Turn rate: rainbow turns harder so it can track without orbiting.
        let turnRate = this.type.turn || 3;
        if (this.isRainbow) turnRate *= this.rainbowLeaving ? 3.2 : 2.4;
        const turn = turnRate * dt;
        const diff = normAngle(desired - this.dir);
        this.dir += Math.max(-turn, Math.min(turn, diff));

        this.x += Math.cos(this.dir) * speed * dt;
        this.y += Math.sin(this.dir) * speed * dt;
        if (!freeRoam) {
            this.x = Math.max(6, Math.min(viewW - 6, this.x));
            this.y = Math.max(6, Math.min(viewH - 6, this.y));
            resolveObstacleOverlap(this, this.size * 0.38);
        }

        this.tailPhase += dt * (4 + speed * 0.12) * (this.type.wiggle || 1);

        if (Math.random() < (this.isRainbow ? 0.2 : 0.05)) {
            water.disturb(this.x - Math.cos(this.dir) * this.size * 0.5,
                          this.y - Math.sin(this.dir) * this.size * 0.5,
                          this.isRainbow ? 8 : 4, this.isRainbow ? 40 : 18);
        }
    }

    wander(dt) {
        const odd = this.type.odd;
        if (odd === "spiral") {
            this._spiral = (this._spiral || 0) + dt * 2.4;
            return this.dir + 0.55 + Math.sin(this._spiral) * 1.35;
        }
        if (odd === "zigzag") {
            this._zigT = (this._zigT || 0) - dt;
            if (this._zigT <= 0) {
                this._zigT = 0.28 + Math.random() * 0.42;
                this._wanderDir = this.dir + (Math.random() < 0.5 ? -1 : 1) * (0.85 + Math.random() * 0.9);
            }
            return this._wanderDir !== undefined ? this._wanderDir : this.dir;
        }
        if (odd === "jitter") {
            return this.dir + (Math.random() - 0.5) * 2.8;
        }
        if (odd === "drift") {
            this.wanderTimer -= dt;
            if (this.wanderTimer <= 0) {
                this.wanderTimer = 1.4 + Math.random() * 1.8;
                this._wanderDir = Math.random() * Math.PI * 2;
            }
            return this._wanderDir !== undefined ? this._wanderDir : this.dir;
        }
        if (odd === "glide") {
            this._glideT = (this._glideT || 0) - dt;
            if (this._glideT <= 0) {
                this._glideT = 1.6 + Math.random() * 2.2;
                this._wanderDir = this.dir + (Math.random() - 0.5) * 2.2;
                this._glideBurst = 0.55;
            }
            return this._wanderDir !== undefined ? this._wanderDir : this.dir;
        }
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
            this.wanderTimer = 1 + Math.random() * 2;
            this._wanderDir = this.dir + (Math.random() - 0.5) * 1.4;
        }
        return this._wanderDir !== undefined ? this._wanderDir : this.dir;
    }

    bite() {
        const food = this.target;
        if (!food || food.eaten) return;

        if (food.rainbow) {
            food.eaten = true;
            this.target = null;
            this.turnToRainbow();
            return;
        }
        if (food.green) {
            food.eaten = true;
            this.target = null;
            this.turnToPlant();
            return;
        }
        if (food.golden) {
            food.eaten = true;
            this.target = null;
            this.turnToGold();
            return;
        }
        if (food.grower) {
            food.eaten = true;
            this.target = null;
            this.grow(CONFIG.growerBoost, { huge: true });
            this.baseSpeed = Math.min(
                CONFIG.predatorSpeedCap * 1.08,
                this.baseSpeed * 1.1
            );
            const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
            Audio.fishNote({
                freq: 320 * (this.type.register || 1),
                wave: this.type.wave || "sine",
                pan,
                dur: 0.55,
                level: 0.16,
                partialAmt: 0.35,
                bright: 1.3,
            });
            water.disturb(this.x, this.y, this.size * 0.7, 220);
            spawnSplash(this.x, this.y, this.size * 0.35, 0.45);
            return;
        }
        if (food.pink) {
            food.eaten = true;
            this.target = null;
            this.turnPink();
            return;
        }

        const chunk = Math.min(this.type.bite * (food.carcass ? 1.6 : 1), food.amount);
        food.amount -= chunk;
        food.biteCount++;
        this.biteTimer = food.biteInterval();
        this.grow(chunk * (food.carcass ? 0.55 : 0.22), food.carcass ? { huge: true } : null);
        // Evil fish get faster with every food bite.
        if (this.isPredator && !this.isRainbow) {
            this.baseSpeed = Math.min(
                CONFIG.predatorSpeedCap,
                this.baseSpeed * CONFIG.predatorFoodBoost
            );
        }

        water.disturb(food.x, food.y, food.radius() + 4, 120);

        const scale = this.type.scale || PENTATONIC;
        const degree = food.biteCount % scale.length;
        const octave = food.size > 22 ? 0.5 : 1;
        const freq = 220 * this.type.register * scale[degree] * octave;
        const pan = Math.max(-1, Math.min(1, (food.x / viewW) * 2 - 1));
        const t = this.type;
        Audio.fishNote({
            freq,
            wave: t.wave,
            pan,
            dur: t.dur,
            level: 0.14,
            partialAmt: t.bitePartial != null ? t.bitePartial : 0.18,
            partialRatio: t.wave === "square" ? 3 : 2,
            bright: t.biteBright != null ? t.biteBright : 1,
        });

        this.x += Math.cos(this.dir) * 3;
        this.y += Math.sin(this.dir) * 3;

        if (food.amount <= 0) {
            food.eaten = true;
            water.disturb(food.x, food.y, this.size, 200);
            Audio.fishNote({
                freq: 220 * t.register * 0.5,
                wave: t.wave,
                pan,
                dur: t.dur * 1.4,
                level: 0.16,
                partialAmt: (t.bitePartial != null ? t.bitePartial : 0.18) * 1.2,
                partialRatio: 1.5,
                bright: t.biteBright != null ? t.biteBright : 1,
            });
            this.target = null;
        }
    }

    eatFish(prey) {
        if (!prey || prey.dead || this.dead) return;
        if (prey.golden || prey.isRainbow) return; // rainbow fish cannot be eaten
        // Heroes only finish evil fish they strictly outsize.
        if (this.isHero && (!prey.isPredator && !prey.isMonster || this.size <= prey.size)) return;

        // If an evil fish (or any non-apex hunter) bites a larger fish, it gets eaten instead.
        if (!this.isRainbow && !this.isMonster && prey.size > this.size) {
            const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
            this.dead = true;
            this.prey = null;
            if (prey.prey === this) prey.prey = null;
            prey.grow(this.size * 0.5);
            Audio.predatorEat(pan);
            water.disturb(this.x, this.y, this.size, 320);
            spawnSplash(this.x, this.y, this.size * 0.6, 0.7);
            return;
        }

        prey.dead = true;
        this.grow(prey.size * 0.5);
        const pan = Math.max(-1, Math.min(1, (prey.x / viewW) * 2 - 1));
        Audio.predatorEat(pan);
        water.disturb(prey.x, prey.y, prey.size, 320);
        spawnSplash(prey.x, prey.y, prey.size * 0.6, 0.7);
        this.prey = null;
    }

    eatShark() {
        if (!shark || shark.dead) return;
        const pan = Math.max(-1, Math.min(1, (shark.x / viewW) * 2 - 1));
        Audio.sharkStrike(pan);
        if (this.isRainbow || this.isMonster) Audio.rainbowChime(pan);
        water.disturb(shark.x, shark.y, shark.size * 0.7, 900);
        spawnSplash(shark.x, shark.y, 34, 1);
        const gain = shark.size * 0.35;
        shark.dead = true;
        shark = null;
        if (this.isMonster) {
            beginPovAttack(this);
        } else if (this.isRainbow) {
            this.beginRainbowExit();
        } else if (this.isHero) {
            this.heroFinishKill("shark", gain);
        }
    }

    drawPattern(ctx, L, W) {
        const kind = this.type.pattern;
        if (!kind) return;
        const col = this.type.patternColor || "rgba(0,0,0,0.35)";
        ctx.save();
        ctx.fillStyle = col;
        ctx.strokeStyle = col;
        if (kind === "stripe") {
            ctx.lineWidth = Math.max(1.2, L * 0.08);
            ctx.beginPath();
            ctx.moveTo(-L * 0.35, 0);
            ctx.lineTo(L * 0.4, 0);
            ctx.stroke();
        } else if (kind === "bands") {
            ctx.lineWidth = Math.max(1, L * 0.05);
            for (let i = -2; i <= 2; i++) {
                const x = i * L * 0.16;
                ctx.beginPath();
                ctx.moveTo(x, -W * 0.75);
                ctx.lineTo(x, W * 0.75);
                ctx.stroke();
            }
        } else if (kind === "spots") {
            const spots = [[0.1, -0.25], [-0.15, 0.2], [0.28, 0.15], [-0.28, -0.1]];
            for (const [sx, sy] of spots) {
                ctx.beginPath();
                ctx.arc(L * sx, W * sy, Math.max(1.2, L * 0.07), 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (kind === "blotches") {
            ctx.globalAlpha *= 0.85;
            ctx.beginPath();
            ctx.ellipse(-L * 0.05, -W * 0.15, L * 0.18, W * 0.35, 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(L * 0.2, W * 0.1, L * 0.12, W * 0.22, -0.4, 0, Math.PI * 2);
            ctx.fill();
        } else if (kind === "hi") {
            // Kohaku-style red hi plates on white.
            ctx.globalAlpha *= 0.92;
            const plates = [
                [0.18, -0.05, 0.22, 0.42, 0.2],
                [-0.12, 0.08, 0.2, 0.36, -0.25],
                [-0.32, -0.12, 0.14, 0.28, 0.4],
            ];
            for (const [sx, sy, rx, ry, rot] of plates) {
                ctx.beginPath();
                ctx.ellipse(L * sx, W * sy, L * rx, W * ry, rot, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (kind === "sanke") {
            // Red hi plus sparse black sumi.
            ctx.globalAlpha *= 0.9;
            ctx.beginPath();
            ctx.ellipse(L * 0.15, -W * 0.08, L * 0.2, W * 0.4, 0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(-L * 0.18, W * 0.05, L * 0.16, W * 0.32, -0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "rgba(28,26,30,0.78)";
            ctx.beginPath();
            ctx.ellipse(L * 0.02, -W * 0.2, L * 0.08, W * 0.14, 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(-L * 0.28, W * 0.18, L * 0.07, W * 0.12, -0.2, 0, Math.PI * 2);
            ctx.fill();
        } else if (kind === "showa") {
            // Black base with red and white wraps.
            ctx.globalAlpha *= 0.88;
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.ellipse(L * 0.12, 0, L * 0.18, W * 0.38, 0.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(-L * 0.22, -W * 0.05, L * 0.15, W * 0.3, -0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "rgba(245,240,230,0.82)";
            ctx.beginPath();
            ctx.ellipse(L * 0.28, W * 0.12, L * 0.12, W * 0.22, 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(-L * 0.05, -W * 0.22, L * 0.1, W * 0.16, -0.5, 0, Math.PI * 2);
            ctx.fill();
        } else if (kind === "asagi") {
            // Blue scaled back, soft orange belly wrap.
            ctx.globalAlpha *= 0.55;
            ctx.lineWidth = Math.max(0.7, L * 0.03);
            for (let row = -2; row <= 1; row++) {
                for (let colI = -3; colI <= 3; colI++) {
                    const ox = colI * L * 0.09 + (row % 2) * L * 0.045;
                    const oy = -W * 0.15 + row * W * 0.22;
                    ctx.beginPath();
                    ctx.arc(ox, oy, L * 0.045, Math.PI * 0.15, Math.PI * 1.85);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = "rgba(230,150,100,0.55)";
            ctx.beginPath();
            ctx.ellipse(0, W * 0.35, L * 0.35, W * 0.28, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (kind === "scales") {
            ctx.lineWidth = 0.8;
            ctx.globalAlpha *= 0.45;
            for (let row = -2; row <= 2; row++) {
                for (let colI = -3; colI <= 3; colI++) {
                    const ox = colI * L * 0.1 + (row % 2) * L * 0.05;
                    const oy = row * W * 0.28;
                    ctx.beginPath();
                    ctx.arc(ox, oy, L * 0.05, Math.PI, Math.PI * 2);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }

    draw(ctx) {
        if (povAttack && povAttack.fish === this) return; // drawn in POV overlay

        const shape = this.type.shape || "oval";
        const slim = this.type.slim != null ? this.type.slim
            : shape === "slim" ? 0.58
            : shape === "round" ? 0.72
            : shape === "diamond" ? 0.85
            : shape === "longfin" ? 0.55
            : shape === "koi" ? (this.type.koi ? 0.68 : 0.62)
            : 0.5;
        const L = this.size;
        const W = this.size * 0.5 * slim;
        const wigAmt = this.golden ? 0 : (this.type.wiggle || 1);
        const wig = Math.sin(this.tailPhase) * 0.5 * wigAmt;
        const sink = this.golden ? (this.sinkDepth || 0) : 0;
        const isKoi = !!(this.type.koi || shape === "koi");

        let body = this.type.body;
        let belly = this.type.belly;
        if (this.golden) {
            // Deeper, quieter gold once resting on the lakebed.
            const deep = sink;
            body = deep > 0.85 ? "#b8891e" : "#f0c437";
            belly = deep > 0.85 ? "#d4b86a" : "#fff3b0";
        } else if (this.isRainbow) {
            const hue = (this.age * 140) % 360;
            body = `hsl(${hue}, 85%, 55%)`;
            belly = `hsl(${(hue + 40) % 360}, 90%, 75%)`;
        } else if (this.isMonster) {
            body = "#2a1020";
            belly = "#6a2038";
        } else if (this.isPink) {
            // Soft pink wash over species colors; patterns still draw underneath.
            body = washHexTowardPink(this.type.body, 0.58);
            belly = washHexTowardPink(this.type.belly, 0.48);
        }

        ctx.save();
        ctx.translate(this.x, this.y + (this.golden ? sink * 6 : 0));
        const s = 1 - sink * 0.35;
        ctx.scale(s, s);
        ctx.rotate(this.dir);
        // Golden fish settle on the lakebed and stay visible (dimmer) until refresh.
        const ghost = this.type.ghost || 1;
        ctx.globalAlpha = this.golden
            ? (0.42 + 0.38 * (1 - sink))
            : 0.9 * ghost;

        if (this.golden) {
            ctx.shadowColor = `rgba(255,215,90,${0.55 * (1 - sink * 0.7)})`;
            ctx.shadowBlur = 10 * (1 - sink * 0.5);
        } else if (this.isRainbow) {
            ctx.shadowColor = "rgba(255,100,255,0.85)";
            ctx.shadowBlur = 18;
        } else if (this.isMonster) {
            ctx.shadowColor = "rgba(80,0,20,0.85)";
            ctx.shadowBlur = 20;
        } else if (this.isPink) {
            ctx.shadowColor = "rgba(255,130,190,0.7)";
            ctx.shadowBlur = 12;
        } else if (this.isPredator) {
            ctx.shadowColor = "rgba(160,20,30,0.75)";
            ctx.shadowBlur = 14;
        } else if (this.isHero) {
            const giantGlow = giantEnding && giantEnding.fish === this && giantEnding.kind === "peace";
            const remorseGlow = heroRemorseEnding && heroRemorseEnding.fish === this;
            ctx.shadowColor = (giantGlow || remorseGlow)
                ? "rgba(160,220,255,0.95)" : "rgba(70,160,220,0.8)";
            ctx.shadowBlur = (giantGlow || remorseGlow) ? 26 : 14;
        } else if (isKoi) {
            ctx.shadowColor = "rgba(40,70,90,0.45)";
            ctx.shadowBlur = 10;
        } else if (this.type.exotic) {
            ctx.shadowColor = "rgba(120,180,200,0.55)";
            ctx.shadowBlur = 12;
        } else {
            ctx.shadowColor = "rgba(20,50,70,0.6)";
            ctx.shadowBlur = 8;
        }

        // Caudal fin: lobed, not a flat triangle.
        ctx.fillStyle = body;
        ctx.beginPath();
        if (shape === "koi" || shape === "longfin") {
            // Broader, softer koi twin lobes with trailing veil.
            const spread = isKoi ? 1.15 : 1;
            ctx.moveTo(-L * 0.4, 0);
            ctx.bezierCurveTo(-L * 0.62, -W * (0.95 + wig * 0.3) * spread, -L * 0.9, -W * (1.45 + wig) * spread, -L * 1.15, -W * (1.15 + wig) * spread);
            ctx.quadraticCurveTo(-L * 0.82, -W * 0.12, -L * 0.55, 0);
            ctx.quadraticCurveTo(-L * 0.82, W * 0.12, -L * 1.15, W * (1.15 + wig) * spread);
            ctx.bezierCurveTo(-L * 0.9, W * (1.45 + wig) * spread, -L * 0.62, W * (0.95 + wig * 0.3) * spread, -L * 0.4, 0);
        } else if (shape === "diamond") {
            ctx.moveTo(-L * 0.34, 0);
            ctx.quadraticCurveTo(-L * 0.55, -W * 0.9, -L * 0.78, -W * 1.45);
            ctx.quadraticCurveTo(-L * 0.58, 0, -L * 0.78, W * 1.45);
            ctx.quadraticCurveTo(-L * 0.55, W * 0.9, -L * 0.34, 0);
        } else {
            ctx.moveTo(-L * 0.42, 0);
            ctx.quadraticCurveTo(-L * 0.62, -W * 0.55, -L * 0.92, -W * (0.95 + wig * 0.5));
            ctx.quadraticCurveTo(-L * 0.7, 0, -L * 0.92, W * (0.95 + wig * 0.5));
            ctx.quadraticCurveTo(-L * 0.62, W * 0.55, -L * 0.42, 0);
        }
        ctx.fill();

        // Body: fusiform curves instead of plain ellipses / diamonds.
        const g = ctx.createLinearGradient(0, -W, 0, W);
        g.addColorStop(0, body);
        g.addColorStop(0.55, body);
        g.addColorStop(1, belly);
        ctx.fillStyle = g;
        if (shape === "diamond") {
            ctx.beginPath();
            ctx.moveTo(L * 0.48, 0);
            ctx.bezierCurveTo(L * 0.2, -W * 0.9, -L * 0.05, -W * 1.2, -L * 0.38, 0);
            ctx.bezierCurveTo(-L * 0.05, W * 1.2, L * 0.2, W * 0.9, L * 0.48, 0);
            ctx.closePath();
        } else {
            pathFishFusiform(ctx, L, W, shape);
        }
        ctx.fill();

        // Soft belly highlight.
        ctx.globalAlpha *= 0.35;
        ctx.fillStyle = belly;
        ctx.beginPath();
        ctx.moveTo(L * 0.25, W * 0.15);
        ctx.quadraticCurveTo(0, W * 0.75, -L * 0.25, W * 0.2);
        ctx.quadraticCurveTo(0, W * 0.35, L * 0.25, W * 0.15);
        ctx.fill();
        ctx.globalAlpha /= 0.35;

        // Dorsal fin.
        if (!this.golden) {
            ctx.fillStyle = body;
            ctx.globalAlpha *= 0.8;
            ctx.beginPath();
            ctx.moveTo(-L * 0.05, -W * 0.7);
            ctx.quadraticCurveTo(L * 0.08, -W * (shape === "longfin" ? 2.0 : 1.45), L * 0.28, -W * 0.45);
            ctx.quadraticCurveTo(L * 0.1, -W * 0.7, -L * 0.05, -W * 0.7);
            ctx.fill();
            ctx.globalAlpha /= 0.8;
        }

        // Pectoral fin hint.
        ctx.globalAlpha *= 0.55;
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(L * 0.05, W * 0.25);
        ctx.quadraticCurveTo(L * 0.18, W * 0.7, L * 0.02, W * 0.85);
        ctx.quadraticCurveTo(-L * 0.02, W * 0.5, L * 0.05, W * 0.25);
        ctx.fill();
        ctx.globalAlpha /= 0.55;

        // Gill plate mark.
        ctx.strokeStyle = "rgba(20,30,35,0.22)";
        ctx.lineWidth = Math.max(0.7, L * 0.025);
        ctx.beginPath();
        ctx.arc(L * 0.18, 0, W * 0.55, -1.1, 1.1);
        ctx.stroke();

        // Koi / catfish whiskers (barbels).
        if ((shape === "koi" || this.type.whiskers) && !this.golden) {
            ctx.strokeStyle = isKoi ? "rgba(50,35,25,0.65)" : "rgba(40,30,20,0.55)";
            ctx.lineWidth = Math.max(0.8, L * (isKoi ? 0.035 : 0.03));
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(L * 0.38, W * 0.18);
            ctx.quadraticCurveTo(L * 0.58, W * 0.5, L * 0.5, W * 0.78);
            ctx.moveTo(L * 0.38, W * 0.02);
            ctx.quadraticCurveTo(L * 0.6, W * 0.22, L * 0.55, W * 0.42);
            if (isKoi) {
                ctx.moveTo(L * 0.36, -W * 0.08);
                ctx.quadraticCurveTo(L * 0.52, -W * 0.02, L * 0.48, W * 0.12);
            }
            ctx.stroke();
        }

        // Longfin top sail already covered by taller dorsal; add soft trailing veil.
        if (shape === "longfin") {
            ctx.fillStyle = body;
            ctx.globalAlpha *= 0.45;
            ctx.beginPath();
            ctx.moveTo(-L * 0.15, -W * 0.5);
            ctx.quadraticCurveTo(L * 0.1, -W * 2.1, L * 0.35, -W * 0.35);
            ctx.quadraticCurveTo(L * 0.05, -W * 0.9, -L * 0.15, -W * 0.5);
            ctx.fill();
            ctx.globalAlpha /= 0.45;
        }

        // Koi: soft scale shimmer and pelvic fin for a fuller carp silhouette.
        if (isKoi && !this.golden && !this.isRainbow && !this.isMonster) {
            ctx.save();
            ctx.globalAlpha *= 0.28;
            ctx.strokeStyle = "rgba(255,255,255,0.55)";
            ctx.lineWidth = Math.max(0.5, L * 0.02);
            for (let row = -2; row <= 2; row++) {
                for (let colI = -3; colI <= 3; colI++) {
                    const ox = colI * L * 0.09 + (row % 2) * L * 0.045;
                    const oy = row * W * 0.24;
                    if (Math.hypot(ox / L, oy / W) > 0.55) continue;
                    ctx.beginPath();
                    ctx.arc(ox, oy, L * 0.04, Math.PI * 0.2, Math.PI * 1.8);
                    ctx.stroke();
                }
            }
            ctx.restore();
            ctx.globalAlpha *= 0.5;
            ctx.fillStyle = body;
            ctx.beginPath();
            ctx.moveTo(-L * 0.05, W * 0.35);
            ctx.quadraticCurveTo(-L * 0.02, W * 0.85, -L * 0.2, W * 0.95);
            ctx.quadraticCurveTo(-L * 0.18, W * 0.55, -L * 0.05, W * 0.35);
            ctx.fill();
            ctx.globalAlpha /= 0.5;
        }

        if (!this.golden && !this.isRainbow && !this.isMonster) this.drawPattern(ctx, L, W);

        if (this.isMonster) {
            ctx.fillStyle = "rgba(120,0,30,0.28)";
            pathFishFusiform(ctx, L, W, shape);
            ctx.fill();
        } else if (this.isPredator && !this.isRainbow && !this.golden) {
            // Red menace fades as the fish is soothed toward redemption.
            const soothe = Math.min(1, (this.evilPetProgress || 0) / CONFIG.evilSootheTime);
            const menace = 0.22 * (1 - soothe * 0.85);
            ctx.fillStyle = `rgba(120,10,20,${menace})`;
            pathFishFusiform(ctx, L, W, shape);
            ctx.fill();
        } else if (this.isHero && !this.golden) {
            // Soft blue wash so heroes read against red evil fish.
            ctx.fillStyle = "rgba(40,120,190,0.16)";
            pathFishFusiform(ctx, L, W, shape);
            ctx.fill();
        }
        if (this.isPink && !this.golden && !this.isRainbow && !this.isMonster) {
            // Extra blush so pink reads clearly while shape and pattern stay visible.
            ctx.fillStyle = "rgba(255,120,180,0.2)";
            pathFishFusiform(ctx, L, W, shape);
            ctx.fill();
        }

        ctx.shadowBlur = 0;
        const eyeX = L * (shape === "diamond" ? 0.22 : 0.3);
        const eyeY = -W * (shape === "round" ? 0.12 : 0.22);
        const eyeR = Math.max(1.1, L * 0.055);
        if (this.petTimer > 0 && !this.golden && !this.isRainbow && !this.isMonster) {
            ctx.strokeStyle = this.isPredator
                ? "rgba(80,20,20,0.9)"
                : "rgba(20,25,30,0.9)";
            ctx.lineWidth = Math.max(1.2, L * 0.05);
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.arc(eyeX, eyeY + eyeR * 0.2, eyeR * 1.3, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
            ctx.lineWidth = Math.max(0.8, L * 0.03);
            ctx.globalAlpha *= 0.55;
            ctx.beginPath();
            ctx.arc(eyeX, eyeY + eyeR * 0.55, eyeR * 0.9, Math.PI * 1.2, Math.PI * 1.8);
            ctx.stroke();
        } else {
            // Eye socket + wet highlight.
            ctx.fillStyle = "rgba(245,245,240,0.88)";
            ctx.beginPath();
            ctx.ellipse(eyeX, eyeY, eyeR * 1.15, eyeR * 0.95, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = this.golden
                ? "rgba(120,80,20,0.9)"
                : this.isRainbow ? "rgba(40,40,50,0.95)"
                : this.isMonster ? "rgba(255,40,40,0.95)"
                : this.isPredator ? "rgba(180,30,25,0.95)"
                : this.isHero ? "rgba(30,90,160,0.95)" : "rgba(12,16,22,0.95)";
            ctx.beginPath();
            ctx.arc(eyeX, eyeY, eyeR * 0.72, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.beginPath();
            ctx.arc(eyeX - eyeR * 0.25, eyeY - eyeR * 0.28, eyeR * 0.22, 0, Math.PI * 2);
            ctx.fill();
            if (this.isRainbow) {
                ctx.fillStyle = `hsl(${(this.age * 200) % 360}, 90%, 45%)`;
                ctx.beginPath();
                ctx.arc(eyeX, eyeY, eyeR * 0.35, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        drawCreatureHat(ctx, L, W, this.hatSeed);
        ctx.restore();
    }
}

// Tiny festive hats for pond life once the gold-fish unlock is earned.
function drawCreatureHat(ctx, L, W, seed) {
    if (mariachiMode) {
        drawMariachiHat(ctx, L, W);
        return;
    }
    if (!hatsOn) return;
    const kind = Math.floor((seed || 0) * 3) % 3;
    const hx = L * 0.02;
    const hy = -W * (1.05 + (kind === 1 ? 0.05 : 0));
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = Math.min(1, (ctx.globalAlpha || 1) * 1.05);
    if (kind === 0) {
        // Little top hat.
        ctx.fillStyle = "#2a2430";
        ctx.fillRect(hx - L * 0.11, hy - L * 0.2, L * 0.22, L * 0.16);
        ctx.fillStyle = "#c9a24b";
        ctx.fillRect(hx - L * 0.11, hy - L * 0.08, L * 0.22, L * 0.03);
        ctx.fillStyle = "#2a2430";
        ctx.fillRect(hx - L * 0.17, hy - L * 0.05, L * 0.34, L * 0.05);
    } else if (kind === 1) {
        // Party cone.
        ctx.fillStyle = "#d45a6a";
        ctx.beginPath();
        ctx.moveTo(hx, hy - L * 0.28);
        ctx.lineTo(hx - L * 0.13, hy);
        ctx.lineTo(hx + L * 0.13, hy);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#f0d060";
        ctx.beginPath();
        ctx.arc(hx, hy - L * 0.28, Math.max(1.2, L * 0.035), 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Soft bowler.
        ctx.fillStyle = "#3a4a68";
        ctx.beginPath();
        ctx.ellipse(hx, hy - L * 0.02, L * 0.15, L * 0.1, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(hx - L * 0.18, hy - L * 0.03, L * 0.36, L * 0.05);
        ctx.fillStyle = "#c9a24b";
        ctx.fillRect(hx - L * 0.15, hy - L * 0.03, L * 0.3, L * 0.02);
    }
    ctx.restore();
}

function rand(a, b) { return a + Math.random() * (b - a); }
function normAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}
function nearestFish(x, y) {
    let best = null, bd = Infinity;
    for (const f of fishes) {
        if (f.dead || f.golden) continue;
        const d = Math.hypot(x - f.x, y - f.y);
        if (d < bd) { bd = d; best = f; }
    }
    return best;
}
function initFish() {
    if (fishes.length) return;
    for (let i = 0; i < CONFIG.fishCount; i++) {
        fishes.push(new Fish(FISH_TYPES[i % FISH_TYPES.length]));
    }
    // Always keep at least one hero in the starting school.
    if (!fishes.some((f) => f.isHero)) fishes[0].isHero = true;
}

function parseHexColor(hex) {
    if (!hex || typeof hex !== "string" || hex[0] !== "#") return null;
    let h = hex.slice(1);
    if (h.length === 3) {
        h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    if (h.length !== 6) return null;
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixHexColors(a, b, t) {
    const A = parseHexColor(a);
    const B = parseHexColor(b);
    if (!A || !B) return Math.random() < 0.5 ? a : b;
    const u = Math.max(0, Math.min(1, t));
    const r = Math.round(A.r + (B.r - A.r) * u);
    const g = Math.round(A.g + (B.g - A.g) * u);
    const bl = Math.round(A.b + (B.b - A.b) * u);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}

function washHexTowardPink(hex, amount) {
    return mixHexColors(hex, "#ff7eb6", amount == null ? 0.55 : amount);
}

function pickParentField(a, b) {
    return Math.random() < 0.5 ? a : b;
}

function mixFishTypes(ta, tb) {
    const slimA = ta.slim != null ? ta.slim : null;
    const slimB = tb.slim != null ? tb.slim : null;
    let slim = null;
    if (slimA != null && slimB != null) slim = (slimA + slimB) * 0.5;
    else slim = slimA != null ? slimA : slimB;

    const sizeLo = Math.min(ta.size[0], tb.size[0]) * 0.55;
    const sizeHi = Math.min(ta.size[1], tb.size[1]) * 0.7;
    const speedLo = (ta.speed[0] + tb.speed[0]) * 0.5;
    const speedHi = (ta.speed[1] + tb.speed[1]) * 0.5;

    const type = {
        name: "fry",
        shape: pickParentField(ta.shape, tb.shape),
        body: mixHexColors(ta.body, tb.body, 0.35 + Math.random() * 0.3),
        belly: mixHexColors(ta.belly, tb.belly, 0.35 + Math.random() * 0.3),
        pattern: pickParentField(ta.pattern, tb.pattern),
        patternColor: (ta.patternColor && tb.patternColor)
            ? mixHexColors(ta.patternColor, tb.patternColor, 0.5)
            : (ta.patternColor || tb.patternColor || null),
        size: [Math.max(8, sizeLo), Math.max(10, sizeHi)],
        speed: [speedLo * 0.9, speedHi * 1.05],
        wave: pickParentField(ta.wave, tb.wave),
        register: (ta.register + tb.register) * 0.5,
        bite: Math.max(2, Math.round((ta.bite + tb.bite) * 0.4)),
        dur: (ta.dur + tb.dur) * 0.5,
        turn: (ta.turn + tb.turn) * 0.5,
        wiggle: (ta.wiggle + tb.wiggle) * 0.5,
        scale: pickParentField(ta.scale, tb.scale),
        petWave: pickParentField(ta.petWave || ta.wave, tb.petWave || tb.wave),
        petFreq: ((ta.petFreq || 300) + (tb.petFreq || 300)) * 0.5,
        petDur: ((ta.petDur || 0.35) + (tb.petDur || 0.35)) * 0.5,
        bitePartial: ((ta.bitePartial != null ? ta.bitePartial : 0.18)
            + (tb.bitePartial != null ? tb.bitePartial : 0.18)) * 0.5,
        biteBright: ((ta.biteBright != null ? ta.biteBright : 1)
            + (tb.biteBright != null ? tb.biteBright : 1)) * 0.5,
    };
    if (slim != null) type.slim = slim;
    if (ta.whiskers || tb.whiskers) type.whiskers = Math.random() < 0.55;
    if (ta.dart || tb.dart) type.dart = Math.random() < 0.45;
    if (ta.odd || tb.odd) type.odd = pickParentField(ta.odd || null, tb.odd || null);
    if (ta.exotic || tb.exotic) type.exotic = Math.random() < 0.4;
    if (ta.ghost != null || tb.ghost != null) {
        type.ghost = ((ta.ghost != null ? ta.ghost : 1) + (tb.ghost != null ? tb.ghost : 1)) * 0.5;
    }
    // Drop null odd so habits stay clean.
    if (!type.odd) delete type.odd;
    if (!type.pattern) type.patternColor = null;
    return type;
}

function canBreedFish(f) {
    return !!(f && f.isPink && !f.dead && !f.golden && !f.isRainbow
        && !f.rainbowLeaving && !f.isMonster && f.breedCooldown <= 0);
}

function spawnBreedOffspring(a, b) {
    const living = fishes.filter((f) => !f.dead).length;
    if (living >= CONFIG.maxBreedPop) return null;
    const type = mixFishTypes(a.type, b.type);
    const baby = new Fish(type);
    baby.isHero = false;
    baby.isPredator = false;
    baby.isPink = false;
    baby.isRainbow = false;
    baby.isMonster = false;
    baby.redeemed = false;
    const midSize = (a.size + b.size) * 0.5;
    baby.size = Math.max(8, Math.min(midSize * 0.42, type.size[1]));
    baby.baseSpeed = (a.baseSpeed + b.baseSpeed) * 0.5 * (0.88 + Math.random() * 0.2);
    baby.x = (a.x + b.x) * 0.5 + (Math.random() - 0.5) * 10;
    baby.y = (a.y + b.y) * 0.5 + (Math.random() - 0.5) * 10;
    baby.dir = Math.atan2(b.y - a.y, b.x - a.x) + (Math.random() - 0.5) * 0.8;
    fishes.push(baby);
    a.breedCooldown = CONFIG.breedCooldown;
    b.breedCooldown = CONFIG.breedCooldown;
    const pan = Math.max(-1, Math.min(1, (baby.x / viewW) * 2 - 1));
    Audio.fishNote({
        freq: 480 * (type.register || 1),
        wave: "sine",
        pan,
        dur: 0.35,
        level: 0.1,
        partialAmt: 0.35,
        bright: 1.35,
    });
    water.disturb(baby.x, baby.y, baby.size * 0.8, 100);
    spawnSplash(baby.x, baby.y, baby.size * 0.4, 0.3);
    return baby;
}

function updateBreeding() {
    const pinks = fishes.filter(canBreedFish);
    if (pinks.length < 2) return;
    if (fishes.filter((f) => !f.dead).length >= CONFIG.maxBreedPop) return;
    for (let i = 0; i < pinks.length; i++) {
        for (let j = i + 1; j < pinks.length; j++) {
            const a = pinks[i];
            const b = pinks[j];
            const touch = (a.size + b.size) * 0.52;
            if (Math.hypot(a.x - b.x, a.y - b.y) <= touch) {
                spawnBreedOffspring(a, b);
                return;
            }
        }
    }
}

// ===========================================================================
// REPTILES, SHARK, WHALE + ECOSYSTEM
// Rare crocodiles/alligators arrive on a long timer. They eat smaller fish.
// A fish that outgrows and eats one becomes a monster, which later eats the
// shark and then swims into the camera (POV) to "eat the user" and reset.
// Heroes / redeemed (and grower-fed giants) that fill ~half the screen get a
// separate farewell ending, then resetPond.
// After a whale eats a fish, a large enough hero can hunt it for a one-shot
// remorse explosion into a full hero school (every common + exotic type).
// ===========================================================================
let shark = null;
let whale = null;
let reptiles = [];
let povAttack = null; // { fish, t }
let giantEnding = null; // { fish, t, kind: "peace" | "shadow" }
let heroRemorseEnding = null; // { fish, t, burst }
let whaleRemorseDone = false; // one-shot: remorse finale already fired this session
let apexDuel = null; // croc/alligator vs shark when the pond is emptied
let repopulating = false;
let repopTimer = 0;
let whaleCheckTimer = 0;
let reptileCheckTimer = 0;
let exoticCheckTimer = 0;

function pondFinaleActive() {
    return !!(povAttack || giantEnding || heroRemorseEnding);
}

function giantSizeThreshold() {
    return Math.min(viewW, viewH) * CONFIG.giantSizeFrac;
}

function giantSizeCap() {
    return Math.min(viewW, viewH) * CONFIG.giantCapFrac;
}

// Large hero may hunt the whale after it ate a fish, or whenever fully larger.
function heroCanHuntWhale(hero) {
    if (!hero || !hero.isHero || !whale || whale.dead) return false;
    if (hero.size > whale.size) return true;
    if (!whale.ateFish) return false;
    const screenGate = Math.min(viewW, viewH) * CONFIG.whaleHeroHuntScreen;
    return hero.size > whale.size * CONFIG.whaleHeroHuntFrac
        || hero.size >= screenGate;
}

// Heroes / redeemed can climb to ~half the screen on any meal; grower/carcass unlocks that for everyone else.
function fishGrowCap(fish, opts) {
    const half = giantSizeCap();
    if (opts && opts.huge) {
        return Math.max(CONFIG.growerMaxSize, half);
    }
    if (fish && (fish.isHero || fish.redeemed)) {
        return Math.max(CONFIG.maxFishSize, half);
    }
    return CONFIG.maxFishSize;
}

// Quiet keyword spawn: type "alligator" (see noteFoodVariantKeyword).
function spawnKeywordAlligator() {
    if (mode !== "pond" || pondFinaleActive()) return;
    const r = new Reptile("alligator");
    reptiles.push(r);
    water.disturb(r.x, r.y, r.size * 0.5, 200);
    spawnSplash(r.x, r.y, r.size * 0.35, 0.45);
}

function beginApexDuel() {
    if (apexDuel || pondFinaleActive()) return;
    // Keep the largest wild reptile for the finale. Tamed crocs sit the fight out.
    const living = reptiles.filter((r) => !r.dead && !r.tamed && !r.golden);
    if (!living.length) return;
    living.sort((a, b) => b.size - a.size);
    const champ = living[0];
    for (const r of reptiles) {
        if (r !== champ && !r.tamed && !r.golden) r.dead = true;
    }
    reptiles = reptiles.filter((r) => !r.dead);
    champ.duelMode = true;
    champ.hp = 6;
    champ.speed = Math.max(champ.speed, 72);
    champ.target = null;
    if (!shark || shark.dead) {
        shark = new Shark(champ);
    }
    shark.duelMode = true;
    shark.leaving = false;
    shark.hp = 6;
    shark.target = champ;
    apexDuel = { t: 0, biteCd: 0.35 };
    const pan = champ.x < viewW * 0.5 ? -0.35 : 0.35;
    Audio.sharkStrike(pan);
    Audio.predatorEat(pan);
    water.disturb(champ.x, champ.y, 40, 400);
}

function finishApexDuel() {
    const spots = [];
    if (shark && !shark.dead) {
        spots.push({ x: shark.x, y: shark.y, size: shark.size });
    } else if (shark) {
        spots.push({ x: shark.x, y: shark.y, size: shark.size * 0.85 });
    }
    for (const r of reptiles) {
        // Tamed friends sit out the duel and should survive the finale.
        if (r.tamed || r.golden) {
            r.duelMode = false;
            continue;
        }
        spots.push({ x: r.x, y: r.y, size: r.size });
        r.dead = true;
    }
    if (shark) {
        shark.dead = true;
        shark = null;
    }
    reptiles = reptiles.filter((r) => !r.dead);
    apexDuel = null;

    for (const s of spots) {
        water.disturb(s.x, s.y, s.size * 0.8, 700);
        spawnSplash(s.x, s.y, 30, 1);
        for (let i = 0; i < 3; i++) {
            const ang = (i / 3) * Math.PI * 2 + Math.random();
            const dist = 10 + Math.random() * 22;
            foods.push(new Food(
                s.x + Math.cos(ang) * dist,
                s.y + Math.sin(ang) * dist,
                16 + s.size * 0.1,
                { carcass: true }
            ));
        }
    }
    Audio.sharkStrike(0);
    Audio.predatorEat(0);
    // New fish arrive and clean up the remains.
    repopulating = true;
    repopTimer = 0.55;
}

function updateApexDuel(dt) {
    if (!apexDuel) return;
    apexDuel.t += dt;
    apexDuel.biteCd -= dt;
    const r = reptiles.find((x) => !x.dead);
    if (!shark || shark.dead || !r) {
        finishApexDuel();
        return;
    }
    // Force them to face each other; bites land in updateApexDuel.
    shark.duelMode = true;
    shark.leaving = false;
    shark.target = r;
    r.duelMode = true;
    r.target = null;

    const dist = Math.hypot(shark.x - r.x, shark.y - r.y);
    const reach = shark.size * 0.45 + r.size * 0.45 + 10;
    if (dist < reach && apexDuel.biteCd <= 0) {
        shark.hp = (shark.hp == null ? 6 : shark.hp) - 1;
        r.hp = (r.hp == null ? 6 : r.hp) - 1;
        apexDuel.biteCd = 0.42;
        const mx = (shark.x + r.x) * 0.5;
        const my = (shark.y + r.y) * 0.5;
        const pan = Math.max(-1, Math.min(1, (mx / viewW) * 2 - 1));
        Audio.sharkStrike(pan);
        Audio.predatorEat(pan);
        water.disturb(mx, my, 36, 520);
        spawnSplash(mx, my, 22, 0.9);
        // Shove apart a little so the fight reads as clashing passes.
        const nx = (shark.x - r.x) / (dist || 1);
        const ny = (shark.y - r.y) / (dist || 1);
        shark.x += nx * 10;
        shark.y += ny * 10;
        r.x -= nx * 10;
        r.y -= ny * 10;
        if (shark.hp <= 0 || r.hp <= 0) {
            finishApexDuel();
        }
    }
    // Safety: never let a stalled duel lock the pond forever.
    if (apexDuel && apexDuel.t > 40) finishApexDuel();
}

// Right-click the snout this many times in a short window to scare a reptile off.
const REPTILE_SNOUT_SCARE_TAPS = 5;
const REPTILE_SNOUT_TAP_WINDOW = 2.4;

class Reptile {
    constructor(kind) {
        // kind: "crocodile" (narrow snout) or "alligator" (broad snout)
        this.kind = kind || (Math.random() < 0.5 ? "crocodile" : "alligator");
        this.size = rand(CONFIG.reptileSize[0], CONFIG.reptileSize[1]);
        this.tailPhase = Math.random() * Math.PI * 2;
        this.dead = false;
        this.leaving = false;
        this.eatPulse = 0;
        this.duelMode = false;
        this.hp = 6;
        this.snoutTaps = 0;
        this.snoutTapWindow = 0;
        this.tamed = false;
        this.petCount = 0;
        this.petProgress = 0;
        this.petTimer = 0;
        this.biteTimer = 0;
        this.foodTarget = null;
        this.golden = false;
        this.sinkTimer = 0;
        this.sinkDepth = 0;
        this.friendlyBoost = 0; // rainbow food: brief colorful speed rush
        const side = Math.floor(Math.random() * 4);
        if (side === 0) { this.x = -this.size; this.y = Math.random() * viewH; }
        else if (side === 1) { this.x = viewW + this.size; this.y = Math.random() * viewH; }
        else if (side === 2) { this.x = Math.random() * viewW; this.y = -this.size; }
        else { this.x = Math.random() * viewW; this.y = viewH + this.size; }
        this.dir = Math.atan2(viewH * 0.5 - this.y, viewW * 0.5 - this.x);
        this.speed = 55 + Math.random() * 20;
        this.target = null;
        Audio.predatorEat(this.x < viewW * 0.5 ? -0.3 : 0.3);
    }

    pet() {
        if (this.dead || this.leaving || this.duelMode || this.golden) return;
        this.petTimer = 1.4;
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        Audio.fishNote({
            freq: this.tamed ? 240 : 190,
            wave: "triangle",
            pan,
            dur: 0.4,
            level: 0.07,
            partialAmt: 0.18,
            partialRatio: 2.1,
            bright: 0.85,
        });
        water.disturb(this.x, this.y, this.size * 0.35, 50);

        if (this.tamed) return;

        // Discrete pets are the main path; continuous stroke time is tracked in update.
        this.petCount++;
        if (this.petCount >= CONFIG.petsToTame
            || this.petProgress >= CONFIG.reptileSootheTime) {
            this.tame();
        }
    }

    tame() {
        if (this.tamed || this.dead || this.duelMode || this.golden) return;
        this.tamed = true;
        this.target = null;
        this.foodTarget = null;
        this.petCount = 0;
        this.petProgress = 0;
        this.petTimer = Math.max(this.petTimer, 1.8);
        this.speed = Math.max(42, this.speed * 0.85);
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        Audio.fishNote({
            freq: 260,
            wave: "sine",
            pan,
            dur: 0.55,
            level: 0.1,
            partialAmt: 0.3,
            partialRatio: 2.4,
            bright: 1.2,
        });
        Audio.fishNote({
            freq: 340,
            wave: "triangle",
            pan,
            dur: 0.4,
            level: 0.07,
            partialAmt: 0.22,
            bright: 1.25,
        });
        water.disturb(this.x, this.y, this.size * 0.65, 140);
        spawnSplash(this.x, this.y, this.size * 0.3, 0.4);
    }

    grow(amount) {
        if (this.golden) return;
        const half = Math.min(viewW, viewH) * CONFIG.giantCapFrac;
        const cap = Math.max(CONFIG.growerMaxSize, half);
        this.size = Math.min(cap, this.size + amount);
    }

    turnToGold() {
        this.golden = true;
        this.target = null;
        this.foodTarget = null;
        this.sinkTimer = 0;
        this.sinkDepth = 0;
        this.friendlyBoost = 0;
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        if (Audio.goldChime) Audio.goldChime(pan);
        water.disturb(this.x, this.y, this.size * 1.1, 260);
        spawnSplash(this.x, this.y, this.size * 0.45, 0.5);
    }

    turnToPlant() {
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        Audio.fishNote({
            freq: 160,
            wave: "triangle",
            pan,
            dur: 0.7,
            level: 0.12,
        });
        water.disturb(this.x, this.y, this.size, 220);
        spawnSplash(this.x, this.y, this.size * 0.4, 0.4);
        pondPlants.push(makePondPlant(this.x, this.y, this.size * 0.85));
        this.dead = true;
    }

    tryBiteFood(dt) {
        if (!this.tamed || this.golden || this.leaving || this.duelMode) return false;
        const range = CONFIG.perception * 1.35;
        if (!this.foodTarget || this.foodTarget.eaten) {
            this.foodTarget = nearestFood(this.x, this.y, range);
        }
        if (!this.foodTarget) return false;
        this.biteTimer -= dt;
        const food = this.foodTarget;
        const desired = Math.atan2(food.y - this.y, food.x - this.x);
        const dist = Math.hypot(food.x - this.x, food.y - this.y);
        const eatDist = this.size * 0.48 + food.radius() + 6;
        const boost = this.friendlyBoost > 0 ? 1.55 : 1.35;
        if (dist < eatDist && this.biteTimer <= 0) this.biteFood();
        return { desired, speed: this.speed * boost, chasing: true };
    }

    biteFood() {
        const food = this.foodTarget;
        if (!food || food.eaten) return;
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));

        if (food.rainbow) {
            food.eaten = true;
            this.foodTarget = null;
            this.friendlyBoost = 8;
            this.speed = Math.min(110, this.speed * 1.12);
            if (Audio.rainbowChime) Audio.rainbowChime(pan);
            water.disturb(this.x, this.y, this.size * 1.1, 300);
            spawnSplash(this.x, this.y, this.size * 0.5, 0.7);
            return;
        }
        if (food.green) {
            food.eaten = true;
            this.foodTarget = null;
            this.turnToPlant();
            return;
        }
        if (food.golden) {
            food.eaten = true;
            this.foodTarget = null;
            this.turnToGold();
            return;
        }
        if (food.grower) {
            food.eaten = true;
            this.foodTarget = null;
            this.grow(CONFIG.growerBoost);
            this.speed = Math.min(100, this.speed * 1.08);
            Audio.fishNote({
                freq: 280,
                wave: "sine",
                pan,
                dur: 0.55,
                level: 0.14,
                partialAmt: 0.3,
                bright: 1.25,
            });
            water.disturb(this.x, this.y, this.size * 0.7, 220);
            spawnSplash(this.x, this.y, this.size * 0.35, 0.45);
            return;
        }
        if (food.pink) {
            // Breeding blush is for fish only; reptiles just snack on the pellet.
            food.eaten = true;
            this.foodTarget = null;
            this.grow(5);
            Audio.fishNote({
                freq: 300,
                wave: "sine",
                pan,
                dur: 0.4,
                level: 0.1,
                partialAmt: 0.25,
                bright: 1.15,
            });
            water.disturb(this.x, this.y, this.size * 0.5, 140);
            spawnSplash(this.x, this.y, this.size * 0.25, 0.3);
            return;
        }

        const chunk = Math.min((food.carcass ? 12 : 7), food.amount);
        food.amount -= chunk;
        food.biteCount++;
        this.biteTimer = food.biteInterval();
        this.grow(chunk * (food.carcass ? 0.5 : 0.18));
        water.disturb(food.x, food.y, food.radius() + 4, 120);
        Audio.fishNote({
            freq: 200 + (food.biteCount % 5) * 28,
            wave: "triangle",
            pan,
            dur: 0.35,
            level: 0.12,
            partialAmt: 0.15,
            bright: 0.9,
        });
        this.x += Math.cos(this.dir) * 3;
        this.y += Math.sin(this.dir) * 3;
        if (food.amount <= 0) {
            food.eaten = true;
            water.disturb(food.x, food.y, this.size * 0.5, 180);
            this.foodTarget = null;
        }
    }

    // Local snout zone matching draw(): forward along facing dir, not the body.
    hitSnout(wx, wy) {
        const L = this.size;
        const W = this.size * (this.kind === "alligator" ? 0.34 : 0.28);
        const dx = wx - this.x;
        const dy = wy - this.y;
        const c = Math.cos(this.dir);
        const s = Math.sin(this.dir);
        const lx = dx * c + dy * s;
        const ly = -dx * s + dy * c;
        if (this.kind === "alligator") {
            const cx = L * 0.38;
            const rx = L * 0.24;
            const ry = W * 0.9;
            const nx = (lx - cx) / rx;
            const ny = ly / ry;
            return nx * nx + ny * ny <= 1;
        }
        // Crocodile: long narrow snout from mid-head to tip.
        if (lx < L * 0.22 || lx > L * 0.68) return false;
        const t = Math.max(0, Math.min(1, (lx - L * 0.25) / (L * 0.37)));
        const halfW = W * (0.48 - 0.26 * t);
        return Math.abs(ly) <= halfW;
    }

    // Successful snout prod: count toward scare. Returns true if this click hit the snout.
    prodSnout(wx, wy) {
        if (this.dead || this.leaving || this.duelMode) return false;
        if (!this.hitSnout(wx, wy)) return false;

        if (this.snoutTapWindow <= 0) this.snoutTaps = 0;
        this.snoutTaps += 1;
        this.snoutTapWindow = REPTILE_SNOUT_TAP_WINDOW;

        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        const tipX = this.x + Math.cos(this.dir) * this.size * 0.48;
        const tipY = this.y + Math.sin(this.dir) * this.size * 0.48;
        const power = 0.35 + this.snoutTaps * 0.12;
        water.disturb(tipX, tipY, 12 + this.snoutTaps * 3, 90 + this.snoutTaps * 40);
        spawnSplash(tipX, tipY, 8 + this.snoutTaps * 2, power);
        if (Audio.tick) Audio.tick(pan, 420 + this.snoutTaps * 60);

        if (this.snoutTaps >= REPTILE_SNOUT_SCARE_TAPS) {
            this.startLeaving(wx, wy);
            Audio.predatorEat(pan);
            if (Audio.sharkRoll) Audio.sharkRoll(pan);
            water.disturb(this.x, this.y, this.size * 0.5, 320);
            spawnSplash(this.x, this.y, 20, 0.85);
        }
        return true;
    }

    startLeaving(fromX, fromY) {
        this.leaving = true;
        this.target = null;
        this.snoutTaps = 0;
        this.snoutTapWindow = 0;
        if (fromX != null && fromY != null) {
            this.dir = Math.atan2(this.y - fromY, this.x - fromX);
        } else {
            const toLeft = this.x, toRight = viewW - this.x;
            const toTop = this.y, toBottom = viewH - this.y;
            const m = Math.min(toLeft, toRight, toTop, toBottom);
            if (m === toLeft) this.dir = Math.PI;
            else if (m === toRight) this.dir = 0;
            else if (m === toTop) this.dir = -Math.PI / 2;
            else this.dir = Math.PI / 2;
        }
    }

    update(dt) {
        this.tailPhase += dt * (this.leaving ? 5.5 : (this.tamed ? 2.4 : 3.2));
        this.eatPulse -= dt;
        if (this.friendlyBoost > 0) this.friendlyBoost = Math.max(0, this.friendlyBoost - dt);
        if (this.petTimer > 0) this.petTimer = Math.max(0, this.petTimer - dt);
        if (this.snoutTapWindow > 0) {
            this.snoutTapWindow -= dt;
            if (this.snoutTapWindow <= 0) this.snoutTaps = 0;
        }

        // Continuous stroking helps tame (discrete pets remain the clear 30-pet target).
        if (this.petTimer > 0 && !this.tamed && !this.duelMode && !this.golden) {
            this.petProgress += dt;
            if (this.petCount >= CONFIG.petsToTame
                || this.petProgress >= CONFIG.reptileSootheTime) {
                this.tame();
            }
        }

        if (this.golden) {
            this.sinkTimer += dt;
            this.sinkDepth = Math.min(1, this.sinkTimer / CONFIG.goldSinkTime);
            if (this.sinkDepth < 1 && Math.random() < 0.08) {
                water.disturb(this.x, this.y, this.size * (1 - this.sinkDepth * 0.5), 40);
            }
            return;
        }

        // Scared: bolt off-screen, same idea as shark.leaving.
        if (this.leaving && !this.duelMode) {
            const spd = this.speed * 2.2;
            this.x += Math.cos(this.dir) * spd * dt;
            this.y += Math.sin(this.dir) * spd * dt;
            if (Math.random() < 0.55) {
                water.disturb(this.x - Math.cos(this.dir) * this.size * 0.35,
                              this.y - Math.sin(this.dir) * this.size * 0.35, 12, 70);
            }
            const m = this.size * 2;
            if (this.x < -m || this.x > viewW + m || this.y < -m || this.y > viewH + m) {
                this.dead = true;
            }
            return;
        }

        let desired = this.dir;
        let speed = this.speed * (this.tamed ? 0.42 : 0.55);

        // Finale: hunt the shark until both fall. Taming mid-duel is blocked.
        if (this.duelMode && shark && !shark.dead) {
            desired = Math.atan2(shark.y - this.y, shark.x - this.x);
            speed = this.speed * 1.2;
        } else if (this.tamed) {
            this.target = null;
            const foodChase = this.tryBiteFood(dt);
            if (foodChase) {
                desired = foodChase.desired;
                speed = foodChase.speed;
            } else {
                this.wanderTimer = (this.wanderTimer || 0) - dt;
                if (this.wanderTimer <= 0) {
                    this.wanderTimer = 1.8 + Math.random() * 2.4;
                    desired = this.dir + (Math.random() - 0.5) * 0.9;
                } else {
                    desired = this._wanderDir != null ? this._wanderDir : this.dir;
                }
                this._wanderDir = desired;
            }
        } else {
            if (!this.target || this.target.dead || this.target.golden
                || this.target.isRainbow || this.target.isMonster
                || this.target.size >= this.size) {
                this.target = null;
                let best = null, bd = CONFIG.huntRange * 1.5;
                for (const f of fishes) {
                    if (f.dead || f.golden || f.isRainbow || f.isMonster) continue;
                    if (f.size >= this.size) continue; // cannot eat bigger fish
                    const d = Math.hypot(f.x - this.x, f.y - this.y);
                    if (d < bd) { bd = d; best = f; }
                }
                this.target = best;
            }

            if (this.target) {
                desired = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                speed = this.speed;
                const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
                if (dist < this.size * 0.45 + this.target.size * 0.5 + 6) {
                    this.target.dead = true;
                    if (this.eatPulse <= 0) {
                        const pan = Math.max(-1, Math.min(1, (this.target.x / viewW) * 2 - 1));
                        Audio.predatorEat(pan);
                        this.eatPulse = 0.2;
                    }
                    water.disturb(this.target.x, this.target.y, 22, 260);
                    spawnSplash(this.target.x, this.target.y, 14, 0.6);
                    this.target = null;
                }
            } else {
                this.wanderTimer = (this.wanderTimer || 0) - dt;
                if (this.wanderTimer <= 0) {
                    this.wanderTimer = 1.5 + Math.random() * 2;
                    desired = this.dir + (Math.random() - 0.5) * 1.2;
                } else {
                    desired = this._wanderDir != null ? this._wanderDir : this.dir;
                }
                this._wanderDir = desired;
            }
        }

        const margin = 50;
        if (this.x < margin) desired = 0;
        else if (this.x > viewW - margin) desired = Math.PI;
        if (this.y < margin) desired = Math.PI / 2;
        else if (this.y > viewH - margin) desired = -Math.PI / 2;

        const turnRate = this.tamed ? 1.35 : 1.6;
        const diff = normAngle(desired - this.dir);
        this.dir += Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
        this.x += Math.cos(this.dir) * speed * dt;
        this.y += Math.sin(this.dir) * speed * dt;
        this.x = Math.max(8, Math.min(viewW - 8, this.x));
        this.y = Math.max(8, Math.min(viewH - 8, this.y));
        resolveObstacleOverlap(this, this.size * 0.32);

        if (Math.random() < (this.tamed ? 0.18 : 0.35)) {
            water.disturb(this.x - Math.cos(this.dir) * this.size * 0.4,
                          this.y - Math.sin(this.dir) * this.size * 0.4, 10, 45);
        }
    }

    draw(ctx) {
        const L = this.size;
        const W = this.size * (this.kind === "alligator" ? 0.34 : 0.28);
        const wig = Math.sin(this.tailPhase) * (this.tamed ? 0.18 : 0.3);
        const snout = this.kind === "alligator" ? 0.22 : 0.32; // croc longer/narrower
        const sink = this.golden ? (this.sinkDepth || 0) : 0;
        ctx.save();
        ctx.translate(this.x, this.y + sink * 6);
        ctx.rotate(this.dir);
        ctx.globalAlpha = 0.9 * (1 - sink * 0.25);
        if (this.tamed && !this.golden) {
            ctx.shadowColor = "rgba(70,120,100,0.28)";
            ctx.shadowBlur = 8;
        } else if (this.golden) {
            ctx.shadowColor = "rgba(255,200,80,0.55)";
            ctx.shadowBlur = 12;
        } else {
            ctx.shadowColor = "rgba(20,40,25,0.45)";
            ctx.shadowBlur = 14;
        }

        const rainbowing = this.friendlyBoost > 0 && !this.golden;
        const hue = rainbowing ? (performance.now() * 0.12) % 360 : 0;

        // Tail.
        let tailCol = this.tamed ? "#6a8f68" : "#3d5a38";
        if (this.golden) tailCol = "#c9a24b";
        else if (rainbowing) tailCol = `hsl(${(hue + 40) % 360}, 55%, 42%)`;
        ctx.fillStyle = tailCol;
        ctx.beginPath();
        ctx.moveTo(-L * 0.4, 0);
        ctx.lineTo(-L * 0.85, -W * 0.7 + wig * W);
        ctx.lineTo(-L * 0.7, 0);
        ctx.lineTo(-L * 0.85, W * 0.7 + wig * W);
        ctx.closePath();
        ctx.fill();

        // Body.
        const g = ctx.createLinearGradient(0, -W, 0, W);
        if (this.golden) {
            g.addColorStop(0, "#fff3b0");
            g.addColorStop(0.55, "#e0b030");
            g.addColorStop(1, "#a9791a");
        } else if (rainbowing) {
            g.addColorStop(0, `hsl(${hue}, 70%, 58%)`);
            g.addColorStop(0.55, `hsl(${(hue + 120) % 360}, 60%, 42%)`);
            g.addColorStop(1, `hsl(${(hue + 240) % 360}, 55%, 48%)`);
        } else if (this.tamed) {
            g.addColorStop(0, "#7a9e72");
            g.addColorStop(0.55, "#5a7d58");
            g.addColorStop(1, "#9bb88a");
        } else {
            g.addColorStop(0, "#4a6b42");
            g.addColorStop(0.55, "#2f4630");
            g.addColorStop(1, "#6f8a5a");
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, L * 0.42, W, 0, 0, Math.PI * 2);
        ctx.fill();

        // Snout.
        ctx.beginPath();
        if (this.kind === "alligator") {
            ctx.ellipse(L * 0.38, 0, L * snout, W * 0.85, 0, 0, Math.PI * 2);
        } else {
            ctx.moveTo(L * 0.25, -W * 0.45);
            ctx.lineTo(L * 0.62, -W * 0.22);
            ctx.lineTo(L * 0.62, W * 0.22);
            ctx.lineTo(L * 0.25, W * 0.45);
            ctx.closePath();
        }
        ctx.fill();

        // Ridge scutes.
        ctx.fillStyle = this.tamed || this.golden
            ? "rgba(50,80,55,0.28)"
            : "rgba(30,50,28,0.55)";
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.ellipse(i * L * 0.1, -W * 0.55, L * 0.04, L * 0.03, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Soft friendly wash once tamed (replaces the dark menace read).
        if (this.tamed && !this.golden && !rainbowing) {
            ctx.fillStyle = "rgba(90,150,130,0.18)";
            ctx.beginPath();
            ctx.ellipse(0, 0, L * 0.42, W, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Eye: closed while petted; soft calm iris when tamed; yellow menace when wild.
        ctx.shadowBlur = 0;
        const eyeX = L * 0.22;
        const eyeY = -W * 0.35;
        const eyeR = Math.max(1.5, L * 0.03);
        if (this.petTimer > 0 && !this.golden) {
            ctx.strokeStyle = this.tamed
                ? "rgba(30,50,40,0.85)"
                : "rgba(40,45,30,0.9)";
            ctx.lineWidth = Math.max(1.2, L * 0.04);
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.arc(eyeX, eyeY + eyeR * 0.15, eyeR * 1.15, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
        } else {
            ctx.fillStyle = this.golden ? "#8a6a18"
                : (this.tamed ? "#7ec4a8" : "#c8b020");
            ctx.beginPath();
            ctx.arc(eyeX, eyeY, eyeR, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = this.tamed && !this.golden ? "#1a3030" : "#111";
            ctx.beginPath();
            ctx.arc(eyeX, eyeY, Math.max(0.8, L * 0.015), 0, Math.PI * 2);
            ctx.fill();
        }
        drawCreatureHat(ctx, L, W, this.kind === "alligator" ? 0.15 : 0.55);
        ctx.restore();
    }
}

function beginPovAttack(fish) {
    if (pondFinaleActive()) return;
    povAttack = { fish, t: 0 };
    fish.petTimer = 0;
    fish.target = null;
    fish.prey = null;
    Audio.sharkStrike(0);
    Audio.predatorEat(0);
}

function beginGiantEnding(fish) {
    if (pondFinaleActive() || !fish || fish.dead || fish.giantEnded) return;
    fish.giantEnded = true;
    fish.target = null;
    fish.prey = null;
    fish.petTimer = 0;
    const peaceful = (fish.isHero || fish.redeemed) && !fish.isMonster && !fish.isPredator;
    const kind = peaceful ? "peace" : "shadow";
    giantEnding = { fish, t: 0, kind };
    const pan = Math.max(-1, Math.min(1, (fish.x / viewW) * 2 - 1));
    water.disturb(fish.x, fish.y, fish.size * 0.9, 360);
    spawnSplash(fish.x, fish.y, fish.size * 0.4, 0.55);
    if (kind === "peace") {
        fish.petTimer = 4;
        Audio.goldChime(pan);
        Audio.fishNote({
            freq: (fish.type.petFreq || 320) * 1.05,
            wave: "sine",
            pan,
            dur: 0.7,
            level: 0.11,
            partialAmt: 0.3,
            partialRatio: 2.4,
            bright: 1.25,
        });
        Audio.fishNote({
            freq: (fish.type.petFreq || 320) * 1.55,
            wave: "triangle",
            pan,
            dur: 0.55,
            level: 0.08,
            partialAmt: 0.22,
            bright: 1.35,
        });
    } else {
        Audio.predatorEat(pan);
        Audio.sharkStrike(pan);
    }
}

// Whale-meal hero finale: surge, center, close eyes, burst into one of every type.
function beginHeroRemorseEnding(fish) {
    if (heroRemorseEnding || whaleRemorseDone || povAttack || giantEnding
        || !fish || fish.dead) return;
    whaleRemorseDone = true;
    fish.giantEnded = true; // block the normal half-screen farewell
    fish.target = null;
    fish.prey = null;
    fish.isPredator = false;
    fish.isMonster = false;
    fish.isHero = true;
    heroRemorseEnding = { fish, t: 0, burst: false };
    const pan = Math.max(-1, Math.min(1, (fish.x / viewW) * 2 - 1));
    water.disturb(fish.x, fish.y, fish.size * 1.1, 480);
    spawnSplash(fish.x, fish.y, fish.size * 0.5, 0.7);
    Audio.goldChime(pan);
    Audio.whalePurr(pan);
    Audio.fishNote({
        freq: (fish.type.petFreq || 280) * 0.85,
        wave: "sine",
        pan,
        dur: 0.9,
        level: 0.1,
        partialAmt: 0.22,
        partialRatio: 2.1,
        bright: 0.95,
    });
}

function explodeHeroIntoSchool(hero) {
    if (!hero) return;
    const cx = hero.x;
    const cy = hero.y;
    const types = FISH_TYPES.concat(EXOTIC_TYPES);
    const n = types.length;
    hero.dead = true;
    hero.prey = null;
    hero.target = null;
    for (let i = 0; i < n; i++) {
        const baby = new Fish(types[i]);
        baby.isHero = true;
        baby.isPredator = false;
        baby.isMonster = false;
        baby.isRainbow = false;
        baby.redeemed = false;
        baby.isPink = false;
        baby.golden = false;
        baby.giantEnded = false;
        const ang = (i / n) * Math.PI * 2 + Math.random() * 0.12;
        const rad = 36 + (i % 5) * 14 + Math.random() * 28;
        baby.x = Math.max(24, Math.min(viewW - 24, cx + Math.cos(ang) * rad));
        baby.y = Math.max(24, Math.min(viewH - 24, cy + Math.sin(ang) * rad));
        baby.dir = ang + Math.PI * (0.65 + Math.random() * 0.3);
        fishes.push(baby);
    }
    water.disturb(cx, cy, 120, 720);
    spawnSplash(cx, cy, 48, 1.1);
    Audio.rainbowChime(0);
    Audio.goldChime(0);
    Audio.fishNote({
        freq: 360,
        wave: "triangle",
        pan: 0,
        dur: 0.65,
        level: 0.09,
        partialAmt: 0.28,
        bright: 1.2,
    });
    Audio.fishNote({
        freq: 480,
        wave: "sine",
        pan: 0.15,
        dur: 0.5,
        level: 0.07,
        partialAmt: 0.2,
        bright: 1.3,
    });
}

function updateHeroRemorseEnding(dt) {
    if (!heroRemorseEnding) return;
    heroRemorseEnding.t += dt;
    const f = heroRemorseEnding.fish;
    const t = heroRemorseEnding.t;
    const cx = viewW * 0.5;
    const cy = viewH * 0.5;
    const targetSize = Math.min(viewW, viewH) * CONFIG.giantCapFrac * 0.96;

    if (f && !f.dead && !heroRemorseEnding.burst) {
        // 1) Surge toward half-screen scale.
        if (t < 1.5) {
            f.size += (targetSize - f.size) * Math.min(1, dt * 2.1);
        }
        // 2) Swim to the middle of the pond.
        f.x += (cx - f.x) * Math.min(1, dt * 1.25);
        f.y += (cy - f.y) * Math.min(1, dt * 1.25);
        f.dir += dt * 0.4;
        f.tailPhase += dt * 3.2;
        // 3) Close eyes in remorse (pet-style lids, held).
        if (t >= 1.35) {
            f.petTimer = Math.max(f.petTimer, 1.6);
        }
        if (Math.random() < 0.14) {
            water.disturb(f.x, f.y, f.size * 0.4, 70);
        }
    }

    // 4) Explode into one of every fish and exotic type (all heroes).
    if (t >= 3.05 && !heroRemorseEnding.burst) {
        heroRemorseEnding.burst = true;
        if (f && !f.dead) explodeHeroIntoSchool(f);
        else explodeHeroIntoSchool({ x: cx, y: cy, dead: true });
    }

    // Brief ecosystem pause, then continue with the new hero school (no full reset).
    if (t >= 4.15) {
        heroRemorseEnding = null;
        if (whale && whale.dead) whale = null;
    }
}

function drawHeroRemorseEnding(ctx) {
    if (!heroRemorseEnding) return;
    const t = heroRemorseEnding.t;
    const f = heroRemorseEnding.fish;
    const glow = Math.min(1, t / 1.1);
    const burst = heroRemorseEnding.burst
        ? Math.min(1, (t - 3.05) / 0.55)
        : 0;
    const fade = t > 3.6 ? Math.min(1, (t - 3.6) / 0.55) : 0;

    ctx.save();
    const wash = ctx.createRadialGradient(
        viewW * 0.5, viewH * 0.5, Math.min(viewW, viewH) * 0.06,
        viewW * 0.5, viewH * 0.5, Math.max(viewW, viewH) * 0.72
    );
    wash.addColorStop(0, `rgba(170, 210, 235, ${0.07 + glow * 0.16})`);
    wash.addColorStop(0.5, `rgba(90, 130, 150, ${0.05 + glow * 0.1})`);
    wash.addColorStop(1, `rgba(18, 32, 42, ${0.08 + glow * 0.14})`);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, viewW, viewH);

    if (f && !f.dead && !heroRemorseEnding.burst) {
        ctx.save();
        ctx.globalAlpha = 0.3 + glow * 0.35;
        ctx.shadowColor = "rgba(140, 200, 230, 0.85)";
        ctx.shadowBlur = 30 + glow * 40;
        ctx.fillStyle = "rgba(150, 200, 230, 0.18)";
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, f.size * 0.8, f.size * 0.42, f.dir, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    if (burst > 0) {
        ctx.fillStyle = `rgba(210, 235, 250, ${burst * 0.55})`;
        ctx.fillRect(0, 0, viewW, viewH);
    }
    if (fade > 0) {
        ctx.fillStyle = `rgba(200, 225, 240, ${fade * 0.35})`;
        ctx.fillRect(0, 0, viewW, viewH);
    }
    ctx.restore();
}

function updateGiantEnding(dt) {
    if (!giantEnding) return;
    giantEnding.t += dt;
    const f = giantEnding.fish;
    const t = giantEnding.t;
    if (f && !f.dead) {
        const cx = viewW * 0.5;
        const cy = viewH * 0.5;
        if (giantEnding.kind === "peace") {
            if (t < 2.1) {
                f.x += (cx - f.x) * Math.min(1, dt * 1.1);
                f.y += (cy - f.y) * Math.min(1, dt * 1.1);
                f.dir += dt * 0.55;
                f.tailPhase += dt * 5;
                f.petTimer = Math.max(f.petTimer, 1.2);
                if (Math.random() < 0.12) {
                    water.disturb(f.x, f.y, f.size * 0.35, 50);
                }
            } else {
                if (f._giantExitDir === undefined) {
                    const toLeft = f.x, toRight = viewW - f.x;
                    const toTop = f.y, toBottom = viewH - f.y;
                    const m = Math.min(toLeft, toRight, toTop, toBottom);
                    if (m === toLeft) f._giantExitDir = Math.PI;
                    else if (m === toRight) f._giantExitDir = 0;
                    else if (m === toTop) f._giantExitDir = -Math.PI / 2;
                    else f._giantExitDir = Math.PI / 2;
                }
                const turn = 2.2 * dt;
                const diff = normAngle(f._giantExitDir - f.dir);
                f.dir += Math.max(-turn, Math.min(turn, diff));
                const glide = 55 + Math.min(90, (t - 2.1) * 40);
                f.x += Math.cos(f.dir) * glide * dt;
                f.y += Math.sin(f.dir) * glide * dt;
                f.tailPhase += dt * 7;
                if (Math.random() < 0.1) {
                    water.disturb(
                        f.x - Math.cos(f.dir) * f.size * 0.4,
                        f.y - Math.sin(f.dir) * f.size * 0.4,
                        8, 28
                    );
                }
            }
        } else {
            f.x += (cx - f.x) * Math.min(1, dt * 1.6);
            f.y += (cy - f.y) * Math.min(1, dt * 1.6);
            f.dir += dt * 1.4;
            f.tailPhase += dt * 8;
            if (Math.random() < 0.18) {
                water.disturb(f.x, f.y, f.size * 0.5, 90);
            }
        }
    }
    const doneAt = giantEnding.kind === "peace" ? 4.6 : 3.5;
    if (t >= doneAt) {
        resetPond();
    }
}

function drawGiantEnding(ctx) {
    if (!giantEnding) return;
    const t = giantEnding.t;
    const f = giantEnding.fish;
    const kind = giantEnding.kind;

    ctx.save();
    if (kind === "peace") {
        const glow = Math.min(1, t / 1.2);
        const fade = t > 3.8 ? Math.min(1, (t - 3.8) / 0.8) : 0;
        const wash = ctx.createRadialGradient(
            viewW * 0.5, viewH * 0.5, Math.min(viewW, viewH) * 0.08,
            viewW * 0.5, viewH * 0.5, Math.max(viewW, viewH) * 0.7
        );
        wash.addColorStop(0, `rgba(180, 220, 255, ${0.08 + glow * 0.18})`);
        wash.addColorStop(0.55, `rgba(120, 180, 210, ${0.04 + glow * 0.1})`);
        wash.addColorStop(1, `rgba(20, 40, 55, ${0.05 + glow * 0.12})`);
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, viewW, viewH);
        if (f && !f.dead) {
            ctx.save();
            ctx.globalAlpha = 0.35 + glow * 0.35;
            ctx.shadowColor = "rgba(140, 210, 255, 0.9)";
            ctx.shadowBlur = 28 + glow * 36;
            ctx.fillStyle = "rgba(160, 210, 255, 0.2)";
            ctx.beginPath();
            ctx.ellipse(f.x, f.y, f.size * 0.75, f.size * 0.4, f.dir, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        if (fade > 0) {
            ctx.fillStyle = `rgba(210, 230, 245, ${fade * 0.85})`;
            ctx.fillRect(0, 0, viewW, viewH);
        }
    } else {
        const zoom = Math.min(1, t / 2);
        const choke = t > 2.4 ? Math.min(1, (t - 2.4) / 0.9) : 0;
        ctx.fillStyle = `rgba(8, 4, 6, ${0.2 + zoom * 0.5})`;
        ctx.fillRect(0, 0, viewW, viewH);
        if (f && !f.dead) {
            const scale = 1 + zoom * 1.35;
            ctx.save();
            ctx.translate(f.x, f.y);
            ctx.scale(scale, scale);
            ctx.translate(-f.x, -f.y);
            ctx.globalAlpha = 0.55 + zoom * 0.35;
            ctx.shadowColor = "rgba(120, 10, 30, 0.9)";
            ctx.shadowBlur = 30 + zoom * 40;
            ctx.fillStyle = "rgba(60, 8, 18, 0.55)";
            ctx.beginPath();
            ctx.ellipse(f.x, f.y, f.size * 0.85, f.size * 0.45, f.dir, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        if (choke > 0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${choke})`;
            ctx.fillRect(0, 0, viewW, viewH);
            if (choke > 0.4) {
                ctx.fillStyle = `rgba(30, 0, 5, ${(choke - 0.4) * 1.4})`;
                ctx.fillRect(0, 0, viewW, viewH);
            }
        }
    }
    ctx.restore();
}

function updatePovAttack(dt) {
    if (!povAttack) return;
    povAttack.t += dt;
    const f = povAttack.fish;
    if (f) {
        // Drift toward screen center while "charging" the camera.
        f.x += (viewW * 0.5 - f.x) * Math.min(1, dt * 1.8);
        f.y += (viewH * 0.5 - f.y) * Math.min(1, dt * 1.8);
    }
    if (povAttack.t >= 3.4) {
        resetPond();
    }
}

function drawPovAttack(ctx) {
    if (!povAttack) return;
    const t = povAttack.t;
    const f = povAttack.fish;
    const zoom = Math.min(1, t / 2.2);
    const choke = t > 2.4 ? Math.min(1, (t - 2.4) / 0.7) : 0;

    // Darken the pond as the monster fills the view.
    ctx.save();
    ctx.fillStyle = `rgba(4, 6, 8, ${0.15 + zoom * 0.55})`;
    ctx.fillRect(0, 0, viewW, viewH);

    const cx = viewW * 0.5;
    const cy = viewH * 0.5;
    const scale = 0.4 + zoom * 3.8;
    const mouth = 0.15 + zoom * 0.55 + choke * 0.2;

    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 0.92;

    // Facing-camera head: dark oval with opening jaws.
    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 90);
    g.addColorStop(0, "#4a1828");
    g.addColorStop(0.6, "#1a0810");
    g.addColorStop(1, "#050308");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 70, 55, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes staring at the user.
    ctx.fillStyle = "#ff3030";
    ctx.shadowColor = "rgba(255,40,40,0.8)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.ellipse(-22, -12, 8, 5, -0.2, 0, Math.PI * 2);
    ctx.ellipse(22, -12, 8, 5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#120008";
    ctx.beginPath();
    ctx.ellipse(-22, -12, 3, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(22, -12, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mouth opening toward the camera.
    ctx.fillStyle = "#2a0508";
    ctx.beginPath();
    ctx.ellipse(0, 18, 40, 10 + mouth * 50, 0, 0, Math.PI * 2);
    ctx.fill();
    // Teeth.
    ctx.fillStyle = "#e8e0d0";
    for (let i = -4; i <= 4; i++) {
        const tx = i * 7;
        ctx.beginPath();
        ctx.moveTo(tx - 2.2, 18 - mouth * 20);
        ctx.lineTo(tx, 18 - mouth * 34);
        ctx.lineTo(tx + 2.2, 18 - mouth * 20);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(tx - 2.2, 18 + mouth * 18);
        ctx.lineTo(tx, 18 + mouth * 30);
        ctx.lineTo(tx + 2.2, 18 + mouth * 18);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();

    // Final bite flash.
    if (choke > 0) {
        ctx.fillStyle = `rgba(0,0,0,${choke})`;
        ctx.fillRect(0, 0, viewW, viewH);
        if (choke > 0.55) {
            ctx.fillStyle = `rgba(20,0,0,${(choke - 0.55) * 1.5})`;
            ctx.fillRect(0, 0, viewW, viewH);
        }
    }

    // Keep a faint species hint if we still have the fish reference.
    if (f && t < 1.2) {
        ctx.save();
        ctx.globalAlpha = 0.35 * (1 - t / 1.2);
        ctx.fillStyle = "#6a2038";
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function resetPond() {
    povAttack = null;
    giantEnding = null;
    heroRemorseEnding = null;
    apexDuel = null;
    shark = null;
    whale = null;
    reptiles.length = 0;
    frogGroups.length = 0;
    frogCheckTimer = 0;
    fishes.length = 0;
    foods.length = 0;
    rocks.length = 0;
    droplets.length = 0;
    rainbowScriptTrail.length = 0;
    grabbedObstacle = null;
    grabAim = null;
    cancelGoldLift();
    endMariachiFiesta();
    petStreak = 0;
    guaranteeRainbow = false;
    nextFoodVariant = null;
    repopulating = true;
    repopTimer = 0.5;
    // Soft surface settle.
    if (water) water.disturb(viewW * 0.5, viewH * 0.5, 80, 200);
}

class Shark {
    constructor(target) {
        this.size = CONFIG.sharkSize;
        this.tailPhase = 0;
        this.leaving = false;
        this.dead = false;
        this.duelMode = false;
        this.hp = 6;
        this.rollTimer = 0;
        this.rollDur = 1.15;
        // Enter from a random edge, off-screen.
        const side = Math.floor(Math.random() * 4);
        if (side === 0) { this.x = -this.size; this.y = Math.random() * viewH; }
        else if (side === 1) { this.x = viewW + this.size; this.y = Math.random() * viewH; }
        else if (side === 2) { this.x = Math.random() * viewW; this.y = -this.size; }
        else { this.x = Math.random() * viewW; this.y = viewH + this.size; }
        this.target = target;
        this.dir = target ? Math.atan2(target.y - this.y, target.x - this.x) : 0;
    }

    pet() {
        if (this.dead || this.leaving || this.rollTimer > 0) return;
        this.rollTimer = this.rollDur;
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        Audio.sharkRoll(pan);
        water.disturb(this.x, this.y, this.size * 0.55, 280);
        spawnSplash(this.x, this.y, 18, 0.7);
    }

    update(dt) {
        // Slow, gliding hunt: more pond visitor than chase cutscene.
        this.tailPhase += dt * (this.leaving ? 6 : 4.2);
        if (this.rollTimer > 0) this.rollTimer = Math.max(0, this.rollTimer - dt);

        if (this.leaving && !this.duelMode) {
            this.x += Math.cos(this.dir) * 120 * dt;
            this.y += Math.sin(this.dir) * 120 * dt;
            const m = this.size * 2;
            if (this.x < -m || this.x > viewW + m || this.y < -m || this.y > viewH + m) {
                this.dead = true;
            }
            return;
        }

        if (this.duelMode) {
            const foe = reptiles.find((x) => !x.dead);
            if (!foe) return;
            this.target = foe;
            this.leaving = false;
        } else if (!this.target || this.target.dead) {
            this.target = nearestFish(this.x, this.y);
            if (!this.target) { this.startLeaving(); return; }
        }

        let desired = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        const avoid = obstacleAvoidDir(this.x, this.y, this.size * 0.35);
        if (avoid != null && this.rollTimer <= 0 && !this.duelMode) desired = avoid;
        const diff = normAngle(desired - this.dir);
        this.dir += Math.max(-1.4 * dt, Math.min(1.4 * dt, diff));
        const spd = this.duelMode
            ? (this.rollTimer > 0 ? 145 : 110)
            : (this.rollTimer > 0 ? 130 : 95);
        this.x += Math.cos(this.dir) * spd * dt;
        this.y += Math.sin(this.dir) * spd * dt;
        resolveObstacleOverlap(this, this.size * 0.32);

        // Duel bites are resolved in updateApexDuel so both fall together.
        if (!this.duelMode && this.rollTimer <= 0) {
            const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
            if (dist < this.size * 0.5 + this.target.size * 0.5 + 8) this.eat(this.target);
        }

        // Soft trailing wake.
        if (Math.random() < (this.rollTimer > 0 ? 0.7 : 0.35)) {
            water.disturb(this.x - Math.cos(this.dir) * this.size * 0.5,
                          this.y - Math.sin(this.dir) * this.size * 0.5, 10, 40);
        }
    }

    eat(fish) {
        // Apex fish cannot be eaten by the shark; they eat the shark instead.
        if (fish.isRainbow || fish.isMonster) return;
        // Larger heroes (or any larger fish) shrug the bite off.
        if (fish.size > this.size) return;
        fish.dead = true;
        const pan = Math.max(-1, Math.min(1, (fish.x / viewW) * 2 - 1));
        Audio.sharkStrike(pan);
        water.disturb(fish.x, fish.y, this.size * 0.6, 720);
        spawnSplash(fish.x, fish.y, 26, 1);
        if (fishes.filter((f) => !f.dead).length === 0) this.startLeaving();
        else this.target = null;
    }

    startLeaving() {
        this.leaving = true;
        const toLeft = this.x, toRight = viewW - this.x, toTop = this.y, toBottom = viewH - this.y;
        const m = Math.min(toLeft, toRight, toTop, toBottom);
        if (m === toLeft) this.dir = Math.PI;
        else if (m === toRight) this.dir = 0;
        else if (m === toTop) this.dir = -Math.PI / 2;
        else this.dir = Math.PI / 2;
    }

    draw(ctx) {
        const L = this.size;
        const W = this.size * 0.38;
        const wig = Math.sin(this.tailPhase) * 0.35;
        const rollT = this.rollTimer > 0 ? 1 - this.rollTimer / this.rollDur : 0;
        const roll = rollT * Math.PI * 2;
        const flatten = Math.max(0.18, Math.abs(Math.cos(roll)));
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.dir);
        ctx.scale(1, flatten);
        ctx.globalAlpha = 0.88;
        ctx.shadowColor = "rgba(20,40,35,0.4)";
        ctx.shadowBlur = 18;

        // Soft crescent tail.
        ctx.fillStyle = "#3a4a46";
        ctx.beginPath();
        ctx.moveTo(-L * 0.48, 0);
        ctx.lineTo(-L * 0.78, -W * 0.75 + wig * W);
        ctx.lineTo(-L * 0.64, 0);
        ctx.lineTo(-L * 0.78, W * 0.75 + wig * W);
        ctx.closePath();
        ctx.fill();

        // Mossy teal body that matches the pond.
        const bellyUp = Math.cos(roll) < 0;
        const g = ctx.createLinearGradient(0, -W, 0, W);
        if (bellyUp) {
            g.addColorStop(0, "#7a9088");
            g.addColorStop(0.55, "#314842");
            g.addColorStop(1, "#4a635c");
        } else {
            g.addColorStop(0, "#4a635c");
            g.addColorStop(0.55, "#314842");
            g.addColorStop(1, "#7a9088");
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, L * 0.48, W, 0, 0, Math.PI * 2);
        ctx.fill();
        // Rounded snout (less harsh than a hard point).
        ctx.beginPath();
        ctx.ellipse(L * 0.42, 0, L * 0.2, W * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();

        // Low dorsal ridge.
        ctx.beginPath();
        ctx.moveTo(0, -W * 0.65);
        ctx.lineTo(-L * 0.1, -W * 1.35);
        ctx.lineTo(-L * 0.22, -W * 0.65);
        ctx.closePath();
        ctx.fill();
        // Soft pectoral.
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(L * 0.04, W * 0.45);
        ctx.lineTo(-L * 0.1, W * 1.05);
        ctx.lineTo(-L * 0.16, W * 0.45);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = 0.88;
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(20,30,28,0.9)";
        ctx.beginPath();
        ctx.arc(L * 0.3, -W * 0.18, Math.max(1.4, L * 0.035), 0, Math.PI * 2);
        ctx.fill();
        drawCreatureHat(ctx, L, W, 0.82);
        ctx.restore();
    }
}

// A rare visitor: a whale that sweeps the pond clean, then leaves so life returns.
class Whale {
    constructor() {
        this.size = Math.max(140, Math.min(viewW, viewH) * 0.28);
        this.tailPhase = 0;
        this.dead = false;
        this.eatPulse = 0;
        this.ateFish = false; // set when this whale swallows any fish
        this.petTimer = 0;
        this.petDur = 2.6;
        // Enter from left or right, swim across.
        this.fromLeft = Math.random() < 0.5;
        this.x = this.fromLeft ? -this.size : viewW + this.size;
        this.y = viewH * (0.35 + Math.random() * 0.3);
        this.dir = this.fromLeft ? 0 : Math.PI;
        this.speed = 58;
        this.age = 0;
        Audio.whaleCall(this.fromLeft ? -0.4 : 0.4);
        water.disturb(this.x, this.y, this.size * 0.35, 320);
    }

    pet() {
        if (this.dead) return;
        if (this.petTimer > this.petDur * 0.45) {
            this.petTimer = this.petDur;
            return;
        }
        this.petTimer = this.petDur;
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        Audio.whalePurr(pan);
        water.disturb(this.x, this.y, this.size * 0.45, 420);
        spawnSplash(this.x, this.y - this.size * 0.15, 22, 0.85);
    }

    update(dt) {
        this.age += dt;
        this.tailPhase += dt * 2.6;
        this.eatPulse -= dt;
        if (this.petTimer > 0) this.petTimer = Math.max(0, this.petTimer - dt);

        const petT = this.petTimer > 0 ? 1 - this.petTimer / this.petDur : 0;
        const spd = this.petTimer > 0 ? this.speed * (0.35 + 0.4 * Math.sin(petT * Math.PI)) : this.speed;
        this.x += Math.cos(this.dir) * spd * dt;
        // Slow, buoyant drift; pet adds a gentle breech arc.
        let bob = Math.sin(this.tailPhase * 0.28) * 10;
        if (this.petTimer > 0) bob += Math.sin(petT * Math.PI) * 28;
        this.y += bob * dt;

        // Swallow fish only when not mid pet animation.
        if (this.petTimer <= 0) {
            const mouth = this.size * 0.5;
            for (const f of fishes) {
                if (f.dead) continue;
                // Heroes large enough to hunt this whale are not swallowed.
                if (f.isHero && heroCanHuntWhale(f)) continue;
                if (Math.hypot(f.x - this.x, f.y - this.y) < mouth) {
                    f.dead = true;
                    this.ateFish = true;
                    if (this.eatPulse <= 0) {
                        const pan = Math.max(-1, Math.min(1, (f.x / viewW) * 2 - 1));
                        Audio.predatorEat(pan);
                        this.eatPulse = 0.18;
                    }
                    water.disturb(f.x, f.y, 16, 140);
                }
            }
        } else if (Math.random() < 0.25) {
            water.disturb(this.x, this.y - 8, 12, 60);
        }

        // Soft rolling wake.
        if (Math.random() < 0.4) {
            water.disturb(this.x - Math.cos(this.dir) * this.size * 0.35,
                          this.y, 14, 50);
        }

        const m = this.size * 1.2;
        if (this.x < -m || this.x > viewW + m) this.dead = true;
    }

    draw(ctx) {
        const L = this.size;
        const W = this.size * 0.3;
        const wig = Math.sin(this.tailPhase) * 0.28;
        const petT = this.petTimer > 0 ? 1 - this.petTimer / this.petDur : 0;
        const breech = this.petTimer > 0 ? Math.sin(petT * Math.PI) : 0;
        const roll = breech * 0.55;
        ctx.save();
        ctx.translate(this.x, this.y - breech * 18);
        ctx.rotate(this.dir);
        ctx.rotate(roll);
        ctx.scale(1, Math.max(0.55, 1 - breech * 0.35));
        ctx.globalAlpha = 0.86;
        ctx.shadowColor = "rgba(30,55,50,0.4)";
        ctx.shadowBlur = 24 + breech * 16;

        // Soft fluke.
        ctx.fillStyle = "#4a655c";
        ctx.beginPath();
        ctx.moveTo(-L * 0.46, 0);
        ctx.lineTo(-L * 0.74, -W * 0.95 + wig * W);
        ctx.lineTo(-L * 0.6, 0);
        ctx.lineTo(-L * 0.74, W * 0.95 + wig * W);
        ctx.closePath();
        ctx.fill();

        // Pond-teal body with a pale belly.
        const g = ctx.createLinearGradient(0, -W, 0, W);
        g.addColorStop(0, "#5f8478");
        g.addColorStop(0.55, "#3f5c54");
        g.addColorStop(1, "#b7cfc4");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, L * 0.46, W, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rounded snout.
        ctx.beginPath();
        ctx.ellipse(L * 0.4, 0, L * 0.17, W * 0.68, 0, 0, Math.PI * 2);
        ctx.fill();

        // Tiny dorsal ridge.
        ctx.beginPath();
        ctx.moveTo(-L * 0.04, -W * 0.8);
        ctx.lineTo(-L * 0.14, -W * 1.15);
        ctx.lineTo(-L * 0.26, -W * 0.8);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
        // Closed happy eye while petted; open otherwise.
        if (this.petTimer > 0) {
            ctx.strokeStyle = "rgba(25,40,35,0.85)";
            ctx.lineWidth = Math.max(1.5, L * 0.012);
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(L * 0.22, -W * 0.2);
            ctx.quadraticCurveTo(L * 0.26, -W * 0.08, L * 0.3, -W * 0.2);
            ctx.stroke();
        } else {
            ctx.fillStyle = "rgba(25,40,35,0.85)";
            ctx.beginPath();
            ctx.arc(L * 0.26, -W * 0.22, Math.max(2, L * 0.022), 0, Math.PI * 2);
            ctx.fill();
        }
        // Soft breath marks; stronger spout while petted.
        if (breech > 0.35 || Math.sin(this.age * 1.3) > 0.85) {
            const puff = 0.25 + breech * 0.45;
            ctx.fillStyle = `rgba(190,220,210,${puff})`;
            ctx.beginPath();
            ctx.ellipse(-L * 0.05, -W * (1.1 + breech * 0.8), L * (0.03 + breech * 0.04), L * (0.05 + breech * 0.08), 0, 0, Math.PI * 2);
            ctx.fill();
            if (breech > 0.4) {
                ctx.beginPath();
                ctx.ellipse(-L * 0.02, -W * (1.55 + breech), L * 0.05, L * 0.09, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        drawCreatureHat(ctx, L, W, 0.05);
        ctx.restore();
    }
}

// Create a fish at a random bank, swimming inward (for repopulation).
function edgeFish(forceExotic) {
    let type;
    if (forceExotic || Math.random() < CONFIG.exoticEdgeChance) {
        type = EXOTIC_TYPES[Math.floor(Math.random() * EXOTIC_TYPES.length)];
    } else {
        type = FISH_TYPES[Math.floor(Math.random() * FISH_TYPES.length)];
    }
    const f = new Fish(type);
    const side = Math.floor(Math.random() * 4);
    if (side === 0) { f.x = -20; f.y = Math.random() * viewH; f.dir = 0; }
    else if (side === 1) { f.x = viewW + 20; f.y = Math.random() * viewH; f.dir = Math.PI; }
    else if (side === 2) { f.x = Math.random() * viewW; f.y = -20; f.dir = Math.PI / 2; }
    else { f.x = Math.random() * viewW; f.y = viewH + 20; f.dir = -Math.PI / 2; }
    return f;
}

function manageEcosystem(dt) {
    if (povAttack) {
        updatePovAttack(dt);
        return;
    }
    if (giantEnding) {
        updateGiantEnding(dt);
        return;
    }
    if (heroRemorseEnding) {
        updateHeroRemorseEnding(dt);
        return;
    }

    // Golden fish rest on the lakebed until refresh; they are not active swimmers.
    const alive = fishes.filter((f) => !f.dead);
    const swimmers = alive.filter((f) => !f.golden && !f.rainbowLeaving);
    const rainbowExiting = alive.some((f) => f.isRainbow && f.rainbowLeaving)
        || rainbowScriptTrail.length > 0;
    const hasMonster = alive.some((f) => f.isMonster);

    // Rare whale visit: every whaleInterval seconds, a rainbow-tier roll.
    whaleCheckTimer += dt;
    if (whaleCheckTimer >= CONFIG.whaleInterval) {
        whaleCheckTimer = 0;
        if (!whale && !shark && !repopulating && !rainbowExiting && !pondFinaleActive()
            && swimmers.length > 0 && Math.random() < CONFIG.whaleChance) {
            whale = new Whale();
        }
    }

    // Medium-rare exotic visitors: odd swimmers, more often than crocs.
    exoticCheckTimer += dt;
    if (exoticCheckTimer >= CONFIG.exoticInterval) {
        exoticCheckTimer = 0;
        const exoticCount = swimmers.filter((f) => f.type && f.type.exotic).length;
        if (!whale && !shark && !repopulating && !rainbowExiting && !pondFinaleActive()
            && swimmers.length > 0 && exoticCount < 3
            && Math.random() < CONFIG.exoticChance) {
            fishes.push(edgeFish(true));
        }
    }

    // Rare crocodile / alligator: chance checked once per minute.
    reptileCheckTimer += dt;
    if (reptileCheckTimer >= CONFIG.reptileInterval) {
        reptileCheckTimer = 0;
        if (!whale && !shark && !repopulating && !pondFinaleActive() && !apexDuel
            && reptiles.length === 0 && swimmers.length > 2
            && Math.random() < CONFIG.reptileChance) {
            reptiles.push(new Reptile());
        }
    }

    // Background frogs along the lower bank with tadpole clusters.
    frogCheckTimer += dt;
    if (frogCheckTimer >= CONFIG.frogInterval) {
        frogCheckTimer = 0;
        if (scenery.frogs && !pondFinaleActive()
            && frogGroups.length < CONFIG.frogMaxGroups
            && Math.random() < CONFIG.frogChance) {
            spawnFrogGroup();
        }
    }
    updateFrogGroups(dt);

    for (const r of reptiles) r.update(dt);
    for (let i = reptiles.length - 1; i >= 0; i--) {
        if (reptiles[i].dead) reptiles.splice(i, 1);
    }

    if (whale) {
        whale.update(dt);
        if (whale.dead) {
            whale = null;
            if (fishes.filter((f) => !f.dead).length === 0 && !apexDuel) {
                repopulating = true;
                repopTimer = 0.8;
            }
        }
    }

    const livingReptiles = reptiles.filter((r) => !r.dead && !r.leaving && !r.tamed && !r.golden);
    // Wild croc/alligator cleared the pond: summon the shark for a fight to the death.
    if (!apexDuel && !pondFinaleActive() && !whale && !rainbowExiting
        && livingReptiles.length > 0 && swimmers.length === 0) {
        beginApexDuel();
    }
    if (apexDuel) updateApexDuel(dt);

    if (shark) {
        shark.update(dt);
        if (shark.dead && !apexDuel) {
            shark = null;
            if (!rainbowExiting && !hasMonster && alive.filter((f) => !f.golden).length === 0
                && livingReptiles.length === 0) {
                repopulating = true;
                repopTimer = 0.8;
            }
        }
    } else if (!whale && !repopulating && !rainbowExiting && !pondFinaleActive() && !apexDuel
        && swimmers.length === 1 && alive.filter((f) => !f.golden).length === 1) {
        // Last swimmer remaining (rainbow or monster included): summon the shark.
        shark = new Shark(swimmers[0]);
    } else if (!repopulating && !shark && !whale && !pondFinaleActive() && !apexDuel && !rainbowExiting
        && swimmers.length === 0 && livingReptiles.length === 0) {
        // Restock when no swimmers remain (golden resting fish do not block this).
        repopulating = true;
        repopTimer = 0.8;
    }

    if (repopulating && !apexDuel) {
        repopTimer -= dt;
        if (repopTimer <= 0 && fishes.length < CONFIG.fishCount) {
            fishes.push(edgeFish());
            repopTimer = CONFIG.repopInterval;
        }
        if (fishes.length >= CONFIG.fishCount) repopulating = false;
    }
}

// ===========================================================================
// WINDOW-MODE RIPPLES (rain on glass): concentric rings + downward trickle
// ===========================================================================
const ripples = [];

class Ripple {
    constructor(x, y, velocity, baseFreq) {
        this.x = x; this.y = y;
        this.v = velocity;
        this.baseFreq = baseFreq;
        this.decay = velocityToDecay(velocity);
        this.maxR = velocityToRadius(velocity);
        this.rings = velocityToRings(velocity);
        this.age = 0;
        this.dead = false;
        this.trail = velocity > 0.15
            ? { y: y, len: 0, vy: 40 + velocity * 120, alpha: 0.35 }
            : null;
    }
    amplitude() { return Math.exp(-this.decay * this.age); }
    radiusAt(ringIndex) {
        const phase = ringIndex * 0.12;
        const local = Math.max(0, this.age - phase);
        const ease = 1 - Math.pow(1 - Math.min(1, local * 1.4), 3);
        return CONFIG.baseRadius + (this.maxR - CONFIG.baseRadius) * ease;
    }
    update(dt) {
        this.age += dt;
        if (this.amplitude() < 0.02) this.dead = true;
        if (this.trail) {
            this.trail.y += this.trail.vy * dt;
            this.trail.len = Math.min(160, this.trail.len + this.trail.vy * dt);
            this.trail.alpha *= Math.exp(-1.2 * dt);
        }
    }
    draw(ctx) {
        const amp = this.amplitude();
        if (amp <= 0) return;
        if (this.trail && this.trail.alpha > 0.01) {
            const grad = ctx.createLinearGradient(
                this.x, this.trail.y - this.trail.len, this.x, this.trail.y
            );
            grad.addColorStop(0, "rgba(180,210,255,0)");
            grad.addColorStop(1, `rgba(180,210,255,${this.trail.alpha * 0.5})`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(this.x, this.trail.y - this.trail.len);
            ctx.lineTo(this.x, this.trail.y);
            ctx.stroke();
        }
        ctx.save();
        ctx.shadowColor = "rgba(150,200,255,0.55)";
        ctx.shadowBlur = 12;
        for (let i = 0; i < this.rings; i++) {
            const r = this.radiusAt(i);
            if (r <= 0) continue;
            const ringAmp = amp * (1 - i / (this.rings + 1));
            ctx.strokeStyle = `rgba(190,222,255,${Math.max(0, ringAmp * 0.8)})`;
            ctx.lineWidth = Math.max(0.4, ringAmp * 2.2);
            ctx.beginPath();
            ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }
}

function drawInterference(ctx) {
    const live = ripples.filter((r) => !r.dead && r.amplitude() > 0.1);
    for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
            const a = live[i], b = live[j];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            const ra = a.radiusAt(0), rb = b.radiusAt(0);
            if (d > Math.abs(ra - rb) && d < ra + rb) {
                const t = (d * d - rb * rb + ra * ra) / (2 * d);
                const px = a.x + (t * (b.x - a.x)) / d;
                const py = a.y + (t * (b.y - a.y)) / d;
                const glow = Math.min(a.amplitude(), b.amplitude());
                ctx.fillStyle = `rgba(210,235,255,${glow * 0.5})`;
                ctx.beginPath();
                ctx.arc(px, py, 1.6, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

function spawnWindowRipple(x, y, v) {
    const freq = sound(x, y, v, false);
    ripples.push(new Ripple(x, y, v, freq));
    if (ripples.filter((r) => !r.dead).length > CONFIG.maxVoices) {
        const live = ripples.filter((r) => !r.dead);
        live[0].decay = Math.max(live[0].decay, 4.0);
    }
}

// ===========================================================================
// INPUT: hold to grow the ball, drag to sling it across the water
// The longer you hold, the bigger the food (and, by the shared physics, the
// deeper the splash and the lower the impact tone). Pen pressure, if present,
// gives an extra initial size.
// ===========================================================================
let pointerDownAt = null;
let pointerNow = null;

// Net mode: right-click sweeps floating food out of the pond.
let netMode = false;
let netSweeping = false;
const NET_RADIUS = 44;

// Pellets scooped by the net are saved here for later redeploy.
// Normal food also accrues a bank (can exceed visible slot cap) for market trades.
const FOOD_STASH_KEY = "ripple-food-stash";
const foodStash = [];
let normalFoodBank = 0;
let armedStashIndex = null;

const STASH_SWATCH = {
    normal: { from: "#c4a06a", mid: "#8a6531", to: "#5c4321", label: "Fish food" },
    rainbow: { from: "#ff9ad8", mid: "#6ec8ff", to: "#b48cff", label: "Rainbow food" },
    golden: { from: "#fff3b0", mid: "#f0c437", to: "#a9791a", label: "Golden food" },
    green: { from: "#c8f5b0", mid: "#5db84a", to: "#2a6b2e", label: "Green food" },
    grower: { from: "#ffe0f0", mid: "#ff6fa0", to: "#b03060", label: "Grower food" },
    pink: { from: "#ffe8f4", mid: "#ff7eb6", to: "#d63a7a", label: "Breeding food" },
    carcass: { from: "#d07060", mid: "#8a3030", to: "#4a1818", label: "Carcass" },
};

function loadFoodStash() {
    foodStash.length = 0;
    normalFoodBank = 0;
    try {
        const raw = localStorage.getItem(FOOD_STASH_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        let items = parsed;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            items = parsed.items;
            if (typeof parsed.normalBank === "number" && parsed.normalBank >= 0) {
                normalFoodBank = Math.floor(parsed.normalBank);
            }
        }
        if (!Array.isArray(items)) return;
        for (const item of items) {
            if (typeof item === "string" && STASH_SWATCH[item]) foodStash.push(item);
            else if (item && typeof item.variant === "string" && STASH_SWATCH[item.variant]) {
                foodStash.push(item.variant);
            }
            if (foodStash.length >= CONFIG.foodStashMax) break;
        }
        // Older saves: infer bank from visible normal pellets if unset.
        if (!parsed || Array.isArray(parsed) || typeof parsed.normalBank !== "number") {
            normalFoodBank = countStashVariant("normal");
        }
    } catch (err) {
        // Ignore corrupt stash data.
    }
}

function saveFoodStash() {
    try {
        localStorage.setItem(FOOD_STASH_KEY, JSON.stringify({
            items: foodStash.slice(0, CONFIG.foodStashMax),
            normalBank: normalFoodBank,
        }));
    } catch (err) {
        // Private mode / quota: stash still works for this session.
    }
}

function stashFood(variant) {
    const key = normalizeFoodVariant(variant);
    if (!key || !STASH_SWATCH[key]) return false;
    if (foodStash.length >= CONFIG.foodStashMax) foodStash.shift();
    foodStash.push(key);
    if (key === "normal") normalFoodBank++;
    saveFoodStash();
    renderFoodStashUI();
    updateMarketUI();
    return true;
}

function countStashVariant(variant) {
    const key = normalizeFoodVariant(variant);
    let n = 0;
    for (const item of foodStash) {
        if (item === key) n++;
    }
    return n;
}

function availableNormalFood() {
    return Math.max(normalFoodBank, countStashVariant("normal"));
}

function flagsFromStashVariant(variant) {
    const v = normalizeFoodVariant(variant);
    return {
        rainbow: v === "rainbow",
        golden: v === "golden",
        green: v === "green",
        grower: v === "grower",
        pink: v === "pink",
        carcass: v === "carcass",
    };
}

function placeStashedFood(x, y, variant) {
    const flags = flagsFromStashVariant(variant);
    while (foods.length >= CONFIG.maxFoods) {
        const common = foods.findIndex((f) => !isRareFoodFlags(f));
        if (common >= 0) foods.splice(common, 1);
        else foods.shift();
    }
    const size = 10 + Math.random() * 8;
    const ox = (Math.random() - 0.5) * 18;
    const oy = (Math.random() - 0.5) * 18;
    const fx = Math.max(20, Math.min(viewW - 20, x + ox));
    const fy = Math.max(20, Math.min(viewH - 20, y + oy));
    foods.push(new Food(fx, fy, size, flags));
    water.disturb(fx, fy, size * 0.8, 90);
    spawnSplash(fx, fy, size * 0.35, 0.35);
    if (typeof Audio !== "undefined" && Audio.ensure) {
        Audio.ensure();
        if (Audio.playDrop) {
            Audio.playDrop({ freq: 340, decay: 0.85, velocity: 0.28, pan: 0, plunk: false });
        }
    }
    markFirstInteraction();
}

function armStashSlot(index) {
    if (index < 0 || index >= foodStash.length) {
        armedStashIndex = null;
        renderFoodStashUI();
        return;
    }
    armedStashIndex = (armedStashIndex === index) ? null : index;
    renderFoodStashUI();
}

function placeArmedStashAt(x, y) {
    // Typed force (pink/breed/etc.) wins: drop that variant and keep the armed stash slot.
    if (nextFoodVariant) {
        const forced = consumeNextFoodVariant();
        placeStashedFood(x, y, forced);
        return true;
    }
    if (armedStashIndex == null || armedStashIndex < 0 || armedStashIndex >= foodStash.length) {
        armedStashIndex = null;
        return false;
    }
    const variant = foodStash[armedStashIndex];
    foodStash.splice(armedStashIndex, 1);
    armedStashIndex = null;
    if (variant === "normal") normalFoodBank = Math.max(0, normalFoodBank - 1);
    saveFoodStash();
    placeStashedFood(x, y, variant);
    renderFoodStashUI();
    updateMarketUI();
    return true;
}

function renderFoodStashUI() {
    const el = document.getElementById("food-stash");
    if (!el) return;
    el.innerHTML = "";
    if (!foodStash.length) {
        el.classList.remove("has-items", "armed");
        el.setAttribute("aria-hidden", "true");
        return;
    }
    el.classList.add("has-items");
    el.setAttribute("aria-hidden", "false");
    el.classList.toggle("armed", armedStashIndex != null);
    foodStash.forEach((variant, i) => {
        const sw = STASH_SWATCH[variant] || STASH_SWATCH.normal;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "stash-slot"
            + (variant === "normal" ? " stash-normal" : "")
            + (armedStashIndex === i ? " armed" : "");
        btn.title = armedStashIndex === i
            ? "Click the pond to drop this food"
            : (sw.label + ": click, then click the pond to drop");
        btn.setAttribute("aria-label", btn.title);
        btn.setAttribute("aria-pressed", armedStashIndex === i ? "true" : "false");
        btn.style.setProperty("--stash-from", sw.from);
        btn.style.setProperty("--stash-mid", sw.mid);
        btn.style.setProperty("--stash-to", sw.to);
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            armStashSlot(i);
        });
        el.appendChild(btn);
    });
}

loadFoodStash();
renderFoodStashUI();

function sweepFoodNear(x, y) {
    let scooped = 0;
    let stashed = 0;
    for (const f of foods) {
        if (f.eaten || f.sinkProgress > 0.85) continue;
        const reach = NET_RADIUS + f.radius();
        if (Math.hypot(f.x - x, f.y - y) > reach) continue;
        const variant = foodVariantKey(f);
        if (variant && stashFood(variant)) stashed++;
        f.eaten = true;
        scooped++;
        water.disturb(f.x, f.y, Math.max(4, f.size * 0.45), 55);
        if (scooped <= 4) spawnSplash(f.x, f.y, 3 + f.size * 0.15, 0.28);
    }
    if (scooped) markFirstInteraction();
    if (stashed && typeof Audio !== "undefined" && Audio.ensure) {
        Audio.ensure();
        if (Audio.playDrop) {
            Audio.playDrop({ freq: 420, decay: 0.7, velocity: 0.22, pan: 0, plunk: false });
        }
    }
    return scooped;
}

function drawNetCursor(ctx) {
    if (!netMode || mode !== "pond" || !pointerNow) return;
    const x = pointerNow.x;
    const y = pointerNow.y;
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.04;
    const r = NET_RADIUS * pulse;
    ctx.save();
    ctx.globalAlpha = netSweeping ? 0.55 : 0.28;
    ctx.strokeStyle = netSweeping ? "rgba(210, 230, 210, 0.9)" : "rgba(180, 210, 200, 0.75)";
    ctx.lineWidth = netSweeping ? 2.2 : 1.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    // Mesh lines.
    ctx.globalAlpha = netSweeping ? 0.28 : 0.14;
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
        const ox = i * r * 0.28;
        ctx.beginPath();
        ctx.moveTo(x + ox, y - Math.sqrt(Math.max(0, r * r - ox * ox)));
        ctx.lineTo(x + ox, y + Math.sqrt(Math.max(0, r * r - ox * ox)));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - Math.sqrt(Math.max(0, r * r - ox * ox)), y + ox);
        ctx.lineTo(x + Math.sqrt(Math.max(0, r * r - ox * ox)), y + ox);
        ctx.stroke();
    }
    // Short handle.
    ctx.globalAlpha = netSweeping ? 0.5 : 0.25;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + r * 0.72, y - r * 0.72);
    ctx.lineTo(x + r * 1.15, y - r * 1.15);
    ctx.stroke();
    ctx.restore();
}
let firstInteractionDone = false;

// Normalized size in [0,1] from how long the button has been held.
function chargeFromHold(heldSec, ev) {
    let v = CONFIG.minCharge + heldSec / CONFIG.holdGrowTime;
    if (ev && typeof ev.pressure === "number" && ev.pressure > 0 && ev.pressure < 1) {
        v = Math.max(v, ev.pressure);
    }
    return clamp01(v);
}

function goldenFishAt(x, y) {
    let best = null, bd = 42;
    for (const f of fishes) {
        if (!f.golden || f.dead || f.lifting) continue;
        // Only settled gold can be lifted out of the pond.
        if ((f.sinkDepth || 0) < 0.85) continue;
        const d = Math.hypot(x - f.x, y - f.y);
        const reach = Math.max(26, f.size * 0.75);
        if (d < reach && d < bd) { bd = d; best = f; }
    }
    return best;
}

function updateHatsButtonUI() {
    const btn = document.getElementById("hats-btn");
    const cost = document.getElementById("hats-cost");
    if (!btn || !cost) return;
    if (hatsUnlocked) {
        btn.classList.remove("locked", "ready");
        btn.classList.toggle("on", hatsOn);
        btn.setAttribute("aria-disabled", "false");
        btn.setAttribute("aria-pressed", hatsOn ? "true" : "false");
        btn.title = hatsOn ? "Hats on" : "Hats off";
        cost.textContent = "";
    } else {
        const left = Math.max(0, HATS_GOLD_COST - goldCollected);
        btn.classList.add("locked");
        btn.classList.toggle("ready", left === 0);
        btn.classList.remove("on");
        btn.setAttribute("aria-disabled", left === 0 ? "false" : "true");
        btn.setAttribute("aria-pressed", "false");
        cost.textContent = String(left === 0 ? HATS_GOLD_COST : left);
        btn.title = left === 0
            ? "Unlock hats"
            : "Hats: " + left + " gold fish";
    }
}

function updateGoldCountUI() {
    const el = document.getElementById("gold-count");
    const wrap = document.getElementById("gold-counter");
    if (el) el.textContent = String(goldCollected);
    if (wrap) {
        wrap.classList.toggle("active",
            goldCollected > 0 || !!liftState || hatsUnlocked || marketUnlocked);
        wrap.title = goldCollected + " gold";
    }
    updateMarketUI();
}

function cancelGoldLift() {
    if (!liftState) return;
    const f = liftState.fish;
    if (f && !f.dead) {
        f.lifting = false;
        f.x = liftState.originX;
        f.y = liftState.originY;
        f.sinkDepth = 1;
    }
    liftState = null;
    updateGoldCountUI();
}

// Larger settled gold fish pay more; caps at GOLD_AWARD_MAX near half-screen size.
function goldAwardForSize(size) {
    const sizeMax = giantSizeCap(); // min(viewW, viewH) * giantCapFrac (0.5)
    const span = Math.max(1, sizeMax - GOLD_AWARD_SIZE_MIN);
    const t = Math.max(0, Math.min(1, (size - GOLD_AWARD_SIZE_MIN) / span));
    const award = Math.round(GOLD_AWARD_MIN + (GOLD_AWARD_MAX - GOLD_AWARD_MIN) * t);
    return Math.max(GOLD_AWARD_MIN, Math.min(GOLD_AWARD_MAX, award));
}

function collectGoldFish(fish) {
    if (!fish || fish.dead) return;
    fish.dead = true;
    fish.lifting = false;
    liftState = null;
    goldCollected += goldAwardForSize(fish.size || GOLD_AWARD_SIZE_MIN);
    const pan = Math.max(-1, Math.min(1, (fish.x / viewW) * 2 - 1));
    Audio.goldChime(pan);
    water.disturb(fish.x, Math.max(20, fish.y), fish.size, 160);
    spawnSplash(fish.x, Math.max(24, fish.y), 10, 0.45);
    updateHatsButtonUI();
    updateGoldCountUI();
    markFirstInteraction();
}

function goldHoldDuration() {
    return magnetOwned ? GOLD_HOLD_TIME * MAGNET_HOLD_MULT : GOLD_HOLD_TIME;
}

// Hold still on a gold fish: it rises and brightens over the hold time.
function updateGoldHold(dt) {
    if (!liftState || !liftState.holding) return;
    const fish = liftState.fish;
    if (!fish || fish.dead) {
        liftState = null;
        return;
    }
    liftState.holdTime += dt;
    const progress = Math.min(1, liftState.holdTime / goldHoldDuration());
    fish.lifting = true;
    fish.x = liftState.originX;
    fish.y = liftState.originY - progress * 58;
    fish.sinkDepth = Math.max(0.05, 1 - progress * 0.95);
    if (Math.random() < 0.12 + progress * 0.2) {
        water.disturb(fish.x, fish.y, fish.size * (0.35 + progress * 0.3), 30 + progress * 40);
    }
    updateGoldCountUI();
    if (progress >= 1) collectGoldFish(fish);
}

function onPointerDown(ev) {
    Audio.ensure();
    // Armed stash: left-click places the saved pellet in the pond.
    if (ev.button === 0 && mode === "pond" && armedStashIndex != null) {
        pointerNow = { x: ev.clientX, y: ev.clientY };
        placeArmedStashAt(ev.clientX, ev.clientY);
        pointerDownAt = null;
        return;
    }
    // Rainbow catcher: left-drag a small circle that must contain a free rainbow fish.
    if (ev.button === 0 && mode === "pond" && catcherMode) {
        pointerNow = { x: ev.clientX, y: ev.clientY };
        catcherDrag = { cx: ev.clientX, cy: ev.clientY, r: 8 };
        pointerDownAt = null;
        return;
    }
    // Right click: net scoop, hold gold, drag debris, scare reptile snout, or pet.
    if (ev.button === 2) {
        ev.preventDefault();
        if (mode !== "pond") return;
        pointerNow = { x: ev.clientX, y: ev.clientY };
        if (armedStashIndex != null) {
            armedStashIndex = null;
            renderFoodStashUI();
        }
        if (netMode) {
            netSweeping = true;
            sweepFoodNear(ev.clientX, ev.clientY);
            water.disturb(ev.clientX, ev.clientY, NET_RADIUS * 0.35, 40);
            return;
        }
        const gold = goldenFishAt(ev.clientX, ev.clientY);
        if (gold) {
            gold.lifting = true;
            liftState = {
                fish: gold,
                originX: gold.x,
                originY: gold.y,
                holdTime: 0,
                holding: true,
            };
            water.disturb(gold.x, gold.y, gold.size * 0.5, 70);
            updateGoldCountUI();
            return;
        }
        const ob = obstacleAt(ev.clientX, ev.clientY);
        if (ob) {
            grabbedObstacle = ob;
            grabOffset = { x: ob.x - ev.clientX, y: ob.y - ev.clientY };
            const pad = 24;
            grabAim = {
                x: Math.max(pad, Math.min(viewW - pad, ev.clientX + grabOffset.x)),
                y: Math.max(pad, Math.min(viewH - pad, ev.clientY + grabOffset.y)),
            };
            ob.vx = 0;
            ob.vy = 0;
            water.disturb(ob.x, ob.y, obstacleRadius(ob) * 0.6, 80);
            return;
        }
        if (tryScareReptileAt(ev.clientX, ev.clientY)) {
            markFirstInteraction();
            return;
        }
        petPondLifeAt(ev.clientX, ev.clientY);
        return;
    }
    pointerDownAt = { x: ev.clientX, y: ev.clientY, t: performance.now() };
    pointerNow = { x: ev.clientX, y: ev.clientY };
}
function onPointerMove(ev) {
    pointerNow = { x: ev.clientX, y: ev.clientY };
    if (mode === "pond" && catcherDrag && (ev.buttons & 1)) {
        const r = Math.hypot(ev.clientX - catcherDrag.cx, ev.clientY - catcherDrag.cy);
        catcherDrag.r = Math.max(8, Math.min(CATCHER_MAX_RADIUS, r));
        return;
    }
    if (mode === "pond" && (ev.buttons & 2)) {
        if (netMode && netSweeping) {
            sweepFoodNear(ev.clientX, ev.clientY);
            if (Math.random() < 0.2) water.disturb(ev.clientX, ev.clientY, NET_RADIUS * 0.25, 28);
            return;
        }
        if (liftState && liftState.holding) {
            // Stay near where you grabbed; the fish rises on its own.
            const d = Math.hypot(ev.clientX - liftState.originX, ev.clientY - liftState.originY);
            if (d > 56) cancelGoldLift();
            return;
        }
        if (grabbedObstacle) {
            const pad = 24;
            // Only update the aim point; the debris follows with water resistance.
            grabAim = {
                x: Math.max(pad, Math.min(viewW - pad, ev.clientX + grabOffset.x)),
                y: Math.max(pad, Math.min(viewH - pad, ev.clientY + grabOffset.y)),
            };
            return;
        }
        petPondLifeAt(ev.clientX, ev.clientY, true);
    }
}
function onPointerUp(ev) {
    if (ev.button === 2) {
        if (netSweeping) {
            netSweeping = false;
        }
        if (liftState) {
            // Released too early: the gold fish settles back on the lakebed.
            cancelGoldLift();
        }
        if (grabbedObstacle) {
            water.disturb(grabbedObstacle.x, grabbedObstacle.y, obstacleRadius(grabbedObstacle) * 0.7, 120);
            // Keep velocity so it coasts through the water after release.
            grabbedObstacle = null;
            grabAim = null;
        }
        return;
    }
    if (ev.button === 0 && catcherDrag) {
        tryCatchRainbowInCircle(catcherDrag.cx, catcherDrag.cy, catcherDrag.r);
        catcherDrag = null;
        return;
    }
    const x = ev.clientX;
    const y = ev.clientY;
    if (!pointerDownAt) return;

    const held = (performance.now() - pointerDownAt.t) / 1000;
    const v = chargeFromHold(held, ev);

    if (mode === "pond") {
        // Throwing food breaks the hidden pet streak (unless it just unlocked rainbow).
        const hadGuarantee = guaranteeRainbow;
        petStreak = 0;
        // Drag = sling the food across the water from where you started.
        let sx = x, sy = y;
        const dx = x - pointerDownAt.x;
        const dy = y - pointerDownAt.y;
        if (Math.hypot(dx, dy) > 8) { sx = pointerDownAt.x; sy = pointerDownAt.y; }
        if (rocks.length < CONFIG.maxRocks) rocks.push(new Rock(sx, sy, x, y, v));
        // If the throw consumed the guarantee, keep streak cleared.
        if (hadGuarantee) petStreak = 0;
    } else {
        spawnWindowRipple(x, y, v);
    }

    pointerDownAt = null;
    if (!firstInteractionDone) {
        firstInteractionDone = true;
        const hint = document.getElementById("hint");
        if (hint) {
            hint.classList.add("gone");
            setTimeout(() => hint.remove(), 1100);
        }
    }
}

function markFirstInteraction() {
    if (firstInteractionDone) return;
    firstInteractionDone = true;
    const hint = document.getElementById("hint");
    if (hint) {
        hint.classList.add("gone");
        setTimeout(() => hint.remove(), 1100);
    }
}

// Right-click snout prods: accumulate hits to scare a croc/alligator away.
function tryScareReptileAt(x, y) {
    if (apexDuel) return false;
    let best = null;
    let bestD = Infinity;
    for (const r of reptiles) {
        if (r.dead || r.leaving || r.duelMode) continue;
        if (!r.hitSnout(x, y)) continue;
        const d = Math.hypot(x - r.x, y - r.y);
        if (d < bestD) { bestD = d; best = r; }
    }
    if (!best) return false;
    return best.prodSnout(x, y);
}

// Right-click pets: whale and shark first, then reptiles, then ordinary fish.
function petPondLifeAt(x, y, quiet) {
    if (whale && !whale.dead) {
        const d = Math.hypot(x - whale.x, y - whale.y);
        if (d < whale.size * 0.48) {
            if (quiet && whale.petTimer > whale.petDur * 0.55) {
                whale.petTimer = whale.petDur;
                return;
            }
            whale.pet();
            markFirstInteraction();
            return;
        }
    }
    if (shark && !shark.dead) {
        const d = Math.hypot(x - shark.x, y - shark.y);
        if (d < shark.size * 0.55) {
            if (quiet && shark.rollTimer > 0) return;
            shark.pet();
            markFirstInteraction();
            return;
        }
    }

    let bestR = null;
    let bestRD = Infinity;
    for (const r of reptiles) {
        if (r.dead || r.leaving || r.duelMode || r.golden) continue;
        const d = Math.hypot(x - r.x, y - r.y);
        const reach = r.size * 0.48;
        if (d < reach && d < bestRD) { bestRD = d; bestR = r; }
    }
    if (bestR) {
        if (quiet && bestR.petTimer > 0.6) {
            bestR.petTimer = 1.4;
            return;
        }
        bestR.pet();
        markFirstInteraction();
        return;
    }

    let best = null;
    let bestD = 48;
    for (const f of fishes) {
        if (f.dead || f.golden) continue;
        const d = Math.hypot(x - f.x, y - f.y);
        const reach = Math.max(28, f.size * 0.9);
        if (d < reach && d < bestD) { bestD = d; best = f; }
    }
    if (!best) return;
    if (quiet && best.petTimer > 0.6) {
        best.petTimer = 1.4;
        return;
    }
    best.pet();
    markFirstInteraction();
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// Preview of the growing ball while the button is held.
function drawCharge(ctx) {
    if (!pointerDownAt || !pointerNow) return;
    const held = (performance.now() - pointerDownAt.t) / 1000;
    const v = chargeFromHold(held, null);
    const rad = 7 + v * 24;
    const { x, y } = pointerNow;

    // Aim line back to where the sling started, if dragged.
    const dx = x - pointerDownAt.x;
    const dy = y - pointerDownAt.y;
    if (Math.hypot(dx, dy) > 8) {
        ctx.save();
        ctx.strokeStyle = "rgba(190,222,255,0.25)";
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(pointerDownAt.x, pointerDownAt.y);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.restore();
    }

    ctx.save();
    // A faint ring showing the full possible size.
    ctx.strokeStyle = "rgba(190,222,255,0.18)";
    ctx.beginPath();
    ctx.arc(x, y, 31, 0, Math.PI * 2);
    ctx.stroke();
    // The food pellet grows brown while held (matches what flies into the pond).
    const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, rad * 0.1, x, y, rad);
    g.addColorStop(0, "#b98a48");
    g.addColorStop(0.6, "#8a6531");
    g.addColorStop(1, "#5c4321");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", () => {
    cancelGoldLift();
    netSweeping = false;
    catcherDrag = null;
    grabbedObstacle = null;
    grabAim = null;
});

// Quiet food-variant keywords: type "rainbow", "golden", "green" (etc.) for the next drop.
window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Escape / U: immersive UI chrome toggle (safe with keyword typing).
    if (e.key === "Escape" || e.key === "u" || e.key === "U") {
        e.preventDefault();
        setUiHidden(!document.body.classList.contains("ui-hidden"));
        return;
    }
    if (e.key.length !== 1) return;
    noteFoodVariantKeyword(e.key);
});

// ===========================================================================
// UI CHROME TOGGLE (immersive view: hide all menus except this button)
// ===========================================================================
const uiToggle = document.getElementById("ui-toggle");

function setUiHidden(hidden) {
    document.body.classList.toggle("ui-hidden", hidden);
    if (!uiToggle) return;
    const label = hidden ? "Show menus" : "Hide menus";
    uiToggle.title = label;
    uiToggle.setAttribute("aria-label", label);
    uiToggle.setAttribute("aria-pressed", hidden ? "true" : "false");
}

if (uiToggle) {
    uiToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        setUiHidden(!document.body.classList.contains("ui-hidden"));
    });
}

// ===========================================================================
// MODE TOGGLE (single click = switch surface, double click = ambient bed)
// ===========================================================================
const toggle = document.getElementById("mode-toggle");
toggle.addEventListener("click", () => {
    mode = mode === "window" ? "pond" : "window";
    document.body.classList.toggle("pond", mode === "pond");
    if (mode !== "pond" && armedStashIndex != null) {
        armedStashIndex = null;
        renderFoodStashUI();
    }
    Audio.onModeChange();
});
toggle.addEventListener("dblclick", (e) => {
    e.preventDefault();
    Audio.toggleAmbient();
});

// Pond scenery toggles and drop-sound cycle (minimalist corner controls).
document.querySelectorAll(".scenery-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = btn.dataset.scenery;
        if (!key || !(key in scenery)) return;
        scenery[key] = !scenery[key];
        btn.classList.toggle("on", scenery[key]);
        btn.setAttribute("aria-pressed", scenery[key] ? "true" : "false");
    });
});

const dropSoundBtn = document.getElementById("drop-sound-btn");
const dropSoundLabel = document.getElementById("drop-sound-label");
dropSoundBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    Audio.ensure();
    const style = Audio.cycleDropStyle();
    dropSoundLabel.textContent = style;
    dropSoundBtn.title = "Drop sound: " + style;
    // Quiet preview so the user hears the new style immediately.
    Audio.playDrop({
        freq: 420,
        decay: 1.4,
        velocity: 0.45,
        pan: 0,
        plunk: true,
    });
});

const netBtn = document.getElementById("net-btn");
netBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    netMode = !netMode;
    netSweeping = false;
    if (netMode) setCatcherMode(false);
    netBtn.classList.toggle("on", netMode);
    netBtn.setAttribute("aria-pressed", netMode ? "true" : "false");
    netBtn.title = netMode
        ? "Net on: right click sweeps food"
        : "Net: scoop food with right click";
});

const hatsBtn = document.getElementById("hats-btn");
hatsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    Audio.ensure();
    if (!hatsUnlocked) {
        if (goldCollected >= HATS_GOLD_COST) {
            goldCollected -= HATS_GOLD_COST;
            hatsUnlocked = true;
            hatsOn = true;
            Audio.goldChime(0);
            updateHatsButtonUI();
            updateGoldCountUI();
        }
        return;
    }
    hatsOn = !hatsOn;
    updateHatsButtonUI();
});
updateHatsButtonUI();

// ---------------------------------------------------------------------------
// Market (unlock with gold; quiet buy rows for pond tools)
// ---------------------------------------------------------------------------
function loadMarketState() {
    try {
        const raw = localStorage.getItem(MARKET_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || typeof data !== "object") return;
        marketUnlocked = !!data.unlocked;
        magnetOwned = !!data.magnet;
        catcherOwned = !!data.catcher;
    } catch (err) {
        // Ignore corrupt market data.
    }
}

function saveMarketState() {
    try {
        localStorage.setItem(MARKET_KEY, JSON.stringify({
            unlocked: marketUnlocked,
            magnet: magnetOwned,
            catcher: catcherOwned,
        }));
    } catch (err) {
        // Private mode / quota: market still works for this session.
    }
}

function setCatcherMode(on) {
    catcherMode = !!on && catcherOwned;
    if (!catcherMode) catcherDrag = null;
    if (catcherMode) {
        netMode = false;
        netSweeping = false;
        if (netBtn) {
            netBtn.classList.remove("on");
            netBtn.setAttribute("aria-pressed", "false");
            netBtn.title = "Net: scoop food with right click";
        }
        if (armedStashIndex != null) {
            armedStashIndex = null;
            renderFoodStashUI();
        }
    }
    updateCatcherButtonUI();
}

function updateCatcherButtonUI() {
    const btn = document.getElementById("catcher-btn");
    if (!btn) return;
    btn.hidden = !catcherOwned;
    btn.classList.toggle("on", catcherMode);
    btn.setAttribute("aria-pressed", catcherMode ? "true" : "false");
    btn.title = catcherMode
        ? "Catcher on: drag a small circle around a rainbow fish"
        : "Rainbow catcher: drag a small circle to catch";
}

function updateMarketButtonUI() {
    const btn = document.getElementById("market-btn");
    const cost = document.getElementById("market-cost");
    if (!btn || !cost) return;
    if (marketUnlocked) {
        btn.classList.remove("locked", "ready");
        btn.classList.toggle("on", marketOpen);
        btn.setAttribute("aria-disabled", "false");
        btn.setAttribute("aria-pressed", marketOpen ? "true" : "false");
        btn.title = marketOpen ? "Close market" : "Open market";
        cost.textContent = "";
    } else {
        const left = Math.max(0, MARKET_GOLD_COST - goldCollected);
        btn.classList.add("locked");
        btn.classList.toggle("ready", left === 0);
        btn.classList.remove("on");
        btn.setAttribute("aria-disabled", left === 0 ? "false" : "true");
        btn.setAttribute("aria-pressed", "false");
        cost.textContent = String(left === 0 ? MARKET_GOLD_COST : left);
        btn.title = left === 0
            ? "Unlock market"
            : "Market: " + left + " gold fish";
    }
}

function setMarketOpen(open) {
    marketOpen = !!open && marketUnlocked;
    const panel = document.getElementById("market-panel");
    if (panel) {
        panel.classList.toggle("open", marketOpen);
        panel.setAttribute("aria-hidden", marketOpen ? "false" : "true");
    }
    updateMarketButtonUI();
    updateMarketUI();
}

function updateMarketUI() {
    updateMarketButtonUI();
    updateCatcherButtonUI();
    const goldEl = document.getElementById("market-gold");
    const foodEl = document.getElementById("market-food");
    if (goldEl) goldEl.textContent = String(goldCollected);
    if (foodEl) foodEl.textContent = String(availableNormalFood());

    const rows = {
        magnet: document.getElementById("market-buy-magnet"),
        catcher: document.getElementById("market-buy-catcher"),
        rainbow: document.getElementById("market-buy-rainbow"),
        goldfood: document.getElementById("market-buy-goldfood"),
    };
    if (rows.magnet) {
        rows.magnet.disabled = !marketUnlocked || magnetOwned || goldCollected < MAGNET_GOLD_COST;
        rows.magnet.textContent = magnetOwned
            ? "Magnet owned (faster gold pickup)"
            : "Magnet · " + MAGNET_GOLD_COST + " gold";
        rows.magnet.title = magnetOwned
            ? "Already owned: gold fish lift much faster"
            : "Lift settled gold fish much faster";
    }
    if (rows.catcher) {
        rows.catcher.disabled = !marketUnlocked || catcherOwned || goldCollected < CATCHER_GOLD_COST;
        rows.catcher.textContent = catcherOwned
            ? "Rainbow catcher owned"
            : "Rainbow catcher · " + CATCHER_GOLD_COST + " gold";
        rows.catcher.title = catcherOwned
            ? "Use the catcher button, then drag a small circle"
            : "Draw a small circle that must contain a rainbow fish";
    }
    if (rows.rainbow) {
        rows.rainbow.disabled = !marketUnlocked || goldCollected < RAINBOW_FISH_GOLD_COST;
        rows.rainbow.textContent = "Rainbow fish · " + RAINBOW_FISH_GOLD_COST + " gold";
        rows.rainbow.title = "Spawn a rainbow fish in the pond";
    }
    if (rows.goldfood) {
        const food = availableNormalFood();
        rows.goldfood.disabled = !marketUnlocked || food < GOLD_FOOD_NORMAL_COST;
        rows.goldfood.textContent = "Gold food · " + GOLD_FOOD_NORMAL_COST + " fish food";
        rows.goldfood.title = food + " fish food saved";
    }
}

function spendGold(amount) {
    if (goldCollected < amount) return false;
    goldCollected -= amount;
    updateHatsButtonUI();
    updateGoldCountUI();
    return true;
}

function marketBuyMagnet() {
    if (!marketUnlocked || magnetOwned) return;
    if (!spendGold(MAGNET_GOLD_COST)) return;
    magnetOwned = true;
    saveMarketState();
    Audio.goldChime(0);
    updateMarketUI();
    markFirstInteraction();
}

function marketBuyCatcher() {
    if (!marketUnlocked || catcherOwned) return;
    if (!spendGold(CATCHER_GOLD_COST)) return;
    catcherOwned = true;
    saveMarketState();
    setCatcherMode(true);
    Audio.rainbowChime(0);
    updateMarketUI();
    markFirstInteraction();
}

function marketBuyRainbowFish() {
    if (!marketUnlocked) return;
    if (!spendGold(RAINBOW_FISH_GOLD_COST)) return;
    let target = null;
    for (const f of fishes) {
        if (f.dead || f.golden || f.isRainbow || f.rainbowLeaving) continue;
        target = f;
        break;
    }
    if (!target) {
        target = edgeFish();
        fishes.push(target);
    }
    target.turnToRainbow();
    updateMarketUI();
    markFirstInteraction();
}

function marketBuyGoldFood() {
    if (!marketUnlocked) return;
    if (availableNormalFood() < GOLD_FOOD_NORMAL_COST) return;
    normalFoodBank = Math.max(0, availableNormalFood() - GOLD_FOOD_NORMAL_COST);
    let left = GOLD_FOOD_NORMAL_COST;
    for (let i = foodStash.length - 1; i >= 0 && left > 0; i--) {
        if (foodStash[i] !== "normal") continue;
        foodStash.splice(i, 1);
        left--;
    }
    if (armedStashIndex != null && armedStashIndex >= foodStash.length) {
        armedStashIndex = null;
    }
    saveFoodStash();
    renderFoodStashUI();
    stashFood("golden");
    if (typeof Audio !== "undefined" && Audio.ensure) {
        Audio.ensure();
        if (Audio.goldChime) Audio.goldChime(0);
    }
    updateMarketUI();
    markFirstInteraction();
}

function tryCatchRainbowInCircle(cx, cy, r) {
    if (!catcherOwned || r < 10) return false;
    let best = null;
    let bestD = Infinity;
    for (const f of fishes) {
        if (f.dead || !f.isRainbow || f.rainbowLeaving) continue;
        const d = Math.hypot(f.x - cx, f.y - cy);
        if (d <= r && d < bestD) {
            bestD = d;
            best = f;
        }
    }
    if (!best) {
        water.disturb(cx, cy, r * 0.35, 35);
        return false;
    }
    best.dead = true;
    best.isRainbow = false;
    const pan = Math.max(-1, Math.min(1, (best.x / viewW) * 2 - 1));
    if (typeof Audio !== "undefined" && Audio.ensure) {
        Audio.ensure();
        if (Audio.rainbowChime) Audio.rainbowChime(pan);
    }
    water.disturb(best.x, best.y, best.size * 1.2, 220);
    spawnSplash(best.x, best.y, best.size * 0.55, 0.7);
    markFirstInteraction();
    return true;
}

function drawCatcherOverlay(ctx) {
    if (mode !== "pond" || !catcherMode) return;
    if (catcherDrag) {
        const { cx, cy, r } = catcherDrag;
        ctx.save();
        ctx.strokeStyle = "rgba(200, 170, 255, 0.75)";
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = "rgba(180, 150, 255, 1)";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
    }
    if (!pointerNow) return;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "rgba(190, 170, 240, 0.9)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(pointerNow.x, pointerNow.y, CATCHER_MAX_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

loadMarketState();

const marketBtn = document.getElementById("market-btn");
if (marketBtn) {
    marketBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        Audio.ensure();
        if (!marketUnlocked) {
            if (goldCollected >= MARKET_GOLD_COST) {
                goldCollected -= MARKET_GOLD_COST;
                marketUnlocked = true;
                saveMarketState();
                setMarketOpen(true);
                Audio.goldChime(0);
                updateGoldCountUI();
            }
            return;
        }
        setMarketOpen(!marketOpen);
    });
}

const catcherBtn = document.getElementById("catcher-btn");
if (catcherBtn) {
    catcherBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!catcherOwned) return;
        setCatcherMode(!catcherMode);
    });
}

const marketPanel = document.getElementById("market-panel");
if (marketPanel) {
    marketPanel.addEventListener("click", (e) => e.stopPropagation());
    const buyMagnet = document.getElementById("market-buy-magnet");
    const buyCatcher = document.getElementById("market-buy-catcher");
    const buyRainbow = document.getElementById("market-buy-rainbow");
    const buyGoldFood = document.getElementById("market-buy-goldfood");
    if (buyMagnet) buyMagnet.addEventListener("click", (e) => { e.stopPropagation(); marketBuyMagnet(); });
    if (buyCatcher) buyCatcher.addEventListener("click", (e) => { e.stopPropagation(); marketBuyCatcher(); });
    if (buyRainbow) buyRainbow.addEventListener("click", (e) => { e.stopPropagation(); marketBuyRainbowFish(); });
    if (buyGoldFood) buyGoldFood.addEventListener("click", (e) => { e.stopPropagation(); marketBuyGoldFood(); });
}

updateMarketUI();

// ===========================================================================
// RENDER LOOP
// ===========================================================================
let lastFrame = performance.now();
let sceneryTime = 0;

function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    sceneryTime += dt;

    if (mode === "pond") {
        sunPhase += dt;
        // Advance the water twice per frame for smoother, faster wave travel.
        water.step();
        water.step();

        // Floor first, caustics on the stones, then translucent water.
        drawPondBed(ctx);
        drawBedCaustics(ctx);
        water.render(ctx);
        drawSunContactShadows(ctx);

        // Shore and bank scenery sit under the swimming life.
        drawShoreStones(ctx, dt);
        drawSticks(ctx, dt);
        drawReeds(ctx, sceneryTime, dt);
        drawCattails(ctx, sceneryTime, dt);
        // Frogs and tadpoles swim mid-depth as quiet background life.
        drawFrogGroups(ctx);
        updateObstacles(dt);
        drawObstacles(ctx, dt);
        // Green-food plants stay permanently (until refresh).
        drawPondPlants(ctx, sceneryTime, dt);

        updateDroplets(dt);
        updateRainbowTrail(dt);
        updateGoldHold(dt);
        updateMariachiFiesta(dt);

        // Fish live beneath the surface, so draw them first.
        if (!pondFinaleActive()) {
            for (const fish of fishes) fish.update(dt);
            updateBreeding();
        }
        manageEcosystem(dt); // predators, shark, reptiles, POV / giant / remorse finales
        for (let i = fishes.length - 1; i >= 0; i--) {
            if (fishes[i].dead) fishes.splice(i, 1);
        }
        drawSunCreatureShadows(ctx);
        // Draw resting gold first (lakebed), then swimmers above them.
        for (const fish of fishes) {
            if (fish.golden) fish.draw(ctx);
        }
        drawRainbowTrail(ctx);
        for (const fish of fishes) {
            if (!fish.golden) fish.draw(ctx);
        }
        for (const r of reptiles) r.draw(ctx);
        if (shark) shark.draw(ctx);
        if (whale) whale.draw(ctx);

        // Surface greens float above the fish.
        drawDuckweed(ctx, sceneryTime, dt);
        drawLeaves(ctx, sceneryTime, dt);
        drawLilies(ctx, sceneryTime, dt);

        // Food floats on top, then rocks in flight above that.
        for (const f of foods) f.update(dt);
        for (let i = foods.length - 1; i >= 0; i--) {
            if (foods[i].eaten) foods.splice(i, 1);
        }
        for (const f of foods) f.draw(ctx);
        drawNetCursor(ctx);
        drawCatcherOverlay(ctx);

        for (const rk of rocks) rk.update(dt);
        for (let i = rocks.length - 1; i >= 0; i--) {
            if (rocks[i].dead) rocks.splice(i, 1);
        }
        for (const rk of rocks) rk.draw(ctx);
        drawDroplets(ctx);
        if (!pondFinaleActive()) drawCharge(ctx);

        // Golden-hour wash (no rays) sits above the pond life.
        drawSunAmbience(ctx);

        // Vignette for depth.
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, viewW, viewH);
        ctx.restore();

        // Finales draw on top of everything.
        if (povAttack) drawPovAttack(ctx);
        if (giantEnding) drawGiantEnding(ctx);
        if (heroRemorseEnding) drawHeroRemorseEnding(ctx);
    } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(7, 10, 15, 0.22)";
        ctx.fillRect(0, 0, viewW, viewH);
        ctx.globalCompositeOperation = "lighter";
        for (const rp of ripples) { rp.update(dt); rp.draw(ctx); }
        drawInterference(ctx);
        for (let i = ripples.length - 1; i >= 0; i--) {
            if (ripples[i].dead) ripples.splice(i, 1);
        }
        ctx.globalCompositeOperation = "source-over";
        drawCharge(ctx);
    }

    requestAnimationFrame(frame);
}

resize();
rebuildScenery();
initFish();
updateGoldCountUI();
requestAnimationFrame(frame);
