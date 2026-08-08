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
    goldenChance: 0.018,    // rare chance a piece of food is the golden kind
    rainbowChance: 0.004,   // even rarer: rainbow food (must stay below goldenChance)
    greenChance: 0.005,     // rare green food: turns a fish into a lasting pond plant
    goldSinkTime: 2.4,      // seconds for a golden fish to settle on the lakebed
    rainbowSpeed: 2.35,     // rainbow chase speed (kept moderate so tracking stays stable)
    predatorFoodBoost: 1.045, // each food bite makes an evil fish a bit faster
    predatorSpeedCap: 110,  // max baseSpeed an evil fish can reach from food
    whaleChance: 0.004,     // rare whale visit chance (checked every whaleInterval)
    whaleInterval: 10,      // seconds between whale chance rolls
    petsForRainbow: 15,     // hidden: pet this many times with no throws to force rainbow food
    petsToRedeem: 8,        // pets needed to turn an evil fish good again for good
    reptileInterval: 300,   // seconds between crocodile/alligator chance rolls
    reptileChance: 0.12,    // small chance a reptile arrives on each roll
    reptileSize: [88, 112], // croc/alligator body length range
};

// Hidden streak: consecutive pets with no food thrown unlock a guaranteed rainbow pellet.
let petStreak = 0;
let guaranteeRainbow = false;

// Scales: fish bites walk up these for melodic runs.
const PENTATONIC = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
const MINOR_PENT = [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5];

