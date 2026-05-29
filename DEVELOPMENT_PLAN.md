# Musicbox Composition Machine Development Plan

This document is the execution brief for Claude Code Sonnet. It turns the current single-file Digitakt rhythm aide into a browser-based composition machine for Digitakt II and Sequential Pro 3 workflows.

## Current repo baseline

- The repo currently centers on one runnable file, `digitakt-rhythm-aide.html`, and that single-file testbed should remain the fastest way to try ideas.
- Current strengths:
  - Genre presets, 16-track pattern grids, Euclidean generation, browser preview, harmony/p-lock guidance, song-mode instructions, localStorage persistence, and Web MIDI output.
  - No-dependency `npm test` now runs a smoke check against the inline script/critical DOM ids plus pure-function tests for Euclidean rhythms, track normalization, seeded generation helpers, MIDI event planning, probability lanes, and trig conditions.
  - Track metadata is normalized in the testbed, cards show route summaries, and the modal now edits target, MIDI channel, note, velocity, and note-name display.
  - Seeded regeneration and track locks exist for generated steps, and the app has probability/condition lanes in the step editor.
  - Existing MIDI sender uses Web MIDI without SysEx and plans MIDI start/clock/stop plus note events through an explicit event builder.
  - Visualizer scaffolding exists for internal preview analysis, external browser audio input, canvas fallback, and optional Three.js rendering.
- Current limitations to fix first:
  - No modular source structure or typed build pipeline yet; production logic is still embedded in `digitakt-rhythm-aide.html` and tests duplicate selected functions.
  - MIDI send is performance/record oriented, not a verified Digitakt project/pattern dump.
  - Per-target output routing is not implemented yet: track targets exist, but send flows still use one selected MIDI output.
  - Deterministic generation is incomplete because MIDI probability filtering and manual key randomization still use `Math.random()`.
  - Export/persistence lag behind the model: routing, probability, condition, schema version, project JSON, and undo/migration affordances need work.
  - The UI has cockpit polish, but still needs arrangement lanes, mutation/macro controls, richer import/export, visualizer calibration, and a dedicated routing matrix.

## Development review snapshot — 2026-05-29

### What has landed since the original roadmap

- A lightweight safety net exists: `package.json` exposes `npm test`, `test/smoke.js` checks inline-script syntax and critical DOM ids, and `test/unit.js` covers the most important pure behaviors.
- The single-file testbed now has a more explicit model: `normalizeTrack()` adds route metadata and lane objects to every track.
- The modal has a routing inspector for target, channel, note, velocity, and note-name display, so routing is no longer just hidden metadata.
- Track cards now expose lock and preview-mute controls and summarize route/channel/note state.
- Regeneration uses a seeded RNG for generated step patterns and skips locked tracks.
- The step editor has probability and condition lanes, lane reset controls, Euclidean generation, and 16/32/64/128-step editing.
- Web MIDI status is more visible, SysEx remains disabled, and sending is centralized through a planned event list.
- Song-mode send can filter tracks according to the current song-guide step.
- The visualizer spike has begun: preview analyser, external audio input selection, canvas drawing, and optional Three.js rendering are present.

### Bugs and correctness risks identified in review

1. **Incomplete determinism**: `buildMidiEvents()` still uses `Math.random()` for probability lanes, so a seeded pattern can produce different MIDI note events on repeated sends. `randomizeKey()` also uses `Math.random()`.
2. **Single-output MIDI bottleneck**: track `target` values do not yet route events to separate Web MIDI outputs. Pro 3 USB and Digitakt USB cannot be addressed independently in browser-as-hub mode.
3. **Step-grid stale rendering**: cycling probability on a step that already has a condition can temporarily hide the condition badge because the button is rebuilt with `textContent` instead of the same label+badge HTML path used by `renderStepGrid()`.
4. **Export is behind the editor**: text export does not include route metadata, seed, locks, probability lanes, condition lanes, or project JSON.
5. **Persistence lacks schema versioning**: migration handles old shapes defensively, but saved data does not declare a version, which will make future extraction riskier.
6. **Destructive flows need undo/confirmation detail**: subgenre selection, recommended reset, clear pattern, and lane reset can remove user edits without a recoverable history.
7. **Visualizer lifecycle is early**: input selection works as a spike, but disconnect, calibration, device-change handling, and secure-context messaging need polish.
8. **Tests copy logic instead of importing it**: acceptable for the current HTML-only app, but extraction should prioritize eliminating duplicate logic.

