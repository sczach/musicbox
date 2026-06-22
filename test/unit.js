#!/usr/bin/env node
// Pure-function unit tests for euclidean, normalizeTrack, and buildMidiEvents.
// No browser globals needed — functions are copied/re-derived here for Node.
'use strict';

let pass = 0, fail = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else { console.error(`  ✗ ${name}`); fail++; }
}
function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ================================================================
// euclidean — Bjorklund/Euclidean rhythm generator
// ================================================================
function euclidean(pulses, steps, offset) {
  offset = offset || 0; pulses = Math.max(0, Math.min(pulses, steps));
  if (!pulses) return [];
  if (pulses >= steps) return Array.from({ length: steps }, (_, i) => ((i + offset) % steps) + 1);
  const pat = [], counts = [], rems = [];
  let div = steps - pulses; rems.push(pulses); let lv = 0;
  do { counts.push(Math.floor(div / rems[lv])); rems.push(div % rems[lv]); div = rems[lv]; lv++; } while (rems[lv] > 1);
  counts.push(div);
  function build(l) { if (l === -1) pat.push(0); else if (l === -2) pat.push(1); else { for (let i = 0; i < counts[l]; i++) build(l - 1); if (rems[l] !== 0) build(l - 2); } }
  build(lv);
  const res = [];
  for (let i = 0; i < pat.length; i++) if (pat[(i - offset + pat.length) % pat.length] === 1) res.push(i + 1);
  return res;
}

console.log('\neuclidean:');
assert('E(0,16) returns empty', deepEqual(euclidean(0, 16), []));
assert('E(16,16) returns all 16 steps', deepEqual(euclidean(16, 16), [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]));
assert('E(4,16) has exactly 4 hits', euclidean(4, 16).length === 4);
assert('E(4,16,0) distributes 4 pulses evenly — returns [4,8,12,16]', deepEqual(euclidean(4, 16, 0), [4, 8, 12, 16]));
assert('E(3,8,0) 3-in-8 — returns [2,5,8]', deepEqual(euclidean(3, 8, 0), [2, 5, 8]));
assert('all results are within 1..steps', euclidean(5, 12, 2).every(s => s >= 1 && s <= 12));
assert('no duplicate steps', (() => { const r = euclidean(7, 16, 0); return new Set(r).size === r.length; })());

// ================================================================
// normalizeTrack
// ================================================================
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function inferTrackRole(track) {
  const label = `${track.name || ''} ${track.role || ''}`.toLowerCase();
  if (/kick|bass drum/.test(label)) return 'kick';
  if (/snare|clap/.test(label)) return 'snare';
  if (/hi.?hat|hat|cymbal/.test(label)) return 'hat';
  if (/shaker|tambourine|cabasa/.test(label)) return 'shaker';
  if (/bass/.test(label)) return 'bass';
  if (/chord|pad|harmonic|harmony/.test(label)) return 'harmonic';
  if (/lead|melody|melodic/.test(label)) return 'melody';
  if (/midi|pro 3|synth/.test(label)) return 'midi';
  return 'percussion';
}

function normalizeTrack(track) {
  const role = track.roleType || inferTrackRole(track);
  const isPro3 = /pro 3/i.test(`${track.name || ''} ${track.desc || ''}`);
  const target = track.target || (isPro3 ? 'pro3-usb' : role === 'midi' ? 'digitakt-midi' : 'digitakt-audio');
  const midiChannel = clamp(Number(track.midiChannel || (isPro3 ? 1 : track.id)) || 1, 1, 16);
  const note = clamp(Number(track.note || 60) || 60, 0, 127);
  const velocity = clamp(Number(track.velocity || 100) || 100, 1, 127);
  const lanes = {
    probability: { ...((track.lanes && track.lanes.probability) || {}) },
    condition: { ...((track.lanes && track.lanes.condition) || {}) },
  };
  return { ...track, roleType: role, target, midiChannel, note, velocity, lanes };
}

console.log('\nnormalizeTrack:');
assert('target defaults to digitakt-audio for drum tracks',
  normalizeTrack({ id: 1, name: 'Kick', role: 'Drum' }).target === 'digitakt-audio');
assert('target is pro3-usb when name contains "Pro 3"',
  normalizeTrack({ id: 16, name: 'Pro 3 Bass', role: 'MIDI gate' }).target === 'pro3-usb');
