# Musicbox Developer Handoff

Last updated: 2026-05-29.

This repo is still intentionally small. The current source of truth is the standalone browser testbed plus a no-dependency Node test harness.

## Read these files first

1. `digitakt-rhythm-aide.html`
   - Runnable single-file app and current implementation source for genre data, UI, generation, audio preview, visualizer, persistence, and Web MIDI send.
2. `DEVELOPMENT_PLAN.md`
   - Product roadmap, current development review, known bugs, refactor opportunities, hardware assumptions, and phase priorities.
3. `docs/IMPLEMENTATION_PSEUDOCODE.md`
   - Target-shape pseudocode for the future modular architecture.
4. `test/smoke.js` and `test/unit.js`
   - Current safety net. Keep these passing before and after UI changes.

## Current implemented baseline

The app has moved beyond the original static rhythm aide. Before adding new features, assume these are already present:

- Standalone `digitakt-rhythm-aide.html` remains runnable without a build step.
- No-dependency `npm test` smoke/unit checks are in place.
- Track metadata is normalized with explicit `target`, `midiChannel`, `note`, `velocity`, `roleType`, and `lanes` fields.
- Track cards expose route summaries, preview mutes, and lock toggles.
- The track modal includes editable routing controls for target, MIDI channel, note, velocity, and note-name display.
- Step editing supports active trigs, right-click probability cycling, condition mode, Euclidean fill, pattern length changes, and lane reset.
- Seeded regeneration exists for generated track steps and respects locked tracks.
- Harmony and p-lock guidance exist, with manual key randomization.
- Browser preview exists and feeds an internal analyser.
- Visualizer scaffolding exists: preview analyser, external `getUserMedia` audio-input path, canvas fallback, and optional Three.js renderer loaded from CDN.
- Web MIDI diagnostics exist and MIDI send uses `requestMIDIAccess({ sysex: false })` with scheduled start, clock, note, and stop events.
- Song-mode send walks the genre song guide and can send only active tracks for each song step.

## Keep the testbed simple

The user likes being able to download one file and immediately test ideas. Do not break that workflow.

- Keep `digitakt-rhythm-aide.html` usable directly in a browser.
- Use `http://localhost` or HTTPS for Web MIDI and audio-input permission testing.
- If adding dependencies before the Vite/TypeScript migration, keep them optional in the standalone file or provide a no-network fallback.
- If/when a build system is introduced, add a target that emits a single-file artifact such as `dist/musicbox.html`.
- Do not require a backend server for core composition, preview, visualizer, or MIDI send.

## Known bugs and correctness risks to tackle next

1. **Seed determinism is incomplete.** `regenerateComposition()` uses `mulberry32(S.seed)`, but MIDI probability filtering still uses `Math.random()` inside `buildMidiEvents()`, and `randomizeKey()` also uses `Math.random()`. Inject a seeded RNG into MIDI event planning and key selection so captures are reproducible.
2. **Per-target output routing is not implemented.** Tracks have target metadata, but `sendToDigitakt()` and song send still use the single selected `#midiOutput`. Browser-as-hub routing to Digitakt USB and Pro 3 USB requires an output map per target.
3. **Probability/condition UI has a stale-render edge.** Right-clicking probability on a conditioned step rebuilds the button with `textContent`, so the condition badge can disappear visually until the grid re-renders even though lane data remains.
4. **Export omits new lane/routing metadata.** The text export lists steps and density, but not per-step probability, conditions, target, MIDI channel, note, or velocity.
5. **Persistence has no schema version.** Storage is migrated defensively, but saved JSON has no explicit schema version or migration log.
6. **Subgenre/reset flows can overwrite user edits.** Selecting a subgenre or loading recommended defaults replaces patterns and can discard routing/lane decisions unless the user knows this will happen.
7. **Test harness duplicates production logic.** Unit tests currently copy/re-derive pure functions. This is acceptable while the source is a single HTML file, but extraction should remove duplication quickly.
8. **Visualizer lifecycle needs polish.** Input streams are stopped when reconnecting, but there is no explicit “disconnect input” control, no calibration controls, and no device-change handling.

## Refactor opportunities

Extract in this order so each step is testable:

```text
core/model          normalizeTrack, migrateTrackData, storage schema/version
core/rhythm         euclidean, generateTrackSteps, lane application
core/random         seed creation, mulberry32, deterministic choice helpers
core/harmony        key/scale/chord helpers, p-lock tune offsets
midi/planner        buildMidiEvents with injected rng, clock/transport/note events
midi/devices        Web MIDI discovery, per-target output map, diagnostics
ui/render           renderTrackGrid, renderStepGrid, modal rendering helpers
audio/preview       current Web Audio preview behind a PreviewEngine interface
audio/visualizer    analyser selection, input lifecycle, calibration, renderer adapter
```

Refactor guardrails:

- Extract pure logic before introducing Vite/TypeScript or framework state.
- Keep `test/smoke.js` validating the standalone HTML until an equivalent browser smoke test exists.
- Prefer small adapters around browser APIs rather than letting DOM/Web MIDI/Web Audio calls spread through core functions.
- Preserve the current app behavior before changing the visual design.

## UI polish opportunities

- Add an always-visible project/status strip: seed, lock count, selected MIDI output(s), Web MIDI status, visualizer source, and save status.
- Add lane legends directly above the step grid for probability and condition colors, not only explanatory copy below the grid.
- Add per-target output selectors in a routing panel: Digitakt, Pro 3, and External MIDI.
- Add a clear “Regenerate unlocked tracks” button label and show which tracks will be preserved.
- Add export controls for “Text checklist” vs “Project JSON”.
- Add undo for destructive actions: subgenre swap, reset all tracks, clear pattern, reset lanes.
- Add visualizer calibration controls: input disconnect, gain trim, freeze, timebase, and trigger threshold.
- Improve mobile modal ergonomics: sticky step controls, larger step hit targets, and a compact routing summary.

## Suggested next implementation sequence

1. Fix deterministic MIDI planning by injecting a seeded RNG into `buildMidiEvents()` and adding tests for repeated probability-lane renders with the same seed.
2. Add per-target MIDI output routing and update diagnostics/status copy.
3. Make export include routing, probability, conditions, seed, locks, and a JSON project option.
4. Add storage schema versioning and a tiny migration test.
5. Extract pure model/rhythm/random/MIDI planner code into modules while keeping the single-file app working.
6. Add Vite/TypeScript only after pure extraction is stable, with a build target that emits standalone HTML.
7. Polish visualizer lifecycle and calibration.
8. Add arrangement scenes/mutation stack after the app has reliable serialization and undo.

## Starter prompt for onboarding a new Claude Code instance

```text
You are taking over development of Musicbox in /workspace/musicbox.

Read these files first, in order:
1. DEVELOPMENT_PLAN.md
2. docs/DEVELOPER_HANDOFF.md
3. docs/IMPLEMENTATION_PSEUDOCODE.md
4. digitakt-rhythm-aide.html
5. test/smoke.js and test/unit.js

Current state: Musicbox is still a standalone HTML testbed, but it now has tests, normalized track routing metadata, editable routing in the track modal, seeded regeneration with track locks, probability/condition lanes, Web MIDI diagnostics/send, song-step send, and a preview/input visualizer scaffold.

Non-negotiable constraints:
- Do not break direct use of digitakt-rhythm-aide.html.
- Keep Web MIDI SysEx disabled unless a separate verified hardware spike proves it is necessary.
- Do not claim Digitakt project/pattern SysEx transfer is supported.
- Keep browser-as-hub and live/record-to-Digitakt workflows as the production path.
- Any dependency must either be optional in the standalone file or part of a build that emits a standalone HTML artifact.
- Run npm test before committing.

Start with this task:
1. Make MIDI probability planning deterministic by injecting an RNG/seed into buildMidiEvents instead of using Math.random().
2. Add tests proving identical seed + tracks + probability lanes produce identical MIDI note events.
3. Fix randomizeKey() to use deterministic seed flow or clearly mark it as an intentional manual random action.
4. Fix the step-grid stale-render edge where cycling probability can hide an existing condition badge.
5. Keep the UI and existing standalone behavior intact.

After that, implement per-target MIDI output routing for Digitakt USB, Pro 3 USB, and External MIDI, then expand export/persistence to include lane and routing metadata.
```

## Hardware notes to keep visible in the UI

- MIDI over USB does not carry audio.
- Digitakt USB audio or an audio interface must be selected as a browser audio input for oscilloscope monitoring.
- Pro 3 USB is MIDI only, not audio.
- Browser permissions and secure-context requirements should be diagnosed in the UI rather than hidden in console errors.