// Fish species. Each has LOOK, optional pattern, musical voice, swimming habit,
// and a body shape used when drawing (koi / oval / slim / round / diamond / longfin).
// Voice fields: wave/register/dur for bites; petWave/petFreq/petDur for pets;
// bitePartial and biteBright shape each species' chew timbre.
const FISH_TYPES = [
    { name: "koi",      shape: "koi",     body: "#e8853a", belly: "#fff1dc", pattern: "blotches", patternColor: "#f5f0e6", size: [18, 26], speed: [24, 40], wave: "sine",     register: 1.0,  bite: 6, dur: 0.4,  turn: 2.8, wiggle: 1.15, scale: PENTATONIC, petWave: "sine",     petFreq: 300, petDur: 0.42, bitePartial: 0.22, biteBright: 1.0 },
    { name: "shiro",    shape: "koi",     body: "#f4f0e8", belly: "#ffffff", pattern: "blotches", patternColor: "#c23b3b", size: [17, 24], speed: [24, 38], wave: "sine",     register: 1.1,  bite: 5, dur: 0.38, turn: 2.9, wiggle: 1.1,  scale: PENTATONIC, petWave: "triangle", petFreq: 340, petDur: 0.38, bitePartial: 0.28, biteBright: 1.15 },
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
        if (o) return (o.kind === "log" || o.kind === "stump") ? "wood" : "stone";
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
        let p = 0;
        for (let y = 0; y < rows; y++) {
            // Soft pond teal: darker in the distance, a little richer nearby.
            const ty = y / rows;
            const baseR = 8 + ty * 5;
            const baseG = 22 + ty * 14;
            const baseB = 26 + ty * 12;
            for (let x = 0; x < cols; x++) {
                const i = y * cols + x;
                const l = x > 0 ? field[i - 1] : field[i];
                const r = x < cols - 1 ? field[i + 1] : field[i];
                const u = y > 0 ? field[i - cols] : field[i];
                const d = y < rows - 1 ? field[i + cols] : field[i];
                // Surface slope acts as a normal: light from the upper-left.
                const sx = l - r;
                const sy = u - d;
                const shade = (sx + sy) * 1.4;
                // Sharp positive slopes sparkle (specular crest highlight).
                let spec = 0;
                const s = sx * 0.6 + sy;
                if (s > 4) spec = Math.min(150, (s - 4) * (s - 4) * 0.5);

                data[p] = clampByte(baseR + shade + spec * 0.7);
                data[p + 1] = clampByte(baseG + shade * 1.1 + spec * 0.9);
                data[p + 2] = clampByte(baseB + shade * 1.3 + spec);
                data[p + 3] = 255;
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
    debris: true, // solid movable obstacles (boulders, logs, stumps)
};
let sceneryItems = {
    stones: [], sticks: [], reeds: [], lilies: [],
    cattails: [], duckweed: [], leaves: [],
};
// Solid props fish cannot swim through. Right-click drag moves them.
let obstacles = [];
let grabbedObstacle = null;
let grabOffset = { x: 0, y: 0 };

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
}

function rebuildObstacles() {
    const next = [];
    const pad = Math.min(viewW, viewH) * 0.14;
    const kinds = ["boulder", "log", "stump"];
    for (let i = 0; i < 6; i++) {
        const kind = kinds[Math.floor(seeded(i + 700) * kinds.length)];
        const x = pad + seeded(i + 710) * (viewW - pad * 2);
        const y = pad + seeded(i + 720) * (viewH - pad * 2);
        if (kind === "boulder") {
            next.push({
                kind, x, y,
                r: 18 + seeded(i + 730) * 16,
                rot: seeded(i + 740) * Math.PI,
                tone: 0.4 + seeded(i + 750) * 0.3,
            });
        } else if (kind === "log") {
            next.push({
                kind, x, y,
                len: 46 + seeded(i + 730) * 40,
                thick: 9 + seeded(i + 740) * 7,
                rot: seeded(i + 750) * Math.PI,
                tone: 0.35 + seeded(i + 760) * 0.3,
            });
        } else {
            next.push({
                kind, x, y,
                r: 14 + seeded(i + 730) * 10,
                rot: seeded(i + 740) * Math.PI,
                tone: 0.3 + seeded(i + 750) * 0.35,
            });
        }
    }
    obstacles = next;
    grabbedObstacle = null;
}

function obstacleRadius(o) {
    if (o.kind === "log") return Math.max(o.thick, o.len * 0.28);
    return o.r;
}

function obstacleAt(x, y) {
    if (!scenery.debris) return null;
    let best = null, bd = 16;
    for (const o of obstacles) {
        let d;
        if (o.kind === "log") {
            const ca = Math.cos(o.rot), sa = Math.sin(o.rot);
            const lx = (x - o.x) * ca + (y - o.y) * sa;
            const ly = -(x - o.x) * sa + (y - o.y) * ca;
            const dx = Math.max(Math.abs(lx) - o.len * 0.5, 0);
            const dy = Math.max(Math.abs(ly) - o.thick * 0.55, 0);
            d = Math.hypot(dx, dy);
        } else {
            d = Math.max(0, Math.hypot(x - o.x, y - o.y) - o.r);
        }
        if (d < bd) { bd = d; best = o; }
    }
    return best;
}

// Bias heading away from nearby solids.
function obstacleAvoidDir(x, y, bodyR) {
    if (!scenery.debris || !obstacles.length) return null;
    let ax = 0, ay = 0, hits = 0;
    for (const o of obstacles) {
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

// Push a swimmer out of solid debris.
function resolveObstacleOverlap(ent, bodyR) {
    if (!scenery.debris || !obstacles.length) return;
    for (const o of obstacles) {
        if (o.kind === "log") {
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
                    ent.x += ca * nx * ox;
                    ent.y += sa * nx * ox;
                } else {
                    const ny = Math.sign(ly) || 1;
                    ent.x += -sa * ny * oy;
                    ent.y += ca * ny * oy;
                }
            }
        } else {
            const rr = o.r + bodyR;
            const dx = ent.x - o.x, dy = ent.y - o.y;
            const d = Math.hypot(dx, dy) || 0.001;
            if (d < rr) {
                const push = (rr - d) / d;
                ent.x += dx * push;
                ent.y += dy * push;
            }
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
        ctx.globalAlpha = 0.55;
        for (let i = 0; i < d.density; i++) {
            const a = (i / d.density) * Math.PI * 2 + d.bob;
            const rr = d.r * (0.25 + (i % 3) * 0.12);
            const px = Math.cos(a) * d.r * 0.45;
            const py = Math.sin(a) * d.r * 0.35;
            ctx.fillStyle = i % 2 ? "rgba(90,140,70,0.75)" : "rgba(60,110,55,0.7)";
            ctx.beginPath();
            ctx.ellipse(px, py, rr * 0.55, rr * 0.4, a, 0, Math.PI * 2);
            ctx.fill();
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
        ctx.globalAlpha = 0.7;
        const c = Math.floor(90 + L.tone * 70);
        ctx.fillStyle = `rgba(${c},${Math.floor(c * 0.7)},${Math.floor(c * 0.25)},0.75)`;
        ctx.beginPath();
        ctx.ellipse(0, 0, L.len, L.len * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(${c - 30},${Math.floor(c * 0.5)},20,0.45)`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-L.len * 0.7, 0);
        ctx.lineTo(L.len * 0.7, 0);
        ctx.stroke();
        ctx.restore();
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
        ctx.globalAlpha = dragging ? 0.95 : 0.86;
        if (dragging) {
            ctx.shadowColor = "rgba(180,210,200,0.35)";
            ctx.shadowBlur = 14;
        }
        if (o.kind === "boulder") {
            const c = Math.floor(75 + o.tone * 45);
            const g = ctx.createRadialGradient(-o.r * 0.25, -o.r * 0.3, 2, 0, 0, o.r);
            g.addColorStop(0, `rgb(${c + 18},${c + 14},${c + 10})`);
            g.addColorStop(1, `rgb(${c - 28},${c - 24},${c - 22})`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(0, 0, o.r, o.r * 0.72, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(140,160,150,0.2)";
            ctx.lineWidth = 1;
            ctx.stroke();
        } else if (o.kind === "log") {
            const c = Math.floor(70 + o.tone * 40);
            ctx.fillStyle = `rgb(${c},${Math.floor(c * 0.72)},${Math.floor(c * 0.42)})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, o.len * 0.5, o.thick * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = `rgba(${c - 25},${Math.floor(c * 0.5)},${Math.floor(c * 0.25)},0.55)`;
            ctx.lineWidth = 1.2;
            for (let i = -2; i <= 2; i++) {
                ctx.beginPath();
                ctx.ellipse(i * o.len * 0.14, 0, o.len * 0.04, o.thick * 0.42, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
        } else {
            const c = Math.floor(65 + o.tone * 40);
            ctx.fillStyle = `rgb(${c},${Math.floor(c * 0.7)},${Math.floor(c * 0.4)})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, o.r, o.r * 0.7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(${c - 15},${Math.floor(c * 0.55)},${Math.floor(c * 0.25)},0.7)`;
            ctx.beginPath();
            ctx.ellipse(0, -o.r * 0.15, o.r * 0.45, o.r * 0.55, 0, 0, Math.PI * 2);
            ctx.fill();
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
        ctx.beginPath();
        ctx.ellipse(0, 0, s.rx, s.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(140,170,160,0.22)";
        ctx.lineWidth = 1;
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
        ctx.strokeStyle = s.wet ? "rgba(90,70,45,0.55)" : "rgba(110,85,55,0.65)";
        ctx.lineWidth = s.thick;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-s.len * 0.5, 0);
        ctx.quadraticCurveTo(0, (s.wet ? 2.5 : 0.5) + lift * 0.25, s.len * 0.5, 0);
        ctx.stroke();
        if (s.wet) {
            ctx.strokeStyle = "rgba(160,200,190,0.15)";
            ctx.lineWidth = Math.max(0.8, s.thick * 0.35);
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
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.beginPath();
        ctx.ellipse(1, 2, L.r * 1.05, L.r * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
        const g = ctx.createRadialGradient(-L.r * 0.2, -L.r * 0.2, 2, 0, 0, L.r);
        g.addColorStop(0, "#6f9a5a");
        g.addColorStop(0.7, "#3f6a3a");
        g.addColorStop(1, "#2a4a2c");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, L.r, 0.35, Math.PI * 2 - 0.35);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();
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
        // Rare special pellets are mutually exclusive. A pet-streak can force rainbow.
        if (guaranteeRainbow) {
            this.rainbow = true;
            this.green = false;
            this.golden = false;
            guaranteeRainbow = false;
        } else {
            const roll = Math.random();
            this.rainbow = roll < CONFIG.rainbowChance;
            this.green = !this.rainbow && roll < CONFIG.rainbowChance + CONFIG.greenChance;
            this.golden = !this.rainbow && !this.green
                && roll < CONFIG.rainbowChance + CONFIG.greenChance + CONFIG.goldenChance;
        }
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
            const common = foods.findIndex((f) => !f.golden && !f.rainbow && !f.green);
            if (common >= 0) foods.splice(common, 1);
            else foods.shift();
        }
        foods.push(new Food(this.tx, this.ty, this.size, {
            golden: this.golden,
            rainbow: this.rainbow,
            green: this.green,
        }));
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

        // The food pellet itself: brown, golden, green, or rainbow.
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
        this.rare = this.golden || this.rainbow || this.green;
        this.eaten = false;
        this.age = 0;
        // Larger common pellets are heavier and sink sooner.
        // Rare pellets (gold, rainbow, green) never sink: they wait to be eaten.
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

function letterStrokes(ch) {
    switch (ch) {
        case "E": return [[[0, 0], [0, 1]], [[0, 0], [0.9, 0]], [[0, 0.5], [0.72, 0.5]], [[0, 1], [0.9, 1]]];
        case "A": return [[[0, 1], [0.5, 0], [1, 1]], [[0.22, 0.58], [0.78, 0.58]]];
        case "S": return [[[0.88, 0.18], [0.55, 0], [0.15, 0.22], [0.18, 0.42], [0.82, 0.58], [0.85, 0.8], [0.5, 1], [0.12, 0.82]]];
        case "T": return [[[0, 0], [1, 0]], [[0.5, 0], [0.5, 1]]];
        case "R": return [[[0, 0], [0, 1]], [[0, 0], [0.72, 0], [0.92, 0.18], [0.72, 0.45], [0, 0.45]], [[0.48, 0.45], [0.95, 1]]];
        case "G": return [[[0.88, 0.22], [0.55, 0], [0.15, 0.25], [0.08, 0.5], [0.15, 0.78], [0.55, 1], [0.92, 0.78], [0.92, 0.55], [0.55, 0.55]]];
        case "a": return [[[0.85, 0.45], [0.85, 1]], [[0.85, 0.62], [0.45, 0.45], [0.15, 0.65], [0.2, 0.9], [0.55, 1], [0.85, 0.82]]];
        case "e": return [[[0.15, 0.68], [0.85, 0.62], [0.7, 0.42], [0.35, 0.42], [0.12, 0.65], [0.2, 0.9], [0.55, 1], [0.88, 0.85]]];
        case "s": return [[[0.82, 0.52], [0.5, 0.4], [0.18, 0.52], [0.22, 0.68], [0.78, 0.78], [0.82, 0.92], [0.5, 1.05], [0.15, 0.92]]];
        case "t": return [[[0.45, 0.3], [0.45, 1]], [[0.2, 0.48], [0.75, 0.48]]];
        case "r": return [[[0.2, 0.4], [0.2, 1]], [[0.2, 0.55], [0.45, 0.4], [0.75, 0.42]]];
        case "g": return [[[0.82, 0.55], [0.5, 0.4], [0.18, 0.55], [0.18, 0.78], [0.5, 0.95], [0.82, 0.78], [0.82, 0.4], [0.82, 1.15], [0.45, 1.25], [0.15, 1.1]]];
        case " ": return [];
        default: return [[[0.2, 0.5], [0.8, 0.5]]];
    }
}

function buildEasterEggPath() {
    const text = "Easter Egg";
    const padX = viewW * 0.07;
    const padY = viewH * 0.18;
    const usableW = Math.max(160, viewW - padX * 2);
    const usableH = Math.max(100, viewH - padY * 2);
    const letterW = usableW / text.length;
    const letterH = Math.min(usableH * 0.7, letterW * 1.7);
    const path = [];
    let strokeId = 0;
    const samples = 10;
    for (let i = 0; i < text.length; i++) {
        const strokes = letterStrokes(text[i]);
        const ox = padX + i * letterW + letterW * 0.1;
        const oy = padY + (usableH - letterH) * 0.25;
        const sx = letterW * 0.78;
        const sy = letterH;
        for (const stroke of strokes) {
            strokeId++;
            for (let s = 0; s < stroke.length - 1; s++) {
                const [x0, y0] = stroke[s];
                const [x1, y1] = stroke[s + 1];
                for (let k = 0; k <= samples; k++) {
                    const t = k / samples;
                    path.push({
                        x: ox + (x0 + (x1 - x0) * t) * sx,
                        y: oy + (y0 + (y1 - y0) * t) * sy,
                        strokeId,
                    });
                }
            }
        }
    }
    return path;
}

function pushRainbowTrail(x, y, life, strokeId) {
    rainbowScriptTrail.push({
        x, y,
        age: 0,
        life: life == null ? 6 : life,
        hue: (performance.now() * 0.28 + (strokeId || 0) * 18) % 360,
        r: 4.5 + Math.random() * 2.8,
        strokeId: strokeId || 0,
    });
}

function updateRainbowTrail(dt) {
    // Hold the script steady while writing; afterglow fades once the exit starts.
    const writing = fishes.some((f) => f.isRainbow && f.rainbowLeaving && f.rainbowPhase === "write");
    if (!writing) {
        for (const p of rainbowScriptTrail) p.age += dt;
    }
    for (let i = rainbowScriptTrail.length - 1; i >= 0; i--) {
        if (rainbowScriptTrail[i].age >= rainbowScriptTrail[i].life) {
            rainbowScriptTrail.splice(i, 1);
        }
    }
}

function drawRainbowTrail(ctx) {
    if (!rainbowScriptTrail.length) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "lighter";
    for (let i = 1; i < rainbowScriptTrail.length; i++) {
        const a = rainbowScriptTrail[i - 1];
        const b = rainbowScriptTrail[i];
        if (a.strokeId !== b.strokeId) continue;
        const fade = Math.max(0, 1 - b.age / b.life);
        if (fade <= 0.02) continue;
        // Soft afterglow under the bright stroke.
        ctx.strokeStyle = `hsla(${b.hue}, 95%, 68%, ${0.28 * fade})`;
        ctx.lineWidth = Math.max(4, b.r * 2.4 * fade);
        ctx.shadowColor = `hsla(${b.hue}, 100%, 70%, ${0.45 * fade})`;
        ctx.shadowBlur = 18 * fade;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = `hsla(${(b.hue + 40) % 360}, 100%, 75%, ${0.7 * fade})`;
        ctx.lineWidth = Math.max(1.6, b.r * fade);
        ctx.shadowBlur = 8 * fade;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    for (const p of rainbowScriptTrail) {
        const fade = Math.max(0, 1 - p.age / p.life);
        if (fade <= 0.02) continue;
        ctx.fillStyle = `hsla(${p.hue}, 100%, 78%, ${0.4 * fade})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.7 * fade, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// ===========================================================================
// FISH (pond mode)
// Fish wander, notice food, chase it, and bite (melodic run in the species'
// voice). Eating food makes them GROW. Grow past a threshold and a fish turns
// predator: it hunts smaller fish, and everyone smaller flees from it.
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
        this.rainbowLeaving = false;
        this.rainbowPhase = null; // "write" | "exit" during victory lap
        this.eggPath = null;
        this.eggIndex = 0;
        this.trailDrop = 0;
        this.erraticTimer = 0;
        this.golden = false;  // turned to gold and resting on the lakebed
        this.sinkTimer = 0;
        this.sinkDepth = 0;
        this.petTimer = 0;    // >0 means being petted: closed eyes, calm
        this.evilPetCount = 0; // pets while evil; enough redeems the fish
        this.redeemed = false; // once good again, never turns evil from eating
        this.dead = false;
        this._chaseBoost = 1;
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

        // Enough affection turns an evil fish good again, permanently.
        if (this.isPredator && !this.isMonster && !this.isRainbow && !this.redeemed) {
            this.evilPetCount++;
            if (this.evilPetCount >= CONFIG.petsToRedeem) this.redeem();
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
        if (this.redeemed || this.isMonster || this.isRainbow) return;
        this.redeemed = true;
        this.isPredator = false;
        this.prey = null;
        this.evilPetCount = 0;
        this.baseSpeed = Math.max(this.type.speed[0], this.baseSpeed / 1.12);
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
        water.disturb(this.x, this.y, this.size * 0.7, 120);
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

    grow(amount) {
        if (this.golden || this.isRainbow) return;
        this.size = Math.min(CONFIG.maxFishSize, this.size + amount);
        // Redeemed fish keep growing but never turn evil again.
        if (this.redeemed || this.isMonster) return;
        if (!this.isPredator && this.size >= CONFIG.predatorSize) {
            this.isPredator = true;
            // Evil fish is slightly faster than a normal fish of its size class.
            // Species habits (dart, turn, wiggle) stay with the type.
            this.baseSpeed *= 1.12;
            this.evilPetCount = 0;
        }
    }

    // Ate a crocodile/alligator while larger than it: become a monster fish.
    becomeMonster() {
        this.isMonster = true;
        this.isPredator = true;
        this.isRainbow = false;
        this.golden = false;
        this.target = null;
        this.prey = null;
        this.size = Math.min(CONFIG.maxFishSize, this.size + 28);
        this.baseSpeed = Math.max(this.baseSpeed, 48) * 1.35;
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        Audio.predatorEat(pan);
        Audio.sharkStrike(pan);
        water.disturb(this.x, this.y, this.size, 500);
        spawnSplash(this.x, this.y, this.size * 0.7, 0.9);
    }

    // Eating golden food: freeze into gold and settle on the lakebed until refresh.
    turnToGold() {
        this.golden = true;
        this.isPredator = false;
        this.isRainbow = false;
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
        this.golden = false;
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

    // Victory lap: script a rainbow trail that spells "Easter Egg", then glide away.
    beginRainbowExit() {
        this.rainbowLeaving = true;
        this.rainbowPhase = "write";
        rainbowScriptTrail.length = 0;
        this.eggPath = buildEasterEggPath();
        this.eggIndex = 0;
        this.trailDrop = 0;
        this.erraticTimer = 0;
        this.prey = null;
        this.target = null;
        this.petTimer = 0;
        this._exitDir = undefined;
        this._lastStrokeId = -1;
        if (this.eggPath.length) {
            const first = this.eggPath[0];
            // Start near the first letter so writing begins immediately.
            this.x = first.x;
            this.y = first.y;
            this.dir = 0;
            pushRainbowTrail(this.x, this.y, 8, first.strokeId);
            this._lastStrokeId = first.strokeId;
        }
    }

    // Nearest threat: whale, shark, reptiles (if bigger), larger predators, rainbow/monster.
    findThreat() {
        if (this.golden || this.isRainbow || this.isMonster) return null;
        if (whale && !whale.dead) {
            const d = Math.hypot(whale.x - this.x, whale.y - this.y);
            if (d < CONFIG.fleeRange * 2.2) return { x: whale.x, y: whale.y };
        }
        if (shark && !shark.dead && !shark.leaving) {
            const d = Math.hypot(shark.x - this.x, shark.y - this.y);
            if (d < CONFIG.fleeRange * 1.6) return { x: shark.x, y: shark.y };
        }
        // Flee reptiles only if they are larger than us.
        for (const r of reptiles) {
            if (r.dead) continue;
            if (this.size > r.size * 1.02) continue;
            const d = Math.hypot(r.x - this.x, r.y - this.y);
            if (d < CONFIG.fleeRange * 1.8) return { x: r.x, y: r.y };
        }
        let best = null, bd = CONFIG.fleeRange;
        for (const p of fishes) {
            if (p === this || p.dead || p.golden) continue;
            const scary = p.isRainbow || p.isMonster
                || (p.isPredator && p.size > this.size * 1.05);
            if (!scary) continue;
            const d = Math.hypot(p.x - this.x, p.y - this.y);
            if (d < bd) { bd = d; best = p; }
        }
        return best ? { x: best.x, y: best.y } : null;
    }

    // Nearest reptile we can eat (we must be bigger).
    findEdibleReptile() {
        let best = null, bd = CONFIG.huntRange * 1.3;
        for (const r of reptiles) {
            if (r.dead) continue;
            if (this.size <= r.size) continue;
            const d = Math.hypot(r.x - this.x, r.y - this.y);
            if (d < bd) { bd = d; best = r; }
        }
        return best;
    }

    // Hunt target: smaller fish (including evil fish). Rainbow hunts anyone else.
    findPrey() {
        let best = null, bd = CONFIG.huntRange * (this.isRainbow || this.isMonster ? 1.4 : 1);
        for (const p of fishes) {
            if (p === this || p.dead || p.golden || p.isRainbow || p.isMonster) continue;
            if (this.isRainbow || this.isMonster) {
                // Apex forms eat everyone else.
            } else if (p.size >= this.size * 0.95) {
                continue; // only eat clearly smaller fish (predator cannibalism)
            }
            const d = Math.hypot(p.x - this.x, p.y - this.y);
            if (d < bd) { bd = d; best = p; }
        }
        return best;
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

        // Golden fish sink to the lakebed and stay there until the page refreshes.
        if (this.golden) {
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

        // Rainbow victory lap: scripted "Easter Egg" writing, then exit with afterglow.
        if (this.rainbowLeaving) {
            freeRoam = true;
            if (this.rainbowPhase === "write" && this.eggPath && this.eggIndex < this.eggPath.length) {
                // Direct path follow (not chase AI) so the letters actually form.
                let budget = 340 * dt;
                this.trailDrop -= dt;
                while (budget > 0 && this.eggIndex < this.eggPath.length) {
                    const wp = this.eggPath[this.eggIndex];
                    const dx = wp.x - this.x;
                    const dy = wp.y - this.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < 3.5) {
                        this.eggIndex++;
                        continue;
                    }
                    if (wp.strokeId !== this._lastStrokeId) {
                        // Pen-up between strokes: hop without connecting the trail.
                        this.x = wp.x;
                        this.y = wp.y;
                        this._lastStrokeId = wp.strokeId;
                        this.eggIndex++;
                        pushRainbowTrail(this.x, this.y, 8, wp.strokeId);
                        continue;
                    }
                    const step = Math.min(budget, dist);
                    this.x += (dx / dist) * step;
                    this.y += (dy / dist) * step;
                    this.dir = Math.atan2(dy, dx);
                    budget -= step;
                    if (this.trailDrop <= 0) {
                        this.trailDrop = 0.014;
                        pushRainbowTrail(this.x, this.y, 8, wp.strokeId);
                    }
                    if (step >= dist - 0.01) this.eggIndex++;
                }
                this.tailPhase += dt * 10;
                if (Math.random() < 0.25) {
                    water.disturb(this.x, this.y, 6, 28);
                }
                if (this.eggIndex >= this.eggPath.length) {
                    this.rainbowPhase = "exit";
                    this._exitDir = undefined;
                    // Afterglow: keep the finished letters for a few seconds, then fade.
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
            speed = this.baseSpeed * CONFIG.rainbowSpeed * 1.2;
            this.trailDrop -= dt;
            if (this.trailDrop <= 0) {
                this.trailDrop = 0.04;
                pushRainbowTrail(this.x, this.y, 2.8, 999);
            }
            const m = this.size * 2;
            if (this.x < -m || this.x > viewW + m || this.y < -m || this.y > viewH + m) {
                this.dead = true;
            }
        } else if (this.petTimer > 0 && !this.isRainbow && !this.isMonster) {
            desired = this.wander(dt);
            speed = this.baseSpeed * 0.25;
        } else {
            const threat = this.findThreat();
            // Even evil fish flee from something bigger (or a rainbow / shark).
            if (threat) {
                desired = Math.atan2(this.y - threat.y, this.x - threat.x);
                speed = this.baseSpeed * CONFIG.fleeSpeedMult;
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
                        if (!this.prey || this.prey.dead || this.prey.golden) this.prey = this.findPrey();
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
                            if (!this.prey || this.prey.dead || this.prey.golden) this.prey = this.findPrey();
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
        }

        // Species dart habit still shows on evil forms (not rainbow: keeps tracking stable).
        if (this.type.dart && this.petTimer <= 0 && !this.rainbowLeaving && !this.isRainbow) {
            speed *= 1 + 0.5 * Math.max(0, Math.sin(this.age * 6));
        }

        // Steer away from the banks (unless exiting or locked on a chase).
        if (!freeRoam && !hardChase) {
            const margin = 60;
            if (this.x < margin) desired = 0;
            else if (this.x > viewW - margin) desired = Math.PI;
            if (this.y < margin) desired = Math.PI / 2;
            else if (this.y > viewH - margin) desired = -Math.PI / 2;
        }

        // Softly steer around solid debris unless mid rainbow exit.
        if (!freeRoam) {
            const avoid = obstacleAvoidDir(this.x, this.y, this.size * 0.4);
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

        const chunk = Math.min(this.type.bite, food.amount);
        food.amount -= chunk;
        food.biteCount++;
        this.biteTimer = food.biteInterval();
        this.grow(chunk * 0.22);
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
        if (prey.golden || prey.isRainbow) return;
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
        Audio.rainbowChime(pan);
        water.disturb(shark.x, shark.y, shark.size * 0.7, 900);
        spawnSplash(shark.x, shark.y, 34, 1);
        shark.dead = true;
        shark = null;
        if (this.isMonster) {
            beginPovAttack(this);
        } else {
            this.beginRainbowExit();
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
            : shape === "koi" ? 0.62
            : 0.5;
        const L = this.size;
        const W = this.size * 0.5 * slim;
        const wigAmt = this.golden ? 0 : (this.type.wiggle || 1);
        const wig = Math.sin(this.tailPhase) * 0.5 * wigAmt;
        const sink = this.golden ? (this.sinkDepth || 0) : 0;

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
        }

        ctx.save();
        ctx.translate(this.x, this.y + (this.golden ? sink * 6 : 0));
        const s = 1 - sink * 0.35;
        ctx.scale(s, s);
        ctx.rotate(this.dir);
        // Golden fish settle on the lakebed and stay visible (dimmer) until refresh.
        ctx.globalAlpha = this.golden
            ? (0.42 + 0.38 * (1 - sink))
            : 0.9;

        if (this.golden) {
            ctx.shadowColor = `rgba(255,215,90,${0.55 * (1 - sink * 0.7)})`;
            ctx.shadowBlur = 10 * (1 - sink * 0.5);
        } else if (this.isRainbow) {
            ctx.shadowColor = "rgba(255,100,255,0.85)";
            ctx.shadowBlur = 18;
        } else if (this.isMonster) {
            ctx.shadowColor = "rgba(80,0,20,0.85)";
            ctx.shadowBlur = 20;
        } else if (this.isPredator) {
            ctx.shadowColor = "rgba(160,20,30,0.75)";
            ctx.shadowBlur = 14;
        } else {
            ctx.shadowColor = "rgba(20,50,70,0.6)";
            ctx.shadowBlur = 8;
        }

        // Tail by shape.
        ctx.fillStyle = body;
        ctx.beginPath();
        if (shape === "koi" || shape === "longfin") {
            ctx.moveTo(-L * 0.42, 0);
            ctx.quadraticCurveTo(-L * 0.7, -W * (1.4 + wig * 0.4), -L * 1.05, -W * (1.1 + wig));
            ctx.quadraticCurveTo(-L * 0.75, 0, -L * 1.05, W * (1.1 + wig));
            ctx.quadraticCurveTo(-L * 0.7, W * (1.4 + wig * 0.4), -L * 0.42, 0);
        } else if (shape === "diamond") {
            ctx.moveTo(-L * 0.35, 0);
            ctx.lineTo(-L * 0.7, -W * 1.4);
            ctx.lineTo(-L * 0.55, 0);
            ctx.lineTo(-L * 0.7, W * 1.4);
            ctx.closePath();
        } else {
            ctx.moveTo(-L * 0.5, 0);
            ctx.lineTo(-L * 0.85, -W * 0.9 + wig * W);
            ctx.lineTo(-L * 0.85, W * 0.9 + wig * W);
            ctx.closePath();
        }
        ctx.fill();

        // Body.
        const g = ctx.createLinearGradient(0, -W, 0, W);
        g.addColorStop(0, body);
        g.addColorStop(1, belly);
        ctx.fillStyle = g;
        ctx.beginPath();
        if (shape === "diamond") {
            ctx.moveTo(L * 0.5, 0);
            ctx.lineTo(0, -W * 1.15);
            ctx.lineTo(-L * 0.4, 0);
            ctx.lineTo(0, W * 1.15);
            ctx.closePath();
        } else if (shape === "round") {
            ctx.ellipse(0, 0, L * 0.42, W * 1.15, 0, 0, Math.PI * 2);
        } else if (shape === "koi") {
            ctx.ellipse(0, 0, L * 0.52, W, 0, 0, Math.PI * 2);
        } else if (shape === "slim") {
            ctx.ellipse(0, 0, L * 0.58, W * 0.85, 0, 0, Math.PI * 2);
        } else {
            ctx.ellipse(0, 0, L * 0.55, W, 0, 0, Math.PI * 2);
        }
        ctx.fill();

        // Koi / catfish whiskers.
        if ((shape === "koi" || this.type.whiskers) && !this.golden) {
            ctx.strokeStyle = "rgba(40,30,20,0.55)";
            ctx.lineWidth = Math.max(0.8, L * 0.03);
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(L * 0.35, W * 0.15);
            ctx.quadraticCurveTo(L * 0.55, W * 0.45, L * 0.48, W * 0.7);
            ctx.moveTo(L * 0.35, -W * 0.05);
            ctx.quadraticCurveTo(L * 0.55, W * 0.15, L * 0.52, W * 0.35);
            ctx.stroke();
        }

        // Longfin top sail.
        if (shape === "longfin") {
            ctx.fillStyle = body;
            ctx.globalAlpha *= 0.75;
            ctx.beginPath();
            ctx.moveTo(-L * 0.1, -W * 0.6);
            ctx.quadraticCurveTo(L * 0.05, -W * 1.8, L * 0.25, -W * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha /= 0.75;
        }

        if (!this.golden && !this.isRainbow && !this.isMonster) this.drawPattern(ctx, L, W);

        if (this.isMonster) {
            ctx.fillStyle = "rgba(120,0,30,0.28)";
            ctx.beginPath();
            ctx.ellipse(0, 0, L * 0.55, W, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.isPredator && !this.isRainbow && !this.golden) {
            ctx.fillStyle = "rgba(120,10,20,0.22)";
            ctx.beginPath();
            ctx.ellipse(0, 0, L * 0.55, W, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.shadowBlur = 0;
        const eyeX = L * (shape === "diamond" ? 0.22 : 0.32);
        const eyeY = -W * (shape === "round" ? 0.15 : 0.24);
        const eyeR = Math.max(1, L * 0.06);
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
            ctx.fillStyle = this.golden
                ? "rgba(120,80,20,0.9)"
                : this.isRainbow ? "rgba(255,255,255,0.95)"
                : this.isMonster ? "rgba(255,40,40,0.95)"
                : this.isPredator ? "rgba(255,60,40,0.95)" : "rgba(10,15,20,0.9)";
            ctx.beginPath();
            ctx.arc(eyeX, eyeY, eyeR, 0, Math.PI * 2);
            ctx.fill();
            if (this.isRainbow) {
                ctx.fillStyle = `hsl(${(this.age * 200) % 360}, 90%, 45%)`;
                ctx.beginPath();
                ctx.arc(eyeX, eyeY, eyeR * 0.45, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
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
}

// ===========================================================================
// REPTILES, SHARK, WHALE + ECOSYSTEM
// Rare crocodiles/alligators arrive on a long timer. They eat smaller fish.
// A fish that outgrows and eats one becomes a monster, which later eats the
// shark and then swims into the camera (POV) to "eat the user" and reset.
// ===========================================================================
let shark = null;
let whale = null;
let reptiles = [];
let povAttack = null; // { fish, t }
let repopulating = false;
let repopTimer = 0;
let whaleCheckTimer = 0;
let reptileCheckTimer = 0;

class Reptile {
    constructor(kind) {
        // kind: "crocodile" (narrow snout) or "alligator" (broad snout)
        this.kind = kind || (Math.random() < 0.5 ? "crocodile" : "alligator");
        this.size = rand(CONFIG.reptileSize[0], CONFIG.reptileSize[1]);
        this.tailPhase = Math.random() * Math.PI * 2;
        this.dead = false;
        this.eatPulse = 0;
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

    update(dt) {
        this.tailPhase += dt * 3.2;
        this.eatPulse -= dt;

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

        let desired = this.dir;
        let speed = this.speed * 0.55;
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

        const margin = 50;
        if (this.x < margin) desired = 0;
        else if (this.x > viewW - margin) desired = Math.PI;
        if (this.y < margin) desired = Math.PI / 2;
        else if (this.y > viewH - margin) desired = -Math.PI / 2;

        const diff = normAngle(desired - this.dir);
        this.dir += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
        this.x += Math.cos(this.dir) * speed * dt;
        this.y += Math.sin(this.dir) * speed * dt;
        this.x = Math.max(8, Math.min(viewW - 8, this.x));
        this.y = Math.max(8, Math.min(viewH - 8, this.y));
        resolveObstacleOverlap(this, this.size * 0.32);

        if (Math.random() < 0.35) {
            water.disturb(this.x - Math.cos(this.dir) * this.size * 0.4,
                          this.y - Math.sin(this.dir) * this.size * 0.4, 10, 45);
        }
    }

    draw(ctx) {
        const L = this.size;
        const W = this.size * (this.kind === "alligator" ? 0.34 : 0.28);
        const wig = Math.sin(this.tailPhase) * 0.3;
        const snout = this.kind === "alligator" ? 0.22 : 0.32; // croc longer/narrower
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.dir);
        ctx.globalAlpha = 0.9;
        ctx.shadowColor = "rgba(20,40,25,0.45)";
        ctx.shadowBlur = 14;

        // Tail.
        ctx.fillStyle = "#3d5a38";
        ctx.beginPath();
        ctx.moveTo(-L * 0.4, 0);
        ctx.lineTo(-L * 0.85, -W * 0.7 + wig * W);
        ctx.lineTo(-L * 0.7, 0);
        ctx.lineTo(-L * 0.85, W * 0.7 + wig * W);
        ctx.closePath();
        ctx.fill();

        // Body.
        const g = ctx.createLinearGradient(0, -W, 0, W);
        g.addColorStop(0, "#4a6b42");
        g.addColorStop(0.55, "#2f4630");
        g.addColorStop(1, "#6f8a5a");
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
        ctx.fillStyle = "rgba(30,50,28,0.55)";
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.ellipse(i * L * 0.1, -W * 0.55, L * 0.04, L * 0.03, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Eye.
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#c8b020";
        ctx.beginPath();
        ctx.arc(L * 0.22, -W * 0.35, Math.max(1.5, L * 0.03), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.arc(L * 0.22, -W * 0.35, Math.max(0.8, L * 0.015), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function beginPovAttack(fish) {
    if (povAttack) return;
    povAttack = { fish, t: 0 };
    fish.petTimer = 0;
    fish.target = null;
    fish.prey = null;
    Audio.sharkStrike(0);
    Audio.predatorEat(0);
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
    shark = null;
    whale = null;
    reptiles.length = 0;
    fishes.length = 0;
    foods.length = 0;
    rocks.length = 0;
    droplets.length = 0;
    rainbowScriptTrail.length = 0;
    grabbedObstacle = null;
    petStreak = 0;
    guaranteeRainbow = false;
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

        if (this.leaving) {
            this.x += Math.cos(this.dir) * 120 * dt;
            this.y += Math.sin(this.dir) * 120 * dt;
            const m = this.size * 2;
            if (this.x < -m || this.x > viewW + m || this.y < -m || this.y > viewH + m) {
                this.dead = true;
            }
            return;
        }

        if (!this.target || this.target.dead) {
            this.target = nearestFish(this.x, this.y);
            if (!this.target) { this.startLeaving(); return; }
        }

        let desired = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        const avoid = obstacleAvoidDir(this.x, this.y, this.size * 0.35);
        if (avoid != null && this.rollTimer <= 0) desired = avoid;
        const diff = normAngle(desired - this.dir);
        this.dir += Math.max(-1.4 * dt, Math.min(1.4 * dt, diff));
        const spd = this.rollTimer > 0 ? 130 : 95;
        this.x += Math.cos(this.dir) * spd * dt;
        this.y += Math.sin(this.dir) * spd * dt;
        resolveObstacleOverlap(this, this.size * 0.32);

        if (this.rollTimer <= 0) {
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
                if (Math.hypot(f.x - this.x, f.y - this.y) < mouth) {
                    f.dead = true;
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
        ctx.restore();
    }
}

// Create a fish at a random bank, swimming inward (for repopulation).
function edgeFish() {
    const type = FISH_TYPES[Math.floor(Math.random() * FISH_TYPES.length)];
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
        if (!whale && !shark && !repopulating && !rainbowExiting && !povAttack
            && swimmers.length > 0 && Math.random() < CONFIG.whaleChance) {
            whale = new Whale();
        }
    }

    // Rare crocodile / alligator: small chance every five minutes.
    reptileCheckTimer += dt;
    if (reptileCheckTimer >= CONFIG.reptileInterval) {
        reptileCheckTimer = 0;
        if (!whale && !shark && !repopulating && !povAttack
            && reptiles.length === 0 && swimmers.length > 2
            && Math.random() < CONFIG.reptileChance) {
            reptiles.push(new Reptile());
        }
    }

    for (const r of reptiles) r.update(dt);
    for (let i = reptiles.length - 1; i >= 0; i--) {
        if (reptiles[i].dead) reptiles.splice(i, 1);
    }

    if (whale) {
        whale.update(dt);
        if (whale.dead) {
            whale = null;
            if (fishes.filter((f) => !f.dead).length === 0) {
                repopulating = true;
                repopTimer = 0.8;
            }
        }
    }

    if (shark) {
        shark.update(dt);
        if (shark.dead) {
            shark = null;
            if (!rainbowExiting && !hasMonster && alive.filter((f) => !f.golden).length === 0) {
                repopulating = true;
                repopTimer = 0.8;
            }
        }
    } else if (!whale && !repopulating && !rainbowExiting && !povAttack
        && swimmers.length === 1 && alive.filter((f) => !f.golden).length === 1) {
        // Last swimmer remaining (rainbow or monster included): summon the shark.
        shark = new Shark(swimmers[0]);
    } else if (!repopulating && !shark && !whale && !povAttack && !rainbowExiting
        && swimmers.length === 0) {
        // Restock when no swimmers remain (golden resting fish do not block this).
        repopulating = true;
        repopTimer = 0.8;
    }

    if (repopulating) {
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
let firstInteractionDone = false;

// Normalized size in [0,1] from how long the button has been held.
function chargeFromHold(heldSec, ev) {
    let v = CONFIG.minCharge + heldSec / CONFIG.holdGrowTime;
    if (ev && typeof ev.pressure === "number" && ev.pressure > 0 && ev.pressure < 1) {
        v = Math.max(v, ev.pressure);
    }
    return clamp01(v);
}

function onPointerDown(ev) {
    Audio.ensure();
    // Right click: drag solid debris, or pet whale / shark / fish.
    if (ev.button === 2) {
        ev.preventDefault();
        if (mode !== "pond") return;
        const ob = obstacleAt(ev.clientX, ev.clientY);
        if (ob) {
            grabbedObstacle = ob;
            grabOffset = { x: ob.x - ev.clientX, y: ob.y - ev.clientY };
            water.disturb(ob.x, ob.y, obstacleRadius(ob) * 0.6, 80);
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
    if (mode === "pond" && (ev.buttons & 2)) {
        if (grabbedObstacle) {
            const pad = 24;
            grabbedObstacle.x = Math.max(pad, Math.min(viewW - pad, ev.clientX + grabOffset.x));
            grabbedObstacle.y = Math.max(pad, Math.min(viewH - pad, ev.clientY + grabOffset.y));
            if (Math.random() < 0.35) {
                water.disturb(grabbedObstacle.x, grabbedObstacle.y, obstacleRadius(grabbedObstacle) * 0.45, 55);
            }
            return;
        }
        petPondLifeAt(ev.clientX, ev.clientY, true);
    }
}
function onPointerUp(ev) {
    if (ev.button === 2) {
        if (grabbedObstacle) {
            water.disturb(grabbedObstacle.x, grabbedObstacle.y, obstacleRadius(grabbedObstacle) * 0.7, 120);
            grabbedObstacle = null;
        }
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

// Right-click pets: whale and shark first (larger targets), then ordinary fish.
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
window.addEventListener("pointercancel", () => { grabbedObstacle = null; });

// ===========================================================================
// MODE TOGGLE (single click = switch surface, double click = ambient bed)
// ===========================================================================
const toggle = document.getElementById("mode-toggle");
toggle.addEventListener("click", () => {
    mode = mode === "window" ? "pond" : "window";
    document.body.classList.toggle("pond", mode === "pond");
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
        // Advance the water twice per frame for smoother, faster wave travel.
        water.step();
        water.step();
        water.render(ctx);

        // Shore and bank scenery sit under the swimming life.
        drawShoreStones(ctx, dt);
        drawSticks(ctx, dt);
        drawReeds(ctx, sceneryTime, dt);
        drawCattails(ctx, sceneryTime, dt);
        drawObstacles(ctx, dt);
        // Green-food plants stay permanently (until refresh).
        drawPondPlants(ctx, sceneryTime, dt);

        updateDroplets(dt);
        updateRainbowTrail(dt);

        // Fish live beneath the surface, so draw them first.
        if (!povAttack) {
            for (const fish of fishes) fish.update(dt);
        }
        manageEcosystem(dt); // predators, shark, reptiles, POV finale
        for (let i = fishes.length - 1; i >= 0; i--) {
            if (fishes[i].dead) fishes.splice(i, 1);
        }
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

        for (const rk of rocks) rk.update(dt);
        for (let i = rocks.length - 1; i >= 0; i--) {
            if (rocks[i].dead) rocks.splice(i, 1);
        }
        for (const rk of rocks) rk.draw(ctx);
        drawDroplets(ctx);
        if (!povAttack) drawCharge(ctx);

        // Vignette for depth.
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, viewW, viewH);
        ctx.restore();

        // Monster POV finale draws on top of everything.
        if (povAttack) drawPovAttack(ctx);
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
requestAnimationFrame(frame);