assert('target is digitakt-midi when name contains "MIDI"',
  normalizeTrack({ id: 15, name: 'MIDI Synth', role: 'MIDI out' }).target === 'digitakt-midi');
assert('midiChannel clamps below 1 to 1',
  normalizeTrack({ id: 1, name: 'X', midiChannel: -5 }).midiChannel === 1);
assert('midiChannel clamps above 16 to 16',
  normalizeTrack({ id: 1, name: 'X', midiChannel: 99 }).midiChannel === 16);
assert('note clamps below 0 to 0',
  normalizeTrack({ id: 1, name: 'X', note: -1 }).note === 0);
assert('note clamps above 127 to 127',
  normalizeTrack({ id: 1, name: 'X', note: 200 }).note === 127);
assert('velocity 0 (falsy/unset) defaults to 100',
  normalizeTrack({ id: 1, name: 'X', velocity: 0 }).velocity === 100);
assert('velocity clamps above 127 to 127',
  normalizeTrack({ id: 1, name: 'X', velocity: 255 }).velocity === 127);
assert('existing fields are preserved',
  (() => { const t = normalizeTrack({ id: 3, name: 'Snare', role: 'Hit', steps: [5, 13] }); return t.steps[0] === 5 && t.id === 3; })());

// ================================================================
// buildMidiEvents — minimal version extracted for testability
// ================================================================
function buildMidiEvents(tracks, bpm, loops, startAt, defaultLen) {
  // defaultLen replaces the global GENRES[S.genre].defaultLen dependency
  let maxStep = defaultLen || 16;
  tracks.forEach(t => { if (t.steps && t.steps.length) maxStep = Math.max(maxStep, ...t.steps); });
  const patLen = Math.ceil(maxStep / 16) * 16;
  const msPerStep = (60 / bpm / 4) * 1000;
  const patDuration = msPerStep * patLen;
  const totalDuration = patDuration * loops;
  const msPerClock = (60 / bpm / 24) * 1000;
  const events = [{ bytes: [0xFA], at: startAt }];
  const clockCount = Math.ceil(totalDuration / msPerClock) + 32;
  for (let i = 0; i < clockCount; i++) events.push({ bytes: [0xF8], at: startAt + i * msPerClock });
  for (let loop = 0; loop < loops; loop++) {
    const lo = loop * patDuration;
    tracks.forEach(track => {
      if (!track.steps || !track.steps.length) return;
      const ch = clamp(Number(track.midiChannel) || 1, 1, 16) - 1;
      const note = clamp(Number(track.note) || 60, 0, 127);
      const velocity = clamp(Number(track.velocity) || 100, 1, 127);
      track.steps.forEach(step => {
        if (step < 1 || step > patLen) return;
        const onset = startAt + lo + (step - 1) * msPerStep;
        events.push({ bytes: [0x90 | ch, note, velocity], at: onset });
        events.push({ bytes: [0x80 | ch, note, 0], at: onset + msPerStep * 0.45 });
      });
    });
  }
  events.push({ bytes: [0xFC], at: startAt + totalDuration + msPerStep });
  return { events, totalDuration, msPerStep, patLen };
}

const track1 = normalizeTrack({ id: 1, name: 'Kick', midiChannel: 1, note: 36, velocity: 110, steps: [1, 5, 9, 13] });

console.log('\nbuildMidiEvents:');
assert('returns events array', Array.isArray(buildMidiEvents([track1], 120, 1, 0, 16).events));
assert('first event is MIDI Start (0xFA)', buildMidiEvents([track1], 120, 1, 0, 16).events[0].bytes[0] === 0xFA);
assert('last event is MIDI Stop (0xFC)', (() => { const e = buildMidiEvents([track1], 120, 1, 0, 16).events; return e[e.length - 1].bytes[0] === 0xFC; })());
assert('noteOn count equals steps × loops', (() => {
  const { events } = buildMidiEvents([track1], 120, 2, 0, 16);
  return events.filter(e => (e.bytes[0] & 0xF0) === 0x90).length === 4 * 2;
})());
assert('noteOff count equals steps × loops', (() => {
  const { events } = buildMidiEvents([track1], 120, 2, 0, 16);
  return events.filter(e => (e.bytes[0] & 0xF0) === 0x80).length === 4 * 2;
})());
assert('patLen is 16 for 16-step pattern', buildMidiEvents([track1], 120, 1, 0, 16).patLen === 16);
assert('empty tracks produce only clock+transport events', (() => {
  const { events } = buildMidiEvents([{ steps: [] }], 120, 1, 0, 16);
  return events.every(e => e.bytes[0] === 0xFA || e.bytes[0] === 0xF8 || e.bytes[0] === 0xFC);
})());
assert('note is clamped in output bytes', (() => {
  const t = normalizeTrack({ id: 1, name: 'X', note: 200, velocity: 100, steps: [1] });
  const { events } = buildMidiEvents([t], 120, 1, 0, 16);
  const on = events.find(e => (e.bytes[0] & 0xF0) === 0x90);
  return on && on.bytes[1] === 127;
})());

