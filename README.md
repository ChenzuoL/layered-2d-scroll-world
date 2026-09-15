# Layered 2D Scroll World

An agent skill for building immersive Three.js pseudo-3D scroll stories out of independent hand-painted 2D assets.

Illustrated cutouts sit at real world coordinates. A narrow-lens camera travels through them: scroll and drag move the view, while characters, weather and water move on their own clocks.

## What it covers

- **World-space composition** — every asset is a plane with persistent `x`/`y`/`z`, size and anchor metadata. Nothing is recomputed from viewport percentages per frame.
- **Independent drivers** — `scroll` moves the camera, `time` drives character and environment motion, `guide` carries one persistent clue object across the whole journey.
- **Autonomous life** — stride cycles tied to distance travelled, root-anchored plant bending, rain with matching ripples, fish, bubbles, wing beats.
- **Grounding shadows** — contact points measured from real alpha, never silhouette offsets, and none at all for airborne or underwater assets.
- **Constant-speed autoplay** — linear, uninterrupted narration pacing where audio can fail, buffer or be muted without ever stalling the camera.
- **Calibration tool** — review an agent's composition in 3D, fine-tune individual instances, inspect layer stacking and projected overlap, edit camera paths and guide curves, then export only the changed fields.

## Layout

```text
SKILL.md                       workflow, invariants, failure modes
references/                    asset pipeline, world runtime, motion & narration, QA gates
scripts/scaffold.mjs           create a runnable work from the starter
scripts/validate-scene-contract.mjs
scripts/qa-assets.py           transparent-asset edge and alpha checks
scripts/apply-calibration.mjs  replay an exported calibration patch
templates/starter/             self-contained Three.js starter + scene composer
templates/scene-contract.example.json
tests/                         validator, scaffold, calibration and browser QA
```

## Quick start

Scaffold a runnable work, then edit only `config/world.json` and `assets/`:

```bash
node scripts/scaffold.mjs my-story "My Story"
```

Validate a contract before generating any art:

```bash
node scripts/validate-scene-contract.mjs templates/starter/config/world.json
```

Serve the starter and open `editor.html` for the calibration tool:

```bash
python3 -m http.server 8080 --directory templates/starter
```

## Tests

```bash
node --test tests/test-validator.mjs tests/test-scaffold.mjs tests/test-calibration.mjs
PLAYWRIGHT_ROOT=/path/to/playwright node tests/qa-starter.cjs
PLAYWRIGHT_ROOT=/path/to/playwright node tests/qa-editor.cjs
```

Browser tests need `playwright-core` and a local Chrome; point `PLAYWRIGHT_ROOT` at a directory that has it installed.

## Notes

- The starter's `assets/sample/` images are watercolor examples that keep the template runnable before a project's real art exists. Replace them.
- The runtime is theme-agnostic. Ordinary new themes should not require edits under `engine/`.
- Voices are always original and never imitate a real person. How it was directed is reported; whether it sounds right is the creator's call.
