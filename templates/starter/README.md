# Layered 2D Scroll World Starter

Static, dependency-free Three.js starter. Open through an HTTP server; ES modules do not run reliably from `file://`. The only runtime dependency is the vendored Three.js module; `package.json` marks the source as ES modules.

```bash
python3 -m http.server 8080 --directory .
```

## Start a new work

Prefer the skill scaffold command from the world root:

```bash
node .agents/skills/layered-2d-scroll-world/scripts/scaffold.mjs my-story "My Story"
```

Then edit only:

```text
config/world.json
assets/
```

Open `editor.html` for the visual composer. Choose a chapter, click an asset, drag it in the Three.js viewport, adjust X/Y/Height/Z sliders, and download the edited `world.json`. Copy the downloaded config back to `config/world.json` before publishing.

The runtime is generic. Do not edit `engine/` for ordinary new themes.

## Configuration

- Add all image metadata under `assets`.
- Add immutable world-space planes under each chapter `elements`.
- Supported time motions: `float`, `bob`, `drift`, `sway`, `bend`, `atlas-loop`, `patrol`, `travel`.
- One element can use an array of motion specs.
- Add a three-point `guidePath` for every chapter.
- Keep exactly one final chapter with `ending: true`.
- Set `autoplay.audio` to `{ "track": "assets/narration.m4a" }` when a local narration track exists.

## Verify

```bash
node ../../scripts/validate-scene-contract.mjs config/world.json
```

For a scaffolded work, run the command shown by `scaffold.mjs`; its path is relative to the world root.