// ================================================================
// mulberry32 seeded RNG
// ================================================================
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

console.log('\nmulberry32 seeded RNG:');
assert('output is in [0,1)', (() => { const rng = mulberry32(42); for (let i = 0; i < 100; i++) { const v = rng(); if (v < 0 || v >= 1) return false; } return true; })());
assert('same seed produces same sequence', (() => {
  const r1 = mulberry32(12345), r2 = mulberry32(12345);
  for (let i = 0; i < 20; i++) if (r1() !== r2()) return false;
  return true;
})());
assert('different seeds produce different sequences', (() => {
  const r1 = mulberry32(1), r2 = mulberry32(2);
  const seq1 = Array.from({ length: 10 }, r1);
  const seq2 = Array.from({ length: 10 }, r2);
  return seq1.some((v, i) => v !== seq2[i]);
})());
assert('generateTrackSteps is deterministic with seeded rng', (() => {
  // Re-derive generateTrackSteps with rng param (same logic as source)
  const GEN_PARAMS_KICK = { kick: [3, 5], percussion: [1, 3], pLen: 16 };
  function gts(type, pLen, params, rng) {
    rng = rng || Math.random.bind(Math);
    if (type === 'texture') return [];
    const range = params[type] || (Array.isArray(params.percussion) ? params.percussion : [1, 3]);
    if (!Array.isArray(range)) return [];
    const [mn, mx] = range;
    if (mx === 0) return [];
    const pulses = mn === mx ? mn : mn + Math.floor(rng() * (mx - mn + 1));
    if (pulses === 0) return [];
    const maxOff = Math.max(1, Math.floor(pLen / pulses));
    const offset = Math.floor(rng() * maxOff);
    return euclidean(pulses, pLen, offset);
  }
  const r1 = mulberry32(99999), r2 = mulberry32(99999);
  const s1 = gts('kick', 16, GEN_PARAMS_KICK, r1);
  const s2 = gts('kick', 16, GEN_PARAMS_KICK, r2);
  return deepEqual(s1, s2);
})());

// ================================================================
// normalizeTrack — lanes.probability
// ================================================================
console.log('\nnormalizeTrack lanes:');
assert('normalizeTrack adds lanes.probability object',
  typeof normalizeTrack({ id: 1, name: 'Kick' }).lanes.probability === 'object');
assert('existing lanes.probability is preserved',
  (() => {
    const t = normalizeTrack({ id: 1, name: 'Kick', lanes: { probability: { 1: 75, 5: 50 } } });
    return t.lanes.probability[1] === 75 && t.lanes.probability[5] === 50;
  })());
assert('missing probability key is not copied as undefined',
  normalizeTrack({ id: 1, name: 'Kick' }).lanes.probability[1] === undefined);
assert('normalizeTrack adds lanes.condition object',
  typeof normalizeTrack({ id: 1, name: 'Kick' }).lanes.condition === 'object');
assert('existing lanes.condition is preserved',
  (() => {
    const t = normalizeTrack({ id: 1, name: 'Kick', lanes: { condition: { 5: '1:2', 9: '1:4' } } });
    return t.lanes.condition[5] === '1:2' && t.lanes.condition[9] === '1:4';
  })());