### Refactor and polish priorities from this review

- Make randomness an explicit dependency: seed creation, deterministic choice helpers, regeneration, key choice, probability lanes, and MIDI planner should share a controlled RNG path.
- Split `buildMidiEvents()` into a pure planner that returns target-tagged events and a sender that groups events by selected output.
- Add a route/output matrix: Digitakt USB, Pro 3 USB, and External MIDI each need their own selected output and diagnostic status.
- Introduce storage schema versioning before adding project JSON import/export.
- Extract pure modules in small slices while preserving the standalone HTML workflow.
- Add UI affordances for lanes and destructive actions: visible legends, undo, route-aware export, and clearer lock/regeneration status.
- Treat the visualizer as non-blocking: failures or denied permissions must never break sequencing, preview, or MIDI send.

## Research summary and product direction

### Digitakt II integration facts

- Digitakt II supports USB MIDI and USB Audio/MIDI modes. For browser control, the user should set `SETTINGS > SYSTEM > USB CONFIG` to `USB MIDI` or `USB AUDIO/MIDI`, depending on whether audio over USB is also desired. Source: Elektron Digitakt II User Manual OS 1.10, `14.8.1 USB CONFIG`, <https://elektron.se/wp-content/uploads/2025/03/Digitakt-2-User-Manual_ENG_OS1.10_250320.pdf>.
- Any of the 16 Digitakt II tracks can be a MIDI track, and MIDI tracks can send up to four-note chords, velocity, length, pitch bend, aftertouch, 16 CCs, parameter locks, LFOs, micro-timing, track length, and time-signature settings through MIDI OUT or USB. Source: Elektron Digitakt II User Manual OS 1.10, `5.3.2 MIDI Tracks`.
- The app should keep the first production-grade path as **live/record-to-Digitakt via USB MIDI**. Treat SysEx pattern/project transfer as a later spike unless Elektron publishes a stable Digitakt II pattern dump spec. Existing code uses `requestMIDIAccess({ sysex:false })`, which is a safer default.
- Web MIDI requires browser support and a secure context in modern browsers. For local dev, use `http://localhost` or HTTPS and test in Chrome/Edge first. Source: MDN Web MIDI API, <https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API>.

### Sequential Pro 3 integration facts

- Pro 3 has class-compliant USB MIDI, bidirectional MIDI over USB, and does not transmit audio over USB. Source: Sequential Pro 3 User's Guide, `Using USB`, <https://sequential.com/wp-content/uploads/2021/02/Pro-3-Users-Guide-1.2.pdf>.
- Pro 3 can receive MIDI clock over either MIDI DIN or USB; when set to slave/slave-thru with no clock on the selected input, its arpeggiator and sequencer do not run. Source: Sequential Pro 3 User's Guide, Global Settings / MIDI Clock Cable In.
- Recommended setups:
  1. **Browser as hub**: connect Digitakt II USB and Pro 3 USB to the computer; send separate Web MIDI streams to each output. This is easiest for the app.
  2. **Digitakt as hardware sequencer**: connect computer to Digitakt USB, then Digitakt MIDI OUT DIN to Pro 3 MIDI IN DIN; use Digitakt MIDI tracks for Pro 3 notes/chords/CCs. This is best for DAWless playback after capture.
  3. **Do not expect Digitakt II to host Pro 3 over USB directly** unless a separate USB host box is present; plan around computer/Web MIDI or DIN.

### Relevant composition/audio engine repos to draw from

Use ideas and APIs where license-compatible; do not blindly vendor large codebases. Preserve the single-file testbed by loading optional libraries from CDNs or by building a distributable `musicbox.html` bundle later.

