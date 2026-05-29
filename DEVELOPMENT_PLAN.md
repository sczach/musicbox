# Musicbox Composition Machine Development Plan

This document is the execution brief for Claude Code Sonnet. It turns the current single-file Digitakt rhythm aide into a browser-based composition machine for Digitakt II and Sequential Pro 3 workflows.

## Current repo baseline

- The repo currently contains one runnable file, `digitakt-rhythm-aide.html`.
- Current strengths:
  - Genre presets, 16-track pattern grids, Euclidean generation, browser preview, harmony/p-lock guidance, song-mode instructions, localStorage persistence, and Web MIDI output.
  - Existing MIDI sender uses Web MIDI without SysEx, sends MIDI start/clock/stop plus note on/off events per track/channel.
- Current limitations to fix first:
  - No modular source structure, no tests, no build tooling, and no typed model for patterns/songs/devices.
  - MIDI send is performance/record oriented, not a verified Digitakt project/pattern dump.
  - Track-to-channel mapping is implicit (`idx & 0x0F`), so the Pro 3 plan in the UI can drift from actual channel routing.
  - The UI is dense and useful, but not yet a composition cockpit with arrangement lanes, probability views, macro controls, device health, and export/import.

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

Use ideas and APIs where license-compatible; do not blindly vendor large codebases.

| Project | Relevance | Recommendation |
| --- | --- | --- |
| Tone.js, <https://github.com/Tonejs/Tone.js> | Web Audio scheduling, synth/sampler preview, transport concepts. | Use for browser preview after the repo is modularized; keep hardware timing on Web MIDI scheduler. |
| Tonal, <https://github.com/tonaljs/tonal> | Music theory utilities for notes, intervals, chords, scales, modes, key signatures. | Add as dependency or mirror a minimal typed subset; ideal for scale-aware basslines, chord voicings, p-lock tune offsets. |
| Scribbletune, <https://github.com/scribbletune/scribbletune> | JavaScript string/array pattern language for rhythms, melodies, chord progressions, MIDI export. | Borrow the UX concept: compact motif strings and MIDI-file export; likely use as an optional backend once npm tooling exists. |
| Strudel, <https://strudel.cc/> / <https://github.com/tidalcycles/strudel> | Browser Tidal-style pattern language for algorithmic music, live coding, pattern transforms. | Do not embed the full REPL initially. Implement a small compatible transform layer: `every`, `off`, `rev`, `density`, `euclid`, `sometimes`, `stack`. |
| Magenta.js, <https://github.com/magenta/magenta-js> | Browser ML continuation/interpolation/humanization models; MusicVAE has melody/drum loop models. | Phase 3 experimental feature only. Run in a Web Worker and keep deterministic generators as the core. |
| WebMidi.js, <https://webmidijs.org/> | Friendlier wrapper around native Web MIDI. | Optional; native API is already simple enough. Consider only if routing and input learning get complex. |
| SuperCollider/TidalCycles/Sonic Pi | Deep algorithmic composition ecosystems. | Use for inspiration and export targets, not as runtime dependencies for a web-first Digitakt tool. |

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

Give Claude Code Sonnet these tasks in order:

1. **Create project scaffold**: Vite + TypeScript while keeping existing HTML accessible.
2. **Extract core**: move Euclidean, genre data, composition data, and MIDI event generation into typed modules with tests.
3. **Routing fix**: replace implicit channel-by-index with explicit `midiChannel` and `target` per track; default Pro 3 to channel 1 only when routed to Pro 3.
4. **Hardware setup docs**: add `docs/hardware-setup.md` covering Digitakt USB MIDI, Digitakt-to-Pro 3 DIN, and browser-as-hub setups.
5. **UI first pass**: add device diagnostics + routing matrix without changing every visual component yet.
6. **Seeded generators**: add seed, lock, and deterministic regeneration.
7. **Arrangement scenes**: add scene mutes/repeats and export a Digitakt Song Mode checklist.
8. **Asset manifest**: add schema and one example placeholder asset entry with no bundled audio.

## Non-goals and risks

- Do not implement full Digitakt project/pattern SysEx transfer until verified against official/current Digitakt II behavior and tested on hardware.
- Do not bundle samples from famous artists, commercial packs, YouTube rips, or unclear licenses.
- Do not make the app dependent on a server for core composition; hardware MIDI requires a local browser session.
- Do not make ML generation the primary workflow; it should augment deterministic, editable composition.
- Browser timing is not sample-accurate. Use pre-scheduled Web MIDI timestamps, clock pre-roll, and hardware capture workflows to minimize jitter.

## Definition of done for the first serious milestone

A user can open the app in Chrome/Edge, connect Digitakt II over USB, optionally connect Pro 3 over USB or DIN via Digitakt, choose a genre/strategy/seed, generate a 16-track idea with a bassline and harmonic plan, audition it, route tracks explicitly, record the pattern into Digitakt, and save/export the project JSON and Song Mode checklist.