// ================================================================
// buildMidiEvents — probability filtering
// ================================================================
// Extend buildMidiEvents to accept probability from lanes and an optional seeded rng
function buildMidiEventsWithProb(tracks, bpm, loops, startAt, defaultLen, rng) {
  rng = rng || Math.random.bind(Math);
  let maxStep = defaultLen || 16;
  tracks.forEach(t => { if (t.steps && t.steps.length) maxStep = Math.max(maxStep, ...t.steps); });
  const patLen = Math.ceil(maxStep / 16) * 16;
  const msPerStep = (60 / bpm / 4) * 1000;
  const patDuration = msPerStep * patLen;
  const totalDuration = patDuration * loops;
  const msPerClock = (60 / bpm / 24) * 1000;
  const events = [{ bytes: [0xFA], at: startAt }];
  const clockCount = Math.ceil(totalDuration / msPerClock) + 32;
  for (let i = 0; i < clockCount; i++) events.push({ bytes: [0xF8], at: startAt + i * msPerClock });
  for (let loop = 0; loop < loops; loop++) {
    const lo = loop * patDuration;
    tracks.forEach(track => {
      if (!track.steps || !track.steps.length) return;
      const ch = clamp(Number(track.midiChannel) || 1, 1, 16) - 1;
      const note = clamp(Number(track.note) || 60, 0, 127);
      const velocity = clamp(Number(track.velocity) || 100, 1, 127);
      track.steps.forEach(step => {
        if (step < 1 || step > patLen) return;
        const prob = track.lanes && track.lanes.probability && track.lanes.probability[step] != null
          ? track.lanes.probability[step] : 100;
        if (rng() * 100 >= prob) return;
        const onset = startAt + lo + (step - 1) * msPerStep;
        const tgt = track.target || 'digitakt-audio';
        events.push({ bytes: [0x90 | ch, note, velocity], at: onset, target: tgt });
        events.push({ bytes: [0x80 | ch, note, 0], at: onset + msPerStep * 0.45, target: tgt });
      });
    });
  }
  events.push({ bytes: [0xFC], at: startAt + totalDuration + msPerStep });
  return { events, totalDuration, msPerStep, patLen };
}

console.log('\nbuildMidiEvents probability:');
assert('prob=0 steps never fire (100 trials)', (() => {
  const t = normalizeTrack({ id: 1, name: 'Kick', midiChannel: 1, note: 36, velocity: 100,
    steps: [1], lanes: { probability: { 1: 0 } } });
  for (let i = 0; i < 100; i++) {
    const { events } = buildMidiEventsWithProb([t], 120, 1, 0, 16);
    if (events.some(e => (e.bytes[0] & 0xF0) === 0x90)) return false;
  }
  return true;
})());
assert('prob=100 steps always fire', (() => {
  const t = normalizeTrack({ id: 1, name: 'Kick', midiChannel: 1, note: 36, velocity: 100,
    steps: [1], lanes: { probability: { 1: 100 } } });
  for (let i = 0; i < 20; i++) {
    const { events } = buildMidiEventsWithProb([t], 120, 1, 0, 16);
    if (!events.some(e => (e.bytes[0] & 0xF0) === 0x90)) return false;
  }
  return true;
})());
assert('prob=50 fires roughly half the time (50 trials)', (() => {
  const t = normalizeTrack({ id: 1, name: 'Kick', midiChannel: 1, note: 36, velocity: 100,
    steps: [1], lanes: { probability: { 1: 50 } } });
  let hits = 0;
  for (let i = 0; i < 50; i++) {
    const { events } = buildMidiEventsWithProb([t], 120, 1, 0, 16);
    if (events.some(e => (e.bytes[0] & 0xF0) === 0x90)) hits++;
  }
  return hits >= 10 && hits <= 40; // generous range — just confirming it's stochastic
})());
assert('missing prob entry treated as 100% (always fires)', (() => {
  const t = normalizeTrack({ id: 1, name: 'Kick', midiChannel: 1, note: 36, velocity: 100, steps: [1] });
  for (let i = 0; i < 20; i++) {
    const { events } = buildMidiEventsWithProb([t], 120, 1, 0, 16);
    if (!events.some(e => (e.bytes[0] & 0xF0) === 0x90)) return false;
  }
  return true;
})());