| Project | What is good about it | What to pull into Musicbox | Implementation path |
| --- | --- | --- | --- |
| Tone.js, <https://github.com/Tonejs/Tone.js> | Mature Web Audio transport, sampler/synth abstractions, timing vocabulary, effects graph patterns. | Better preview engine, click-free sample audition, metronome/count-in, offline bounce experiments. | Start with native preview still intact. Add a `PreviewEngine` interface; implement `NativePreviewEngine` first, then `TonePreviewEngine` behind a feature flag. Do **not** use Tone for hardware MIDI clock. |
| Tonal, <https://github.com/tonaljs/tonal> | Pure TypeScript/JavaScript theory utilities for notes, MIDI numbers, intervals, chords, scales, and keys. Official docs describe it as a music-theory library, not a sound engine. | Note-to-MIDI conversion, scale degrees, chord voicings, Pro 3 note generation, Digitakt sample-tune p-lock offsets. | Either import `tonal` in a future Vite build or copy a tiny internal `theory-lite` module for single-file mode. First target: replace hard-coded harmonic semitone tables with generated scale/chord helpers. |
| Scribbletune, <https://github.com/scribbletune/scribbletune> | Compact pattern strings and music-generation ergonomics that are understandable to non-programmers. | Optional text motif lane: `x---x--x`, chord clips, MIDI-file export mental model. | Do not embed full Scribbletune immediately. Implement a small parser for rhythm strings and chord tokens; later add Scribbletune export/import if it remains useful. |
| Strudel, <https://strudel.cc/> / <https://github.com/tidalcycles/strudel> | Browser-first Tidal-style pattern transforms and live-coding concepts. | Pattern transforms: `every`, `off`, `rev`, `density`, `euclid`, `sometimes`, `stack`; mutation stack UX. | Implement compatible transform names on the internal `Track.events` model. Keep Strudel as inspiration/export target; do not ship the full REPL in the testbed until the core app is modular. |
| Magenta.js, <https://github.com/magenta/magenta-js> | Browser ML continuation/interpolation/humanization models for music. | Experimental melody/drum continuation and interpolation between locked patterns. | Phase-late feature behind an `Experimental ML` toggle. Load model in a Web Worker; constrain output through key/scale/density/hardware range; deterministic fallback must remain primary. |
| WebMidi.js, <https://webmidijs.org/> | Cleaner wrapper around browser Web MIDI device enumeration and send APIs. | Better input learning, device reconnection, routing matrix ergonomics if native API code grows. | Defer. Native Web MIDI is currently small. Re-evaluate only after editable routing, MIDI input learn, and multi-output support make the native layer noisy. |
| Three.js, <https://threejs.org/> | GPU-rendered visuals and built-in `AudioAnalyser` helpers around Web Audio `AnalyserNode`; official docs expose frequency data and average frequency. | Oscilloscope/waveform panel, spectrum view, track-energy visuals, live-performance visuals. | Add as optional CDN module in single-file mode. For real Digitakt audio, capture audio through a USB audio input exposed to the browser via `getUserMedia({audio:true})`, feed a Web Audio `AnalyserNode`/AudioWorklet, then draw waveform geometry in Three.js. |
| SuperCollider/TidalCycles/Sonic Pi | Deep algorithmic composition ecosystems and proven live-performance idioms. | Vocabulary for pattern transforms, probability, clock division, and live mutation. | Inspiration and export targets only. Do not make them runtime dependencies for the browser-first testbed. |

### Single-file testbed principle

The repo should keep `digitakt-rhythm-aide.html` as a downloadable, immediately runnable lab even after introducing modules.

- Every production module should have a path back to one of two deliverables:
  1. **Standalone HTML**: one file that can be downloaded and opened or served from localhost.
  2. **Vite app**: typed modules, tests, and dependency management for production development.
- Avoid introducing a dependency that requires a server for the core workflow. Hardware MIDI and microphone/USB-audio permissions may require Chrome/Edge and a secure context, but the app should still fail gracefully without a backend.
- If external libraries are added while the app is still single-file, load them as optional CDN scripts/modules and keep native fallbacks.
- For each feature, keep pure functions outside DOM logic conceptually, even if temporarily embedded in the HTML file. This makes later extraction low-risk.

