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
    fishCount: 11,          // fish the pond settles at when populated
    perception: 300,        // px within which a fish notices food
    maxFoods: 28,           // floating food pellets cap
    predatorSize: 40,       // size at which a well-fed fish turns predator
    maxFishSize: 74,        // cap so a predator cannot grow without limit
    sharkSize: 96,          // the shark's body length
    fleeRange: 210,         // px within which prey flee a predator/shark
    huntRange: 340,         // px within which a predator/shark spots prey
    repopInterval: 1.1,     // seconds between new fish swimming in
    fleeSpeedMult: 1.85,    // how much faster than cruising a fleeing fish is
    predatorChaseMult: 2.05,// predator chase: slightly faster than flee, so evil fish catch prey
    goldenChance: 0.012,    // rare chance a piece of food is the golden kind
    rainbowChance: 0.004,   // even rarer: rainbow food (must stay below goldenChance)
    goldSinkTime: 2.2,      // seconds for a golden fish to sink and vanish
    rainbowSpeed: 3.4,      // rainbow fish chase multiplier (incredibly fast)
    predatorFoodBoost: 1.045, // each food bite makes an evil fish a bit faster
    predatorSpeedCap: 95,   // max baseSpeed an evil fish can reach from food
    whaleChance: 0.004,     // rare whale visit chance (checked every whaleInterval)
    whaleInterval: 10,      // seconds between whale chance rolls
};

// Scales: fish bites walk up these for melodic runs.
const PENTATONIC = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
const MINOR_PENT = [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5];