// ================================================================
// buildMidiEvents — determinism with seeded RNG
// ================================================================
console.log('\nbuildMidiEvents determinism:');
assert('same seed + same tracks produce identical note-on events', (() => {
  const t = normalizeTrack({ id: 1, name: 'Kick', midiChannel: 1, note: 36, velocity: 100,
    steps: [1, 3, 5, 7, 9, 11, 13, 15], lanes: { probability: { 1: 75, 3: 50, 5: 25, 7: 75 } } });
  const seed = 0xDEADBEEF;
  const e1 = buildMidiEventsWithProb([t], 120, 4, 0, 16, mulberry32(seed)).events
    .filter(e => (e.bytes[0] & 0xF0) === 0x90).map(e => e.at);
  const e2 = buildMidiEventsWithProb([t], 120, 4, 0, 16, mulberry32(seed)).events
    .filter(e => (e.bytes[0] & 0xF0) === 0x90).map(e => e.at);
  return deepEqual(e1, e2);
})());
assert('different seeds produce different probability outcomes (multi-track)', (() => {
  const tracks = [
    normalizeTrack({ id: 1, name: 'Kick', midiChannel: 1, note: 36, velocity: 100,
      steps: [1,2,3,4,5,6,7,8], lanes: { probability: { 1:50,2:50,3:50,4:50,5:50,6:50,7:50,8:50 } } }),
    normalizeTrack({ id: 2, name: 'Snare', midiChannel: 2, note: 38, velocity: 100,
      steps: [1,2,3,4,5,6,7,8], lanes: { probability: { 1:50,2:50,3:50,4:50,5:50,6:50,7:50,8:50 } } }),
  ];
  let diffFound = false;
  for (let s = 0; s < 20; s++) {
    const e1 = buildMidiEventsWithProb(tracks, 120, 1, 0, 16, mulberry32(s)).events
      .filter(e => (e.bytes[0] & 0xF0) === 0x90).length;
    const e2 = buildMidiEventsWithProb(tracks, 120, 1, 0, 16, mulberry32(s + 100)).events
      .filter(e => (e.bytes[0] & 0xF0) === 0x90).length;
    if (e1 !== e2) { diffFound = true; break; }
  }
  return diffFound;
})());
assert('seeded prob=100 always fires regardless of seed', (() => {
  const t = normalizeTrack({ id: 1, name: 'Kick', midiChannel: 1, note: 36, velocity: 100,
    steps: [1], lanes: { probability: { 1: 100 } } });
  for (let seed = 0; seed < 20; seed++) {
    const { events } = buildMidiEventsWithProb([t], 120, 1, 0, 16, mulberry32(seed));
    if (!events.some(e => (e.bytes[0] & 0xF0) === 0x90)) return false;
  }
  return true;
})());
assert('seeded prob=0 never fires regardless of seed', (() => {
  const t = normalizeTrack({ id: 1, name: 'Kick', midiChannel: 1, note: 36, velocity: 100,
    steps: [1], lanes: { probability: { 1: 0 } } });
  for (let seed = 0; seed < 20; seed++) {
    const { events } = buildMidiEventsWithProb([t], 120, 1, 0, 16, mulberry32(seed));
    if (events.some(e => (e.bytes[0] & 0xF0) === 0x90)) return false;
  }
  return true;
})());
assert('repeated sends with same seed produce same event count across 4 loops', (() => {
  const t = normalizeTrack({ id: 1, name: 'Hat', midiChannel: 3, note: 42, velocity: 80,
    steps: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
    lanes: { probability: { 2:75,4:50,6:75,8:50,10:75,12:50,14:25,16:75 } } });
  const seed = 0x1337CAFE;
  const count1 = buildMidiEventsWithProb([t], 120, 4, 0, 16, mulberry32(seed))
    .events.filter(e => (e.bytes[0] & 0xF0) === 0x90).length;
  const count2 = buildMidiEventsWithProb([t], 120, 4, 0, 16, mulberry32(seed))
    .events.filter(e => (e.bytes[0] & 0xF0) === 0x90).length;
  return count1 === count2 && count1 > 0;
})());

// ================================================================
// evalCondition
// ================================================================
// Copy evalCondition for Node testing
function evalCondition(cond, loopIdx) {
  if (!cond) return true;
  if (cond === '1ST') return loopIdx === 0;
  if (cond === '!1ST') return loopIdx > 0;
  const m = cond.match(/^(\d+):(\d+)$/);
  if (m) { const x = parseInt(m[1]), n = parseInt(m[2]); return loopIdx % n === x - 1; }
  return true;
}