### What to learn from world-class electronic composers

Translate these practices into app features rather than imitation presets:

- **Aphex Twin**: deep custom systems, algorithmic/irregular sequencing, obsessive sound design, controlled instability, microtiming, surprise, and track-specific machines. App translation: probability lanes, per-track clock division, Euclidean/chaotic generators, modulation p-lock plans, mutation history, and randomization with musical constraints.
- **Skrillex**: fast DAW-centric workflow, decisive audio printing, extreme transient control, vocal/formant slicing, FM/wavetable bass design, hard contrast between melodic fragments and drops. App translation: resample/export stems, transient-density inspector, drop/buildup arrangement macros, bassline call-response generator, and lockable “impact hit” positions.
- **Four Tet**: sample-library intuition, quick loop discovery, organic/acoustic textures, minimal processing, laptop-speed iteration, improvisable live setup. App translation: drag/drop sample idea board, “found loop + bass answer” generator, sparse processing notes, and arrangement scenes that can be launched or copied quickly.
- **General high-level electronic composition model**:
  - Generate a small hook: rhythm cell, bass cell, vocal/texture cell, or chord color.
  - Create a coherent sound world before over-writing: 8-16 curated sounds beat 64 generic sounds.
  - Use variation by subtraction/addition, not constant novelty.
  - Automate energy: density, register, brightness, reverb/delay send, distortion, noise, and silence.
  - Commit and resample: the machine should help print/export ideas, not endlessly randomize.

## Target architecture

Move from the single HTML file into a small TypeScript/Vite app:

```text
src/
  app.tsx or main.ts              # bootstrap
  core/
    model.ts                      # Song, Pattern, Track, StepEvent, Device, Routing types
    theory.ts                     # scales, chords, voicings, tune offsets
    generators.ts                 # deterministic rhythm/melody/bassline engines
    transforms.ts                 # mutation and pattern-language operations
    arrangement.ts                # scene/song generation and energy curves
    serialization.ts              # JSON import/export, share URLs
  midi/
    webMidi.ts                    # access, device discovery, scheduling
    digitakt.ts                   # Digitakt-specific routing and instructions
    pro3.ts                       # Pro 3 notes, CCs/NRPN placeholders, clock modes
  audio/
    preview.ts                    # Tone.js/Web Audio preview adapter
  ui/
    components/                   # sequencer, arrangement, routing, device panels
  data/
    genreKits.ts                  # current GENRES refactored
    composerStrategies.ts         # reusable strategy presets
    deviceMaps.ts                 # CC/channel/device maps with source comments
```

Minimum app-state schema:

```ts
type StepEvent = {
  step: number;
  note?: number;
  velocity?: number;
  lengthSteps?: number;
  probability?: number;
  micro?: number;          // -0.5..0.5 step offset
  cc?: Record<number, number>;
  condition?: string;      // e.g. "1:2", "fill", "pre"
};

type Track = {
  id: number;
  role: 'kick'|'snare'|'hat'|'bass'|'chord'|'lead'|'texture'|'midi'|'fx';
  target: 'digitakt-audio'|'digitakt-midi'|'pro3-usb'|'external-midi';
  midiChannel: number;
  lengthSteps: number;
  events: StepEvent[];
  locked?: boolean;
};
```

## Execution roadmap for Claude Code Sonnet

### Phase 0: Safety, repo hygiene, and tests

1. Add `package.json`, Vite, TypeScript, ESLint/Prettier or Biome, and Playwright smoke testing.
2. Preserve `digitakt-rhythm-aide.html` as a legacy entry until parity is reached.
3. Add a golden JSON fixture generated from one current genre, then write tests for:
   - Euclidean output.
   - pattern length normalization.
   - MIDI byte generation for note/clock events.
   - channel mapping including Pro 3 track.
4. Add a `docs/hardware-setup.md` page with exact Digitakt II and Pro 3 menu setup.

