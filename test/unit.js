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
  const lanes = { probability: { ...((track.lanes && track.lanes.probability) || {}) } };
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

// ================================================================
// buildMidiEvents — probability filtering
// ================================================================
// Extend buildMidiEvents to accept probability from lanes
function buildMidiEventsWithProb(tracks, bpm, loops, startAt, defaultLen) {
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
        if (Math.random() * 100 >= prob) return;
        const onset = startAt + lo + (step - 1) * msPerStep;
        events.push({ bytes: [0x90 | ch, note, velocity], at: onset });
        events.push({ bytes: [0x80 | ch, note, 0], at: onset + msPerStep * 0.45 });
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
// Summary
// ================================================================
console.log(`\n${pass} passed, ${fail} failed.`);
if (fail) process.exit(1);