console.log('\nevalCondition:');
assert('null condition always fires', evalCondition(null, 0) && evalCondition(null, 99));
assert('1:2 fires on loops 0,2,4 only', [0,2,4].every(i=>evalCondition('1:2',i)) && ![1,3,5].some(i=>evalCondition('1:2',i)));
assert('2:2 fires on loops 1,3,5 only', [1,3,5].every(i=>evalCondition('2:2',i)) && ![0,2,4].some(i=>evalCondition('2:2',i)));
assert('1:4 fires on loops 0,4,8 only', [0,4,8].every(i=>evalCondition('1:4',i)) && ![1,2,3].some(i=>evalCondition('1:4',i)));
assert('3:4 fires on loops 2,6,10', [2,6,10].every(i=>evalCondition('3:4',i)) && ![0,1,3].some(i=>evalCondition('3:4',i)));
assert('1ST fires only on loop 0', evalCondition('1ST',0) && !evalCondition('1ST',1) && !evalCondition('1ST',7));
assert('!1ST fires on all loops except 0', !evalCondition('!1ST',0) && evalCondition('!1ST',1) && evalCondition('!1ST',7));
assert('2:3 fires on loops 1,4,7', [1,4,7].every(i=>evalCondition('2:3',i)) && ![0,2,3].some(i=>evalCondition('2:3',i)));

// ================================================================
// buildMidiEvents — per-target routing
// ================================================================
console.log('\nbuildMidiEvents target routing:');
assert('note events carry target from track', (() => {
  const t = normalizeTrack({ id: 1, name: 'Kick', midiChannel: 1, note: 36, velocity: 100,
    steps: [1], target: 'digitakt-audio' });
  const { events } = buildMidiEventsWithProb([t], 120, 1, 0, 16, mulberry32(1));
  const noteOn = events.find(e => (e.bytes[0] & 0xF0) === 0x90);
  return noteOn && noteOn.target === 'digitakt-audio';
})());
assert('pro3-usb track events carry pro3-usb target', (() => {
  const t = normalizeTrack({ id: 16, name: 'Pro 3 Bass', midiChannel: 1, note: 36, velocity: 100,
    steps: [1, 9] });
  const { events } = buildMidiEventsWithProb([t], 120, 1, 0, 16, mulberry32(1));
  const noteOns = events.filter(e => (e.bytes[0] & 0xF0) === 0x90);
  return noteOns.length === 2 && noteOns.every(e => e.target === 'pro3-usb');
})());
assert('external-midi track events carry external-midi target', (() => {
  const t = normalizeTrack({ id: 5, name: 'Ext synth', midiChannel: 3, note: 60, velocity: 100,
    steps: [1], target: 'external-midi' });
  const { events } = buildMidiEventsWithProb([t], 120, 1, 0, 16, mulberry32(1));
  const noteOn = events.find(e => (e.bytes[0] & 0xF0) === 0x90);
  return noteOn && noteOn.target === 'external-midi';
})());
assert('clock and transport events have no target property', (() => {
  const t = normalizeTrack({ id: 1, name: 'Kick', midiChannel: 1, note: 36, velocity: 100,
    steps: [1] });
  const { events } = buildMidiEventsWithProb([t], 120, 1, 0, 16, mulberry32(1));
  const clockTransport = events.filter(e => e.bytes[0] === 0xFA || e.bytes[0] === 0xF8 || e.bytes[0] === 0xFC);
  return clockTransport.length > 0 && clockTransport.every(e => e.target === undefined);
})());
assert('multi-target tracks each tag events with own target', (() => {
  const dtTrack = normalizeTrack({ id: 1, name: 'Kick', midiChannel: 10, note: 36, velocity: 100,
    steps: [1, 5], target: 'digitakt-audio' });
  const p3Track = normalizeTrack({ id: 16, name: 'Pro 3 Bass', midiChannel: 1, note: 48, velocity: 100,
    steps: [3, 11], target: 'pro3-usb' });
  const { events } = buildMidiEventsWithProb([dtTrack, p3Track], 120, 1, 0, 16, mulberry32(1));
  const noteOns = events.filter(e => (e.bytes[0] & 0xF0) === 0x90);
  const dtNotes = noteOns.filter(e => e.target === 'digitakt-audio');
  const p3Notes = noteOns.filter(e => e.target === 'pro3-usb');
  return dtNotes.length === 2 && p3Notes.length === 2;
})());

// ================================================================
// Arrangement / Aide composition suggestions
// (logic re-derived from the inline script, as elsewhere in this file)
// ================================================================
const ROLE_ENERGY_TIER = { kick:0.12, bass:0.18, snare:0.3, hat:0.32, shaker:0.32, percussion:0.34, harmonic:0.46, melody:0.5, midi:0.5, texture:0.08 };
function trackEnergyTier(track){ return ROLE_ENERGY_TIER[track.roleType || inferTrackRole(track)] ?? 0.4; }

