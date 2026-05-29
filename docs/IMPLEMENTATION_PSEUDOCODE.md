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
  const bpm = clamp(project.bpm, 20, 300);
  const startAt = performance.now() + mode.preRollMs;

  if (mode.sendClock) events.push(...clockEvents({ bpm, startAt, duration: mode.duration }));
  if (mode.sendTransport) events.push({ bytes: [MIDI_START], at: startAt });

  for (const track of project.tracks) {
    if (!isTrackEnabledForMode(track, mode)) continue;

    const channel = track.midiChannel - 1;
    for (const stepEvent of expandSteps(track, project.patternLength, mode.loops)) {
      if (!passesProbability(stepEvent, mode.captureLoop)) continue;

      events.push(noteOn(channel, stepEvent.note ?? track.note, stepEvent.velocity ?? track.velocity, stepEvent.at));
      events.push(noteOff(channel, stepEvent.note ?? track.note, stepEvent.at + stepEvent.lengthMs));
      events.push(...ccEvents(channel, stepEvent.cc, stepEvent.at));
    }
  }

  if (mode.sendTransport) events.push({ bytes: [MIDI_STOP], at: startAt + mode.duration });
  return events.sort((a, b) => a.at - b.at);
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

1. Move constants and pure functions out of `digitakt-rhythm-aide.html` first.
2. Add unit tests around `normalizeTrack`, `euclidean`, `generateComposition`, and `buildMidiPlan`.
3. Keep UI behavior identical while replacing globals with a single project store.
4. Add explicit routing controls before adding any new MIDI features.
5. Add seeded generation and lockable tracks only after the current random generator is test-covered.
6. Treat full Digitakt project/pattern transfer as a separate hardware research spike, not part of the initial production milestone.