Acceptance criteria:
- `npm test` passes.
- `npm run build` passes.
- Legacy HTML still opens.
- One smoke test verifies the app renders and the MIDI panel handles no-device state.

### Phase 1: Deterministic composition core

1. Extract existing `GENRES`, `SUBGENRES`, `COMPOSITION`, `euclidean`, and MIDI scheduling logic from `digitakt-rhythm-aide.html` into typed modules.
2. Replace random-only regeneration with seeded generation:
   - seed visible in UI.
   - same seed + genre + constraints produces same song.
   - lock tracks so regeneration preserves chosen elements.
3. Add strategy presets:
   - `Aphex/IDM`: odd lengths, microtiming, probability, modulation CC lanes.
   - `Skrillex/Impact`: dense fills before downbeats, transient-first kick/snare anchors, bass call-response.
   - `FourTet/Organic`: sample-loop anchors, swing, acoustic texture lanes, restrained processing notes.
   - `Berlin/DubTechno`, `UKG`, `Jungle`, `Ambient`, `Trap`, etc.
4. Add bassline generator:
   - follows kick rhythm but can answer off-beats.
   - scale-aware with root/fifth/octave defaults.
   - option for Digitakt sample p-lock tune offsets or Pro 3 MIDI notes.
5. Add harmonic generator:
   - chord progression by Roman numerals.
   - chord-to-Pro-3 track as up to four MIDI notes.
   - chord-to-Digitakt p-lock guide as semitone offsets.

Acceptance criteria:
- A user can choose genre + strategy + seed and get a full 16-track pattern plus a song scaffold.
- Generated bassline can target either Digitakt audio p-locks or Pro 3 MIDI.

### Phase 2: Hardware routing and Digitakt capture

1. Build a routing matrix UI:
   - output device per target (`Digitakt USB`, `Pro 3 USB`, `Other`).
   - MIDI channel per track.
   - note number per Digitakt track, with default C3/60 unless the user chooses a Digitakt chromatic mapping.
2. Split MIDI send modes:
   - `Live Play`: sends clock/transport + notes to device(s).
   - `Record to Digitakt`: pre-roll count-in, clear instructions, loop count, and stop after capture.
   - `Pro 3 Audition`: sends only Pro 3 notes/clock for patch building.
3. Add device diagnostics:
   - Web MIDI support status.
   - secure context status.
   - selected output connected/disconnected.
   - sysex disabled/enabled indicator.
4. Implement scheduled MIDI as testable byte events first, then send via Web MIDI.
5. Add Pro 3 helpers:
   - channel selector.
   - clock source instructions: set Pro 3 MIDI Clock Mode to slave and Clock Cable In to USB or MIDI matching setup.
   - patch roles: mono bass, paraphonic pad, arpeggiated sequence, filter-FX processor.
   - optional CC/NRPN mapping once verified from the Pro 3 manual.

Acceptance criteria:
- With both devices plugged into the computer, the browser can send Digitakt drum notes to one output and Pro 3 notes to another output.
- With Digitakt DIN out to Pro 3 DIN in, the app can record a MIDI track onto Digitakt intended to drive Pro 3 later.
- The app never claims to transfer full Digitakt patterns over USB unless that specific path is implemented and tested.

### Phase 2.5: Single-file production testbed hardening

1. Keep `digitakt-rhythm-aide.html` runnable without a build step.
2. Add an in-file developer header comment listing:
   - storage schema version.
   - hardware assumptions.
   - browser support notes.
   - where pure functions begin/end.
3. Add a no-dependency smoke-test script in `docs/` or `scripts/` that:
   - extracts the inline script.
   - runs `node --check`.
   - parses the HTML.
   - optionally checks for required DOM ids.
4. Add “download testbed” instructions to the handoff doc.
5. When Vite/TypeScript is introduced, add a build target that emits a single `dist/musicbox.html` file.

Acceptance criteria:
- A developer can test by opening/serving the HTML file immediately.
- A developer can run one command to validate basic syntax/DOM assumptions.
- The production app and standalone testbed remain behaviorally aligned.

### Phase 3: UI as composition cockpit