function analyzeTracks(tracks){
  const active = (tracks||[]).filter(t => t.steps && t.steps.length);
  let trig = 0, energySum = 0; const roles = {};
  active.forEach(t => {
    const role = t.roleType || inferTrackRole(t);
    roles[role] = (roles[role]||0) + 1;
    const len = Math.max(16, Math.ceil(Math.max(...t.steps)/16)*16);
    trig += t.steps.length;
    energySum += (t.steps.length/len) * (1 + trackEnergyTier(t));
  });
  const total = (tracks||[]).length;
  const density = active.length / Math.max(1, total);
  const energy = clamp((energySum/Math.max(1,active.length)) * (0.45 + 0.55*density), 0, 1);
  return { active: active.length, total, trig, density, energy, roles,
    hasKick: !!roles.kick, hasBass: !!roles.bass,
    hasDrums: !!(roles.kick||roles.snare||roles.hat||roles.percussion||roles.shaker),
    hasMelodic: !!(roles.melody||roles.harmonic||roles.midi),
    textureHeavy: (roles.texture||0) >= Math.max(1, active.length)*0.5 };
}

function suggestSectionLabel(tracks){
  const a = analyzeTracks(tracks);
  let kind;
  if (a.active === 0) kind = 'intro';
  else if (a.textureHeavy && !a.hasDrums) kind = 'intro';
  else if (!a.hasDrums && a.hasMelodic) kind = 'breakdown';
  else if (a.energy >= 0.7 && a.hasKick && a.hasBass && a.hasMelodic) kind = 'drop';
  else if (a.energy >= 0.55 && a.hasKick && a.hasBass) kind = 'chorus';
  else if (a.hasKick && a.hasBass) kind = 'verse';
  else if (a.hasDrums) kind = 'build';
  else kind = 'bridge';
  return { kind, energy: Math.round(a.energy*100), analysis: a };
}

console.log('\nAide composition suggestions:');
assert('empty pattern → intro', suggestSectionLabel([]).kind === 'intro');
assert('texture-only (no drums) → intro', suggestSectionLabel([
  normalizeTrack({ id: 8, name: 'Atmosphere', role: 'texture', roleType: 'texture', steps: [1, 9] }),
]).kind === 'intro');
assert('melody without drums → breakdown', suggestSectionLabel([
  normalizeTrack({ id: 15, name: 'Lead Melody', role: 'lead', roleType: 'melody', steps: [1, 5, 9, 13] }),
  normalizeTrack({ id: 7, name: 'Chord', role: 'harmonic', roleType: 'harmonic', steps: [1, 9] }),
]).kind === 'breakdown');
assert('kick+bass moderate → verse/chorus (not drop)', (() => {
  const k = suggestSectionLabel([
    normalizeTrack({ id: 1, name: 'Kick', roleType: 'kick', steps: [1, 5, 9, 13] }),
    normalizeTrack({ id: 6, name: 'Bass', roleType: 'bass', steps: [1, 9] }),
  ]).kind;
  return k === 'verse' || k === 'chorus';
})());
assert('dense kick+bass+melody → drop', (() => {
  const full16 = Array.from({ length: 16 }, (_, i) => i + 1);
  return suggestSectionLabel([
    normalizeTrack({ id: 1, name: 'Kick', roleType: 'kick', steps: full16 }),
    normalizeTrack({ id: 6, name: 'Bass', roleType: 'bass', steps: full16 }),
    normalizeTrack({ id: 3, name: 'Hats', roleType: 'hat', steps: full16 }),
    normalizeTrack({ id: 15, name: 'Lead', roleType: 'melody', steps: full16 }),
    normalizeTrack({ id: 7, name: 'Chord', roleType: 'harmonic', steps: full16 }),
  ]).kind === 'drop';
})());
assert('energy is 0..100', (() => {
  const e = suggestSectionLabel([normalizeTrack({ id: 1, name: 'Kick', roleType: 'kick', steps: [1, 5, 9, 13] })]).energy;
  return e >= 0 && e <= 100;
})());
assert('foundational roles have lower energy tier than melodic', trackEnergyTier({ roleType: 'kick' }) < trackEnergyTier({ roleType: 'melody' }));

// ================================================================
// Summary
// ================================================================
console.log(`\n${pass} passed, ${fail} failed.`);
if (fail) process.exit(1);