// Fish species. Each has its own LOOK (plus optional color pattern), musical
// voice, and swimming habit. Patterns stay visible even when a fish turns evil.
const FISH_TYPES = [
    { name: "koi",    body: "#e8853a", belly: "#ffd9a8", pattern: "blotches", patternColor: "#f5f0e6", size: [17, 23], speed: [26, 42], wave: "sine",     register: 1.0,  bite: 6, dur: 0.4,  turn: 3.0, wiggle: 1.0, scale: PENTATONIC },
    { name: "carp",   body: "#5f7d8f", belly: "#c3dbe8", pattern: "scales",   patternColor: "#7a9aaa", size: [23, 31], speed: [18, 30], wave: "triangle", register: 0.5,  bite: 9, dur: 0.6,  turn: 2.0, wiggle: 0.8, scale: PENTATONIC },
    { name: "minnow", body: "#d6e6f2", belly: "#ffffff", pattern: null,       patternColor: null,      size: [10, 14], speed: [42, 62], wave: "sine",     register: 2.0,  bite: 3, dur: 0.22, turn: 5.0, wiggle: 1.4, dart: true, scale: PENTATONIC },
    { name: "tetra",  body: "#48b0c4", belly: "#d8f4ff", pattern: "stripe",   patternColor: "#1a3a55", size: [9, 13],  speed: [46, 66], wave: "square",   register: 1.5,  bite: 3, dur: 0.18, turn: 6.0, wiggle: 1.6, dart: true, scale: PENTATONIC },
    { name: "eel",    body: "#4a5d3a", belly: "#9fb27a", pattern: "bands",    patternColor: "#2d3a22", size: [26, 36], speed: [16, 26], wave: "sawtooth", register: 0.75, bite: 7, dur: 0.8,  turn: 2.4, wiggle: 2.4, slim: 0.62, scale: MINOR_PENT },
    { name: "angel",  body: "#c9a24b", belly: "#fff0c2", pattern: "spots",    patternColor: "#7a5520", size: [16, 21], speed: [22, 34], wave: "triangle", register: 1.25, bite: 5, dur: 0.5,  turn: 2.6, wiggle: 0.9, scale: PENTATONIC },
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

    // The core: physics -> a voice. `plunk` adds a short filtered-noise splash
    // transient for rocks hitting water.
    function playDrop(params) {
        ensure();
        if (actx.state === "suspended") actx.resume();
        if (voiceCount >= CONFIG.maxVoices) return; // hard cap on node churn

        const t0 = actx.currentTime;
        const { freq, decay, velocity, pan, plunk } = params;
        const tail = Math.min(6, Math.log(1000) / decay);

        const voice = actx.createGain();
        voice.gain.value = 0.0001;
        const peak = 0.15 + velocity * 0.22;
        voice.gain.setValueAtTime(0.0001, t0);
        voice.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
        voice.gain.exponentialRampToValueAtTime(0.0001, t0 + tail);

        const filter = actx.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.value = 0.7;
        const cutoffStart = Math.min(16000, freq * 8 + 800);
        const cutoffEnd = Math.max(freq, 200);
        filter.frequency.setValueAtTime(cutoffStart, t0);
        filter.frequency.exponentialRampToValueAtTime(cutoffEnd, t0 + tail * 0.6);

        const fund = actx.createOscillator();
        fund.type = "sine";
        fund.frequency.value = freq;

        const partial = actx.createOscillator();
        partial.type = "triangle";
        partial.frequency.value = freq * 3;
        partial.detune.value = 6;
        const partialGain = actx.createGain();
        partialGain.gain.setValueAtTime(peak * 0.35, t0);
        partialGain.gain.exponentialRampToValueAtTime(0.0001, t0 + tail * 0.45);

        const panner = actx.createStereoPanner();
        panner.pan.value = pan;

        fund.connect(filter);
        partial.connect(partialGain);
        partialGain.connect(filter);
        filter.connect(voice);
        voice.connect(panner);
        panner.connect(master);
        panner.connect(reverbSend);

        // Splash transient: a short burst of low, filtered noise = the "ploomp".
        let noiseSrc = null;
        if (plunk) {
            noiseSrc = actx.createBufferSource();
            noiseSrc.buffer = noiseBuf;
            const nf = actx.createBiquadFilter();
            nf.type = "lowpass";
            nf.frequency.value = Math.max(300, freq * 2);
            const ng = actx.createGain();
            ng.gain.setValueAtTime(peak * 0.8, t0);
            ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
            noiseSrc.connect(nf);
            nf.connect(ng);
            ng.connect(panner);
            noiseSrc.start(t0);
            noiseSrc.stop(t0 + 0.2);
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

    // A fish taking a bite. Sweeter and more sustained than an impact so a run
    // of bites reads as a little melody. Timbre/register come from the species.
    function fishNote({ freq, wave, pan, dur, level }) {
        ensure();
        if (actx.state === "suspended") actx.resume();
        if (voiceCount >= CONFIG.maxVoices) return;
        const t0 = actx.currentTime;

        const osc = actx.createOscillator();
        osc.type = wave || "sine";
        osc.frequency.value = freq;

        // A soft second partial an octave up for a bell-like sweetness.
        const partial = actx.createOscillator();
        partial.type = "sine";
        partial.frequency.value = freq * 2;
        const partialGain = actx.createGain();
        partialGain.gain.value = level * 0.18;

        const filter = actx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = Math.min(9000, freq * 6 + 600);
        filter.Q.value = 0.6;

        const g = actx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(level, t0 + 0.02);
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
        goldChime,
        rainbowChime,
        whaleCall,
        toggleAmbient,
        onModeChange: applyAmbientForMode,
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
function sound(x, y, v, plunk) {
    let freq = velocityToFrequency(v);
    freq = quantizePitch(x, y, freq);
    registerTone(x, y, freq);
    const pan = Math.max(-1, Math.min(1, (x / viewW) * 2 - 1));
    Audio.playDrop({ freq, decay: velocityToDecay(v), velocity: v, pan, plunk });
    return freq;
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
            // Base pond color as a soft vertical gradient (far darker, near richer).
            const ty = y / rows;
            const baseR = 6 + ty * 4;
            const baseG = 18 + ty * 10;
            const baseB = 24 + ty * 10;
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
        // Rare special pellets: rainbow is rarer than gold; never both.
        const roll = Math.random();
        this.rainbow = roll < CONFIG.rainbowChance;
        this.golden = !this.rainbow && roll < CONFIG.rainbowChance + CONFIG.goldenChance;
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
        sound(this.tx, this.ty, this.v, true);
        spawnSplash(this.tx, this.ty, this.size, this.v);
        // The rock is now fish food resting on the surface.
        // Always place it: if at the cap, drop the oldest pellet first so throws
        // never silently vanish.
        while (foods.length >= CONFIG.maxFoods) {
            foods.shift();
        }
        foods.push(new Food(this.tx, this.ty, this.size, this.golden, this.rainbow));
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

        // The food pellet itself: brown, golden, or rainbow.
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
    constructor(x, y, size, golden, rainbow) {
        this.x = x;
        this.y = y;
        this.size = size;        // original size, sets how hard it is to finish
        this.amount = size;      // remaining, shrinks as it is eaten
        this.biteCount = 0;      // sequences the melodic run across all bites
        this.phase = Math.random() * Math.PI * 2;
        this.golden = !!golden;  // golden food turns whoever eats it to gold
        this.rainbow = !!rainbow; // rainbow food turns whoever eats it into a rainbow fish
        this.eaten = false;
        this.age = 0;
        // Larger pellets are heavier: they float for less time before sinking.
        // size ~7 -> ~14s float; size ~31 -> ~4s float.
        this.floatLife = Math.max(3.2, 15.5 - size * 0.38);
        this.sinkProgress = 0;   // 0..1 while going under
        this.sinking = false;
    }
    // Bigger food = slower bites (harder to eat).
    biteInterval() { return 0.3 + this.size * 0.035; }
    radius() { return Math.max(1.2, (3 + this.amount * 0.34) * (1 - this.sinkProgress * 0.55)); }
    update(dt) {
        this.age += dt;
        this.phase += dt * 2.2;

        if (!this.sinking && this.age >= this.floatLife) {
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
        // Pellet: brown normally, glowing gold or rainbow if rare.
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
        this.rainbowLeaving = false;
        this.erraticTimer = 0;
        this.golden = false;  // turned to gold and sinking
        this.sinkTimer = 0;
        this.sinkDepth = 0;
        this.petTimer = 0;    // >0 means being petted: closed eyes, calm
        this.dead = false;
    }

    pet() {
        if (this.dead || this.golden || this.rainbowLeaving) return;
        this.petTimer = 1.4;
        // Soft contented note while being petted.
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        Audio.fishNote({
            freq: 320 * (this.type.register || 1),
            wave: "sine",
            pan,
            dur: 0.35,
            level: 0.06,
        });
        // Tiny affectionate ripple.
        water.disturb(this.x, this.y, this.size * 0.4, 40);
    }

    grow(amount) {
        if (this.golden || this.isRainbow) return;
        this.size = Math.min(CONFIG.maxFishSize, this.size + amount);
        if (!this.isPredator && this.size >= CONFIG.predatorSize) {
            this.isPredator = true;
            // Evil fish is slightly faster than a normal fish of its size class.
            // Species habits (dart, turn, wiggle) stay with the type.
            this.baseSpeed *= 1.12;
        }
    }

    // Eating golden food: freeze into gold and sink, too heavy to swim.
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

    // Eating rainbow food: become an ultra-fast apex predator.
    turnToRainbow() {
        this.isRainbow = true;
        this.isPredator = true;
        this.golden = false;
        this.target = null;
        this.prey = null;
        this.rainbowLeaving = false;
        this.baseSpeed = Math.max(this.baseSpeed, 55) * 1.8;
        this.size = Math.max(this.size, 36);
        const pan = Math.max(-1, Math.min(1, (this.x / viewW) * 2 - 1));
        Audio.rainbowChime(pan);
        water.disturb(this.x, this.y, this.size * 1.4, 360);
        spawnSplash(this.x, this.y, this.size * 0.7, 0.8);
    }

    // Start the victory lap: erratic swim, then leave the screen for a restock.
    beginRainbowExit() {
        this.rainbowLeaving = true;
        this.erraticTimer = 2.4;
        this.prey = null;
        this.target = null;
        this.petTimer = 0;
    }

    // Nearest threat: whale, shark (unless rainbow), larger predators, or a rainbow fish.
    findThreat() {
        if (this.golden || this.isRainbow) return null;
        if (whale && !whale.dead) {
            const d = Math.hypot(whale.x - this.x, whale.y - this.y);
            if (d < CONFIG.fleeRange * 2.2) return { x: whale.x, y: whale.y };
        }
        if (shark && !shark.dead && !shark.leaving) {
            const d = Math.hypot(shark.x - this.x, shark.y - this.y);
            if (d < CONFIG.fleeRange * 1.6) return { x: shark.x, y: shark.y };
        }
        let best = null, bd = CONFIG.fleeRange;
        for (const p of fishes) {
            if (p === this || p.dead || p.golden) continue;
            // Everyone flees from rainbow; smaller fish flee larger predators
            // (including evil-on-evil when the other is bigger).
            const scary = p.isRainbow || (p.isPredator && p.size > this.size * 1.05);
            if (!scary) continue;
            const d = Math.hypot(p.x - this.x, p.y - this.y);
            if (d < bd) { bd = d; best = p; }
        }
        return best ? { x: best.x, y: best.y } : null;
    }

    // Hunt target: smaller fish (including evil fish). Rainbow hunts anyone else.
    findPrey() {
        let best = null, bd = CONFIG.huntRange * (this.isRainbow ? 1.4 : 1);
        for (const p of fishes) {
            if (p === this || p.dead || p.golden || p.isRainbow) continue;
            if (this.isRainbow) {
                // Rainbow eats everyone else.
            } else if (p.size >= this.size * 0.95) {
                continue; // only eat clearly smaller fish (predator cannibalism)
            }
            const d = Math.hypot(p.x - this.x, p.y - this.y);
            if (d < bd) { bd = d; best = p; }
        }
        return best;
    }

    tryBiteFood(dt) {
        if (!this.target || this.target.eaten) {
            this.target = nearestFood(this.x, this.y, CONFIG.perception);
        }
        if (!this.target) return false;
        const desired = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
        const eatDist = this.size * 0.5 + this.target.radius() + 4;
        this.biteTimer -= dt;
        if (dist < eatDist && this.biteTimer <= 0) this.bite();
        return { desired, speedMult: 1.5 };
    }

    update(dt) {
        this.age += dt;
        if (this.petTimer > 0) this.petTimer = Math.max(0, this.petTimer - dt);

        // Golden fish can no longer swim: they sink under their own weight.
        if (this.golden) {
            this.sinkTimer += dt;
            this.sinkDepth = Math.min(1, this.sinkTimer / CONFIG.goldSinkTime);
            if (Math.random() < 0.08) {
                water.disturb(this.x, this.y, this.size * (1 - this.sinkDepth * 0.5), 40);
            }
            if (this.sinkTimer >= CONFIG.goldSinkTime) this.dead = true;
            return;
        }

        let speed = this.baseSpeed;
        let desired = this.dir;
        let freeRoam = false; // when leaving, ignore bank steering

        // Rainbow victory lap: erratic dashes, then exit off-screen.
        if (this.rainbowLeaving) {
            this.erraticTimer -= dt;
            if (this.erraticTimer > 0) {
                this.wanderTimer -= dt;
                if (this.wanderTimer <= 0) {
                    this.wanderTimer = 0.12 + Math.random() * 0.18;
                    this._wanderDir = Math.random() * Math.PI * 2;
                }
                desired = this._wanderDir !== undefined ? this._wanderDir : this.dir;
                speed = this.baseSpeed * CONFIG.rainbowSpeed * 1.1;
            } else {
                freeRoam = true;
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
                speed = this.baseSpeed * CONFIG.rainbowSpeed * 1.3;
                const m = this.size * 2;
                if (this.x < -m || this.x > viewW + m || this.y < -m || this.y > viewH + m) {
                    this.dead = true;
                }
            }
        } else if (this.petTimer > 0 && !this.isRainbow) {
            desired = this.wander(dt);
            speed = this.baseSpeed * 0.25;
        } else {
            const threat = this.findThreat();
            // Even evil fish flee from something bigger (or a rainbow / shark).
            if (threat) {
                desired = Math.atan2(this.y - threat.y, this.x - threat.x);
                speed = this.baseSpeed * CONFIG.fleeSpeedMult;
            } else if (this.isPredator || this.isRainbow) {
                // Rainbow's endgame: hunt the shark instead of fleeing.
                if (this.isRainbow && shark && !shark.dead && !shark.leaving) {
                    desired = Math.atan2(shark.y - this.y, shark.x - this.x);
                    speed = this.baseSpeed * CONFIG.rainbowSpeed;
                    const dist = Math.hypot(shark.x - this.x, shark.y - this.y);
                    if (dist < this.size * 0.5 + shark.size * 0.45 + 10) this.eatShark();
                } else {
                    if (!this.prey || this.prey.dead || this.prey.golden) this.prey = this.findPrey();
                    if (this.prey) {
                        desired = Math.atan2(this.prey.y - this.y, this.prey.x - this.x);
                        speed = this.baseSpeed * (this.isRainbow
                            ? CONFIG.rainbowSpeed
                            : CONFIG.predatorChaseMult);
                        const dist = Math.hypot(this.prey.x - this.x, this.prey.y - this.y);
                        if (dist < this.size * 0.5 + this.prey.size * 0.5 + 6) this.eatFish(this.prey);
                    } else {
                        // Evil fish (and rainbow) still eat fish food when nothing to hunt.
                        const foodChase = this.tryBiteFood(dt);
                        if (foodChase) {
                            desired = foodChase.desired;
                            speed = this.baseSpeed * foodChase.speedMult * (this.isRainbow ? 1.4 : 1);
                        } else {
                            desired = this.wander(dt);
                            speed = this.baseSpeed * (this.isRainbow ? 1.2 : 0.7);
                        }
                    }
                }
            } else {
                const foodChase = this.tryBiteFood(dt);
                if (foodChase) {
                    desired = foodChase.desired;
                    speed = this.baseSpeed * foodChase.speedMult;
                } else {
                    desired = this.wander(dt);
                    speed = this.baseSpeed * 0.6;
                }
            }
        }

        // Species dart habit still shows on evil / rainbow forms.
        if (this.type.dart && this.petTimer <= 0 && !this.rainbowLeaving) {
            speed *= 1 + 0.5 * Math.max(0, Math.sin(this.age * 6));
        }

        // Steer away from the banks (unless exiting the pond).
        if (!freeRoam) {
            const margin = 60;
            if (this.x < margin) desired = 0;
            else if (this.x > viewW - margin) desired = Math.PI;
            if (this.y < margin) desired = Math.PI / 2;
            else if (this.y > viewH - margin) desired = -Math.PI / 2;
        }

        // Turn rate from species habit; rainbow turns harder while erratic.
        const turnRate = (this.type.turn || 3) * (this.rainbowLeaving && this.erraticTimer > 0 ? 2.5 : 1);
        const turn = turnRate * dt;
        const diff = normAngle(desired - this.dir);
        this.dir += Math.max(-turn, Math.min(turn, diff));

        this.x += Math.cos(this.dir) * speed * dt;
        this.y += Math.sin(this.dir) * speed * dt;
        if (!freeRoam) {
            this.x = Math.max(6, Math.min(viewW - 6, this.x));
            this.y = Math.max(6, Math.min(viewH - 6, this.y));
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
        Audio.fishNote({ freq, wave: this.type.wave, pan, dur: this.type.dur, level: 0.14 });

        this.x += Math.cos(this.dir) * 3;
        this.y += Math.sin(this.dir) * 3;

        if (food.amount <= 0) {
            food.eaten = true;
            water.disturb(food.x, food.y, this.size, 200);
            Audio.fishNote({
                freq: 220 * this.type.register * 0.5,
                wave: this.type.wave, pan, dur: this.type.dur * 1.4, level: 0.16,
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
        this.beginRainbowExit();
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
        const L = this.size;
        const W = this.size * 0.5 * (this.type.slim || 1);
        const wigAmt = this.golden ? 0 : (this.type.wiggle || 1);
        const wig = Math.sin(this.tailPhase) * 0.5 * wigAmt;
        const sink = this.golden ? (this.sinkDepth || 0) : 0;

        // Keep species coloration when evil; rainbow overrides with a shifting hue.
        let body = this.type.body;
        let belly = this.type.belly;
        if (this.golden) {
            body = "#f0c437";
            belly = "#fff3b0";
        } else if (this.isRainbow) {
            const hue = (this.age * 140) % 360;
            body = `hsl(${hue}, 85%, 55%)`;
            belly = `hsl(${(hue + 40) % 360}, 90%, 75%)`;
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        const s = 1 - sink * 0.45;
        ctx.scale(s, s);
        ctx.rotate(this.dir);
        ctx.globalAlpha = 0.9 * (1 - sink);

        if (this.golden) {
            ctx.shadowColor = "rgba(255,215,90,0.95)";
            ctx.shadowBlur = 16 * (1 - sink);
        } else if (this.isRainbow) {
            ctx.shadowColor = "rgba(255,100,255,0.85)";
            ctx.shadowBlur = 18;
        } else if (this.isPredator) {
            // Evil: keep the species look, add a red menace glow.
            ctx.shadowColor = "rgba(160,20,30,0.75)";
            ctx.shadowBlur = 14;
        } else {
            ctx.shadowColor = "rgba(20,50,70,0.6)";
            ctx.shadowBlur = 8;
        }

        // Tail.
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(-L * 0.5, 0);
        ctx.lineTo(-L * 0.85, -W * 0.9 + wig * W);
        ctx.lineTo(-L * 0.85, W * 0.9 + wig * W);
        ctx.closePath();
        ctx.fill();

        // Body with a paler belly.
        const g = ctx.createLinearGradient(0, -W, 0, W);
        g.addColorStop(0, body);
        g.addColorStop(1, belly);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, L * 0.55, W, 0, 0, Math.PI * 2);
        ctx.fill();

        // Species color patterns stay visible on evil fish.
        if (!this.golden && !this.isRainbow) this.drawPattern(ctx, L, W);

        // Evil fish: a faint dark-red wash so they still read as dangerous.
        if (this.isPredator && !this.isRainbow && !this.golden) {
            ctx.fillStyle = "rgba(120,10,20,0.22)";
            ctx.beginPath();
            ctx.ellipse(0, 0, L * 0.55, W, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Eye: open normally, closed into a soft arc while being petted.
        ctx.shadowBlur = 0;
        const eyeX = L * 0.32;
        const eyeY = -W * 0.24;
        const eyeR = Math.max(1, L * 0.06);
        if (this.petTimer > 0 && !this.golden && !this.isRainbow) {
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
// SHARK + ECOSYSTEM
// When the pond is down to its last fish, a shark slides in from the edge,
// hunts it down, and, once the water is empty, leaves. Then fish gradually
// swim back in from the banks until the pond is full again.
// ===========================================================================
let shark = null;
let whale = null;
let repopulating = false;
let repopTimer = 0;
let whaleCheckTimer = 0;

class Shark {
    constructor(target) {
        this.size = CONFIG.sharkSize;
        this.tailPhase = 0;
        this.leaving = false;
        this.dead = false;
        // Enter from a random edge, off-screen.
        const side = Math.floor(Math.random() * 4);
        if (side === 0) { this.x = -this.size; this.y = Math.random() * viewH; }
        else if (side === 1) { this.x = viewW + this.size; this.y = Math.random() * viewH; }
        else if (side === 2) { this.x = Math.random() * viewW; this.y = -this.size; }
        else { this.x = Math.random() * viewW; this.y = viewH + this.size; }
        this.target = target;
        this.dir = target ? Math.atan2(target.y - this.y, target.x - this.x) : 0;
    }

    update(dt) {
        this.tailPhase += dt * (this.leaving ? 10 : 8);

        if (this.leaving) {
            this.x += Math.cos(this.dir) * 190 * dt;
            this.y += Math.sin(this.dir) * 190 * dt;
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

        const desired = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        const diff = normAngle(desired - this.dir);
        this.dir += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
        this.x += Math.cos(this.dir) * 155 * dt;
        this.y += Math.sin(this.dir) * 155 * dt;

        const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
        if (dist < this.size * 0.5 + this.target.size * 0.5 + 8) this.eat(this.target);

        // A heavy wake.
        if (Math.random() < 0.6) {
            water.disturb(this.x - Math.cos(this.dir) * this.size * 0.5,
                          this.y - Math.sin(this.dir) * this.size * 0.5, 12, 70);
        }
    }

    eat(fish) {
        // Rainbow fish cannot be eaten by the shark; they eat the shark instead.
        if (fish.isRainbow) return;
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
        const W = this.size * 0.42;
        const wig = Math.sin(this.tailPhase) * 0.5;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.dir);
        ctx.globalAlpha = 0.95;
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = 16;

        // Crescent tail.
        ctx.fillStyle = "#39424b";
        ctx.beginPath();
        ctx.moveTo(-L * 0.5, 0);
        ctx.lineTo(-L * 0.82, -W * 0.9 + wig * W);
        ctx.lineTo(-L * 0.66, 0);
        ctx.lineTo(-L * 0.82, W * 0.9 + wig * W);
        ctx.closePath();
        ctx.fill();

        // Body.
        const g = ctx.createLinearGradient(0, -W, 0, W);
        g.addColorStop(0, "#4c545c");
        g.addColorStop(0.62, "#3b434b");
        g.addColorStop(1, "#9099a2");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, L * 0.5, W, 0, 0, Math.PI * 2);
        ctx.fill();
        // Pointed snout.
        ctx.beginPath();
        ctx.moveTo(L * 0.42, -W * 0.5);
        ctx.lineTo(L * 0.72, 0);
        ctx.lineTo(L * 0.42, W * 0.5);
        ctx.closePath();
        ctx.fill();

        // Dorsal fin.
        ctx.beginPath();
        ctx.moveTo(0, -W * 0.7);
        ctx.lineTo(-L * 0.14, -W * 1.8);
        ctx.lineTo(-L * 0.24, -W * 0.7);
        ctx.closePath();
        ctx.fill();
        // Pectoral fin.
        ctx.beginPath();
        ctx.moveTo(L * 0.06, W * 0.55);
        ctx.lineTo(-L * 0.12, W * 1.3);
        ctx.lineTo(-L * 0.16, W * 0.55);
        ctx.closePath();
        ctx.fill();

        // Eye.
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#0a0d10";
        ctx.beginPath();
        ctx.arc(L * 0.34, -W * 0.22, Math.max(1.5, L * 0.04), 0, Math.PI * 2);
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
        // Enter from left or right, swim across.
        this.fromLeft = Math.random() < 0.5;
        this.x = this.fromLeft ? -this.size : viewW + this.size;
        this.y = viewH * (0.35 + Math.random() * 0.3);
        this.dir = this.fromLeft ? 0 : Math.PI;
        this.speed = 95;
        Audio.whaleCall(this.fromLeft ? -0.4 : 0.4);
        water.disturb(this.x, this.y, this.size * 0.4, 500);
    }

    update(dt) {
        this.tailPhase += dt * 5;
        this.eatPulse -= dt;
        this.x += Math.cos(this.dir) * this.speed * dt;
        // Gentle vertical drift.
        this.y += Math.sin(this.tailPhase * 0.35) * 18 * dt;

        // Swallow every living fish in a wide mouth radius.
        const mouth = this.size * 0.55;
        for (const f of fishes) {
            if (f.dead) continue;
            if (Math.hypot(f.x - this.x, f.y - this.y) < mouth) {
                f.dead = true;
                if (this.eatPulse <= 0) {
                    const pan = Math.max(-1, Math.min(1, (f.x / viewW) * 2 - 1));
                    Audio.predatorEat(pan);
                    this.eatPulse = 0.12;
                }
                water.disturb(f.x, f.y, 20, 200);
            }
        }

        // Heavy wake.
        if (Math.random() < 0.7) {
            water.disturb(this.x - Math.cos(this.dir) * this.size * 0.4,
                          this.y, 18, 90);
        }

        const m = this.size * 1.2;
        if (this.x < -m || this.x > viewW + m) this.dead = true;
    }

    draw(ctx) {
        const L = this.size;
        const W = this.size * 0.32;
        const wig = Math.sin(this.tailPhase) * 0.35;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.dir);
        ctx.globalAlpha = 0.92;
        ctx.shadowColor = "rgba(0,20,40,0.5)";
        ctx.shadowBlur = 22;

        // Fluke.
        ctx.fillStyle = "#5a6a78";
        ctx.beginPath();
        ctx.moveTo(-L * 0.48, 0);
        ctx.lineTo(-L * 0.78, -W * 1.1 + wig * W);
        ctx.lineTo(-L * 0.62, 0);
        ctx.lineTo(-L * 0.78, W * 1.1 + wig * W);
        ctx.closePath();
        ctx.fill();

        // Body.
        const g = ctx.createLinearGradient(0, -W, 0, W);
        g.addColorStop(0, "#7a8b9a");
        g.addColorStop(0.55, "#5c6c7a");
        g.addColorStop(1, "#c5d0da");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, L * 0.48, W, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rounded snout.
        ctx.beginPath();
        ctx.ellipse(L * 0.42, 0, L * 0.18, W * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Small dorsal bump.
        ctx.beginPath();
        ctx.moveTo(-L * 0.05, -W * 0.85);
        ctx.lineTo(-L * 0.15, -W * 1.35);
        ctx.lineTo(-L * 0.28, -W * 0.85);
        ctx.closePath();
        ctx.fill();

        // Eye.
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#12161a";
        ctx.beginPath();
        ctx.arc(L * 0.28, -W * 0.25, Math.max(2, L * 0.025), 0, Math.PI * 2);
        ctx.fill();
        // Blowhole hint.
        ctx.fillStyle = "rgba(20,30,40,0.45)";
        ctx.beginPath();
        ctx.ellipse(-L * 0.05, -W * 0.7, L * 0.04, L * 0.015, 0, 0, Math.PI * 2);
        ctx.fill();
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
    // Sinking gold fish still count as "present" until they vanish.
    const alive = fishes.filter((f) => !f.dead);
    const swimmers = alive.filter((f) => !f.golden && !f.rainbowLeaving);
    const rainbowExiting = alive.some((f) => f.isRainbow && f.rainbowLeaving);

    // Rare whale visit: every whaleInterval seconds, a rainbow-tier roll.
    whaleCheckTimer += dt;
    if (whaleCheckTimer >= CONFIG.whaleInterval) {
        whaleCheckTimer = 0;
        if (!whale && !shark && !repopulating && !rainbowExiting
            && swimmers.length > 0 && Math.random() < CONFIG.whaleChance) {
            whale = new Whale();
        }
    }

    if (whale) {
        whale.update(dt);
        if (whale.dead) {
            whale = null;
            // Whatever remains after the sweep: if empty, restock.
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
            // Normal shark exit restocks; rainbow-eaten shark waits for the
            // rainbow fish to leave first (handled by the empty-pond check).
            if (!rainbowExiting && alive.filter((f) => !f.golden).length === 0) {
                repopulating = true;
                repopTimer = 0.8;
            }
        }
    } else if (!whale && !repopulating && !rainbowExiting && swimmers.length === 1
        && alive.filter((f) => !f.golden).length === 1) {
        // Last swimmer remaining (including a rainbow fish): summon the shark.
        shark = new Shark(swimmers[0]);
    } else if (!repopulating && !shark && !whale && alive.length === 0) {
        // Pond empty (gold sink, rainbow exit, whale, or shark wipe): restock.
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
    // Right click (or two-finger on some pads): pet the nearest fish.
    if (ev.button === 2) {
        ev.preventDefault();
        if (mode === "pond") petFishAt(ev.clientX, ev.clientY);
        return;
    }
    pointerDownAt = { x: ev.clientX, y: ev.clientY, t: performance.now() };
    pointerNow = { x: ev.clientX, y: ev.clientY };
}
function onPointerMove(ev) {
    pointerNow = { x: ev.clientX, y: ev.clientY };
    // Dragging with right button keeps petting as you stroke across fish.
    if (mode === "pond" && (ev.buttons & 2)) {
        petFishAt(ev.clientX, ev.clientY, true);
    }
}
function onPointerUp(ev) {
    // Ignore right-button release: pets are handled on down/move.
    if (ev.button === 2) return;
    const x = ev.clientX;
    const y = ev.clientY;
    if (!pointerDownAt) return;

    const held = (performance.now() - pointerDownAt.t) / 1000;
    const v = chargeFromHold(held, ev);

    if (mode === "pond") {
        // Drag = sling the food across the water from where you started.
        let sx = x, sy = y;
        const dx = x - pointerDownAt.x;
        const dy = y - pointerDownAt.y;
        if (Math.hypot(dx, dy) > 8) { sx = pointerDownAt.x; sy = pointerDownAt.y; }
        if (rocks.length < CONFIG.maxRocks) rocks.push(new Rock(sx, sy, x, y, v));
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

function petFishAt(x, y, quiet) {
    let best = null;
    let bestD = 48; // must click fairly near a fish
    for (const f of fishes) {
        if (f.dead || f.golden) continue;
        const d = Math.hypot(x - f.x, y - f.y);
        const reach = Math.max(28, f.size * 0.9);
        if (d < reach && d < bestD) { bestD = d; best = f; }
    }
    if (!best) return;
    // While stroking, only refresh the expression if it is fading out.
    if (quiet && best.petTimer > 0.6) {
        best.petTimer = 1.4;
        return;
    }
    best.pet();
    if (!firstInteractionDone) {
        firstInteractionDone = true;
        const hint = document.getElementById("hint");
        if (hint) {
            hint.classList.add("gone");
            setTimeout(() => hint.remove(), 1100);
        }
    }
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

// ===========================================================================
// RENDER LOOP
// ===========================================================================
let lastFrame = performance.now();

function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    if (mode === "pond") {
        // Advance the water twice per frame for smoother, faster wave travel.
        water.step();
        water.step();
        water.render(ctx);

        updateDroplets(dt);

        // Fish live beneath the surface, so draw them first.
        for (const fish of fishes) fish.update(dt);
        manageEcosystem(dt); // predators, shark, and repopulation
        for (let i = fishes.length - 1; i >= 0; i--) {
            if (fishes[i].dead) fishes.splice(i, 1);
        }
        for (const fish of fishes) fish.draw(ctx);
        if (shark) shark.draw(ctx);
        if (whale) whale.draw(ctx);

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
        drawCharge(ctx);

        // Vignette for depth.
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, viewW, viewH);
        ctx.restore();
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
initFish();
requestAnimationFrame(frame);