1. Replace the three-column dense layout with:
   - Top bar: project, seed, tempo, genre, strategy, hardware status.
   - Left rail: sound/role palette and locks.
   - Center: arrangement scenes above a 16-track pattern grid.
   - Right inspector: selected track, generator controls, routing, p-lock/modulation plan.
   - Bottom transport: preview/live/record/export.
2. Add visual lanes:
   - steps/trigs.
   - probability.
   - velocity.
   - microtiming.
   - note/tune.
   - CC/modulation.
3. Add arrangement generator:
   - intro, establish, variation, breakdown, build, drop/return, outro.
   - scene-level mutes and density changes.
   - Digitakt Song Mode cheat sheet export.
4. Add “mutation stack” UX:
   - `humanize hats`, `make darker`, `add pre-drop fill`, `thin kick`, `more Aphex`, `more Four Tet`, `double-time bass`, `invert chord`.
   - Show the diff and allow undo.
5. Add inline hardware instructions specific to the current routing rather than generic paragraphs.

Acceptance criteria:
- A novice can move from idea to hardware recording without reading the source code.
- A power user can lock tracks, mutate only selected lanes, and export/share project JSON.

### Phase 4: Public assets and sample workflow

Only incorporate assets that are explicitly redistributable and license-compatible. Store attribution with every asset.

Recommended approach:
1. Do **not** vendor copyrighted artist samples or unclear sample packs.
2. Add an asset manifest format:

```json
{
  "id": "kick_001",
  "type": "one-shot",
  "role": "kick",
  "url": "...",
  "license": "CC0|CC-BY|MIT|Apache-2.0",
  "author": "...",
  "source": "...",
  "attributionRequired": true
}
```

3. Good sources to evaluate:
   - Strudel sample packs and examples, checking each pack license.
   - Freesound CC0/CC-BY one-shots and field recordings via API, with attribution tracking.
   - MusicRadar/Computer Music free sample packs only after license review; link out if redistribution is not allowed.
   - NASA public-domain space sounds for ambient/dark ambient textures.
   - User-owned samples via drag/drop local-only library.
4. Implement sample features:
   - local drag/drop import and tagging.
   - sample role classifier by user tags first, heuristic second.
   - random kit builder by role.
   - Digitakt Transfer checklist; do not pretend the browser can move audio samples directly into Digitakt unless using supported software/protocol.

Acceptance criteria:
- App can run with zero bundled samples.
- Any bundled asset has machine-readable license/attribution.
- User can build a kit from local files and map roles to Digitakt tracks.

### Phase 4.5: Audio visualizer and oscilloscope roadmap

This is a significant undertaking because the browser cannot magically monitor Digitakt system audio over MIDI. The app needs an actual audio input device exposed to the browser. Digitakt II can operate as USB audio, but the browser must see it as an input source via the operating system; otherwise use an audio interface fed by Digitakt outputs.

1. Add a visualizer panel with three modes:
   - **Internal preview scope**: easy first milestone; visualize the existing browser preview engine.
   - **External input scope**: use `navigator.mediaDevices.getUserMedia({ audio: true })` to select Digitakt USB audio or an audio interface input.
   - **Performance visualizer**: Three.js scene driven by waveform, RMS, and FFT bands.
2. Use Web Audio for analysis:
   - `MediaStreamAudioSourceNode` from the selected input.
   - `AnalyserNode` for time-domain waveform and frequency bins.
   - `AudioWorklet` later for lower-latency metering, peak/RMS history, and stable ring buffers; MDN documents AudioWorklet as running custom audio processing code on a separate Web Audio thread and notes it requires a secure context.
3. Use Three.js for rendering:
   - line-strip oscilloscope from `getByteTimeDomainData` or float time-domain data.
   - spectrum bars/mesh from analyser frequency bins.
   - optional 3D tunnel/particle scene for live performance.
   - Three.js `AudioAnalyser` is useful for Three-owned audio objects, but external Digitakt input should start with native Web Audio analyser nodes so the app controls input selection and permissions.
4. Add calibration controls:
   - input selector.
   - gain trim.
   - trigger threshold and hold.
   - timebase / zoom.
   - freeze frame.
   - mono/stereo selection.
