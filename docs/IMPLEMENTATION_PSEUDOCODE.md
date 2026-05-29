# Implementation Pseudocode for the Next Production Pass

This file turns the product plan into concrete engineering pseudocode. The goal is to keep the browser app hardware-safe, deterministic, and easy to refactor away from the current single-file prototype.

## 1. State normalization and migration

```ts
function bootApp() {
  const saved = loadJson(STORAGE_KEY) ?? loadJson(LEGACY_STORAGE_KEY);
  const project = saved ? migrateProject(saved) : createDefaultProject();

  project.tracks = project.tracks.map(normalizeTrack);
  project.devices = detectLastKnownDevices(project.devices);

  renderShell(project);
  requestMidiAccess({ sysex: false });
}

function normalizeTrack(track) {
  return {
    id: track.id,
    name: track.name,
    role: inferRole(track),
    target: track.target ?? inferTarget(track),
    midiChannel: clamp(track.midiChannel ?? defaultChannel(track), 1, 16),
    note: clamp(track.note ?? 60, 0, 127),
    velocity: clamp(track.velocity ?? 100, 1, 127),
    steps: uniqueSortedSteps(track.steps),
    lanes: {
      probability: track.lanes?.probability ?? {},
      condition: track.lanes?.condition ?? {},
      microtiming: track.lanes?.microtiming ?? {},
      cc: track.lanes?.cc ?? {},
      note: track.lanes?.note ?? {},
    },
  };
}
```

## 2. Deterministic composition generation

```ts
function generateComposition({ genre, strategy, seed, lockedTracks }) {
  const rng = createSeededRng(seed);
  const rules = getGenreRules(genre);
  const strategyRules = getStrategyRules(strategy);

  return baseTracks(genre).map(track => {
    if (lockedTracks.has(track.id)) return lockedTracks.get(track.id);

    const role = inferRole(track);
    const density = chooseDensity(rng, rules[role], strategyRules[role]);
    const length = chooseLength(rng, role, rules, strategyRules);
    const steps = chooseRhythmEngine(role, strategy).generate({ rng, density, length });

    return normalizeTrack({
      ...track,
      steps,
      lanes: generateExpressiveLanes({ rng, role, steps, strategy }),
    });
  });
}
```

## 3. Hardware-safe MIDI planning

```ts
function buildMidiPlan(project, mode) {
  const events = [];
  const rng = mode.rng ?? createSeededRng(project.seed);
  const bpm = clamp(project.bpm, 20, 300);
  const startAt = mode.startAt ?? performance.now() + mode.preRollMs;

  if (mode.sendClock) events.push(...clockEvents({ target: mode.clockTarget, bpm, startAt, duration: mode.duration }));
  if (mode.sendTransport) events.push({ target: mode.transportTarget, bytes: [MIDI_START], at: startAt });

  for (const track of project.tracks) {
    if (!isTrackEnabledForMode(track, mode)) continue;

    const target = track.target;
    const channel = track.midiChannel - 1;
    for (const stepEvent of expandSteps(track, project.patternLength, mode.loops)) {
      if (!passesProbability(stepEvent, rng)) continue;
      if (!passesCondition(stepEvent.condition, stepEvent.loopIndex)) continue;

      events.push({ target, ...noteOn(channel, stepEvent.note ?? track.note, stepEvent.velocity ?? track.velocity, stepEvent.at) });
      events.push({ target, ...noteOff(channel, stepEvent.note ?? track.note, stepEvent.at + stepEvent.lengthMs) });
      events.push(...ccEvents(channel, stepEvent.cc, stepEvent.at).map(evt => ({ target, ...evt })));
    }
  }

  if (mode.sendTransport) events.push({ target: mode.transportTarget, bytes: [MIDI_STOP], at: startAt + mode.duration });
  return events.sort((a, b) => a.at - b.at);
}

function sendMidiPlan(plan, outputByTarget) {
  for (const evt of plan) {
    const output = outputByTarget[evt.target];
    if (!output) continue;
    output.send(evt.bytes, evt.at);
  }
}
```

## 4. UI interaction model

```ts
function renderCompositionCockpit(project) {
  renderTopBar({ tempo: project.bpm, seed: project.seed, hardware: project.devices });
  renderLeftRail({ genres, strategies, locks: project.lockedTracks });
  renderArrangementScenes(project.scenes);
  renderTrackGrid(project.tracks, {
    onEditTrack: openTrackInspector,
    onToggleMute: togglePreviewMute,
    onRouteChange: updateTrackRoute,
  });
  renderRightInspector(selectedTrack, {
    generatorControls,
    routingControls,
    pLockPlan,
    pro3PatchHints,
  });
  renderTransport({ preview, livePlay, recordToDigitakt, exportProject });
}
```

## 5. Production refactor order

1. Fix current correctness issues inside the standalone file first: seeded MIDI probability, key-randomization semantics, and the probability/condition badge render edge.
2. Add per-target MIDI output routing while keeping Web MIDI SysEx disabled.
3. Add schema-versioned project export/import so future refactors have stable fixtures.
4. Move constants and pure functions out of `digitakt-rhythm-aide.html` in small slices.
5. Convert tests so they import production `normalizeTrack`, `euclidean`, RNG, lane, generation, and MIDI planner code instead of copied logic.
6. Keep UI behavior identical while replacing globals with a single project store.
7. Introduce Vite/TypeScript only after the pure modules and fixtures are stable; keep a standalone HTML build artifact.
8. Treat full Digitakt project/pattern transfer as a separate hardware research spike, not part of the initial production milestone.


## 6. Oscilloscope / Three.js visualizer pseudocode

```ts
async function startVisualizer({ source }) {
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;

  if (source.kind === 'internal-preview') {
    previewEngine.connectAnalyser(analyser);
  }

  if (source.kind === 'external-input') {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: source.deviceId ? { exact: source.deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const input = audioContext.createMediaStreamSource(stream);
    input.connect(analyser);
  }

  const scope = createThreeScopeRenderer(canvas);
  const timeDomain = new Uint8Array(analyser.fftSize);
  const frequency = new Uint8Array(analyser.frequencyBinCount);

  function frame() {
    analyser.getByteTimeDomainData(timeDomain);
    analyser.getByteFrequencyData(frequency);
    scope.updateWaveform(timeDomain);
    scope.updateSpectrum(frequency);
    scope.render();
    requestAnimationFrame(frame);
  }

  frame();
}
```

Implementation notes:

- Start with internal preview because it works without hardware.
- External Digitakt monitoring requires an audio input device visible to the browser; USB MIDI alone is not enough.
- Three.js should receive normalized analysis arrays and stay independent from capture details.
- Add an `AudioWorklet` later only if analyser polling is insufficient for stable peak/RMS history or low-latency ring-buffer behavior.