5. Warn users clearly:
   - MIDI over USB is not audio.
   - USB audio capture depends on OS/browser exposing the device.
   - `getUserMedia` requires permission and usually HTTPS/localhost.

Acceptance criteria:
- The visualizer can show the internal preview waveform without hardware.
- With a browser-visible audio input selected, the oscilloscope shows live Digitakt or interface audio.
- Visualizer failure never blocks sequencing or MIDI send.

### Phase 5: Optional ML and advanced algorithms

1. Add Magenta.js only behind an experimental flag:
   - drum humanization.
   - melody continuation.
   - interpolation between two patterns.
2. Use Web Workers for inference to avoid blocking UI.
3. Always constrain ML output through the project key/scale, hardware range, density limits, and track role.
4. Provide deterministic fallbacks for offline/no-GPU/no-model situations.

Acceptance criteria:
- ML features are helpful but not required for the core composition machine.
- A failed model load never breaks pattern editing or MIDI send.

## Immediate coding task list

Give the next Claude Code instance these tasks in order:

1. **Deterministic MIDI planner fix**: inject an RNG/seed into `buildMidiEvents()` and test that identical seed + tracks + probability lanes produce identical note events.
2. **Step-lane UI bug fix**: keep condition badges visible when cycling probability, and add a focused regression test if practical.
3. **Per-target MIDI routing**: add output selectors/state for Digitakt USB, Pro 3 USB, and External MIDI; make the planner emit target-tagged events and the sender dispatch to the correct output.
4. **Route-aware export and project JSON**: include target/channel/note/velocity, probability lanes, condition lanes, seed, locks, genre/subgenre, and schema version.
5. **Storage schema versioning**: save a versioned project envelope and add migration tests before more state is added.
6. **Extract pure core**: move RNG, Euclidean, generation, normalization, lane application, and MIDI planning into modules; make tests import production code instead of copies.
7. **Hardware setup docs**: add `docs/hardware-setup.md` covering Digitakt USB MIDI, Digitakt-to-Pro 3 DIN, Pro 3 clock settings, browser-as-hub setups, and the USB MIDI vs USB audio distinction.
8. **Visualizer polish**: add disconnect/calibration controls, device-change handling, better permission/secure-context copy, and keep all failures non-blocking.
9. **Vite/TypeScript scaffold**: introduce only after pure extraction is stable, while keeping `digitakt-rhythm-aide.html` accessible and adding a standalone `dist/musicbox.html` build target.
10. **Arrangement/mutation layer**: add scene mutes/repeats, undoable mutations, and a route-aware Digitakt Song Mode checklist after serialization is reliable.
11. **Asset manifest**: add a schema and one placeholder entry with no bundled audio; do not vendor samples until license review is complete.
12. **Developer handoff maintenance**: keep `DEVELOPMENT_PLAN.md`, `docs/IMPLEMENTATION_PSEUDOCODE.md`, and `docs/DEVELOPER_HANDOFF.md` current with every architectural decision.

## Non-goals and risks

- Do not implement full Digitakt project/pattern SysEx transfer until verified against official/current Digitakt II behavior and tested on hardware.
- Do not bundle samples from famous artists, commercial packs, YouTube rips, or unclear licenses.
- Do not make the app dependent on a server for core composition; hardware MIDI requires a local browser session.
- Do not make ML generation the primary workflow; it should augment deterministic, editable composition.
- Browser timing is not sample-accurate. Use pre-scheduled Web MIDI timestamps, clock pre-roll, and hardware capture workflows to minimize jitter.
- USB MIDI is not USB audio. The oscilloscope requires a browser-visible audio input path, not just the MIDI connection.

## Definition of done for the first serious milestone

A user can open the app in Chrome/Edge, connect Digitakt II over USB, optionally connect Pro 3 over USB or DIN via Digitakt, choose a genre/strategy/seed, generate a 16-track idea with a bassline and harmonic plan, audition it, route tracks explicitly, record the pattern into Digitakt, and save/export the project JSON and Song Mode checklist.
