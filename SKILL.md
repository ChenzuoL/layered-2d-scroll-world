---
name: Layered 2D Scroll World
description: Build or refine an immersive Three.js pseudo-3D scroll story made from independent transparent 2D illustrated assets, with real world-space depth, camera parallax, a continuous guide object, autonomous character/environment motion, optional constant-speed narrated autoplay, grounding shadows, and production QA. Use for hand-painted 2.5D storybook sites, “2D illustrations living in a 3D world,” scroll-through dioramas, layered parallax journeys, or requests to reproduce this interaction style. Do not use for pre-rendered scroll-scrub video.
---

# Layered 2D Scroll World

Build a browser work in which independent illustrated cutouts occupy real Three.js world coordinates. The camera travels through them; scroll and drag change the view, while characters and environmental life move on their own clocks.

The canonical feel is an illustrated storybook that reveals depth only when the camera moves. It is not a stack of full-scene images and not a video scrubber.

## Route First

Invoke and follow these supporting skills when their part of the task starts:

- `create-web-work`: initialize, build, publish, and update the Web Work.
- `generate`: generate individual art or source sheets.
- `referenced-4x4-asset-sheet`: generate/crop deterministic 4x4 asset families.
- `production-spritesheet-builder`: create articulated actor loops or pose atlases.

Do not invoke `scroll-world-video`; that skill scrubs pre-rendered video and has a different continuity architecture.

## Core Invariants

1. **World-space composition**: every scene asset is a plane with persistent `x`, `y`, `z`, width, height, and anchor metadata. Never recompute static asset placement from viewport percentages every frame.
2. **One asset, one object**: source art contains one complete object, transparent or on a removable plain background. No baked ground, cast shadow, text, scenery, or adjacent object.
3. **Camera reveals depth**: use a narrow perspective camera, normally 24-30 degrees. Scroll/autoplay moves the camera; drag translates camera and target together.
4. **Independent clocks**:
   - `scroll`: camera progress and scene handoff only;
   - `time`: cyclists, walking animals, flying birds, rain, fish, grass, bubbles;
   - `guide`: one persistent clue/hero object across the whole journey.
   Autonomous motion must continue while scroll is stationary.
5. **The guide is singular**: create one persistent mesh in an overlay or dedicated guide scene. Do not place duplicate guide assets in every chapter.
6. **Grounding, not stickers**: shadows appear only at measured contact points. Airborne, floating, and underwater assets get no imaginary floor shadow.
7. **Transition restraint**: scenes remain fully clear through most of their range. Handoff only near a boundary. Do not start fading as soon as a scene appears.
8. **Continuous autoplay**: when requested, autoplay begins immediately after load and advances linearly without per-scene stops or easing. Audio may buffer or be blocked; camera motion must not stop.
9. **Manual takeover**: wheel, drag, keyboard navigation, chapter buttons, or native scrolling pause autoplay immediately. Resume from the matching story point.
10. **QA before publish**: inspect source sheets, crops, scenes, transitions, motion over time, mobile framing, canvas pixels, and audio behavior.

## Before Building

Read only the references needed for the run:

- New art or cutting assets: [asset-pipeline.md](references/asset-pipeline.md)
- Scene construction, camera, guide, transitions, drag: [world-runtime.md](references/world-runtime.md)
- Actor/environment motion, shadows, narrated autoplay: [motion-audio.md](references/motion-audio.md)
- Testing and publish gates: [qa.md](references/qa.md)
- Runnable starter instructions: [starter README](templates/starter/README.md)

For a new work, scaffold the runnable starter first:

```bash
node .agents/skills/layered-2d-scroll-world/scripts/scaffold.mjs \
  <slug> "<title>"
```

This initializes `works/webs/<slug>`, copies the self-contained Three.js runtime and sample assets, writes the title, and validates the config. Replace `config/world.json` and `assets/`; ordinary themes should not require edits under `engine/`.

For contract-only planning, start from [scene-contract.example.json](templates/scene-contract.example.json), copy it into the work, and adapt it. Validate before implementation:

```bash
node .agents/skills/layered-2d-scroll-world/scripts/validate-scene-contract.mjs \
  works/webs/<slug>/scene-contract.json
```

## Workflow

### 1. Establish the Journey

Define 4-8 chapters. Each chapter needs:

- stable `id`, label, eyebrow, title, optional narration;
- camera start/end and look target;
- immutable world-space asset list;
- guide path with at least three points;
- autonomous motion declarations;
- transition window.

Keep a final ending chapter when the story needs closure. Do not silently replace it with the last illustrated scene.

### 2. Inventory Assets

Write an asset manifest before generation. Classify every asset:

- `grounded`: trees, rocks, pumpkins, seated/standing actors;
- `surface`: lily pads, floating leaves, boats;
- `airborne`: birds, clouds, falling leaves;
- `underwater`: fish, roots, bubbles, aquatic plants;
- `band`: water, distant hills, mist, ground strips;
- `actor`: articulated frame atlas.

Record aspect, horizontal centroid, ground/contact line, alpha bbox, and optional contact points.

### 3. Generate and Cut Art

For 4x4 sheets, attach the mandatory grid reference and a style reference. Generate 16 isolated items, then crop using whole-component ownership or content-aware recentering. Never accept an image just because its cell crop has margins: inspect whether the source already cut off a wheel, tail, branch, stem, or limb.

Produce a numbered contact sheet and reject:

- crossed cells or neighboring fragments;
- missing/cropped parts;
- painted checkerboards or white boxes;
- destructive alpha cleanup;
- inconsistent perspective/style/scale.

### 4. Build the Three.js World

Use one `THREE.Group` per chapter. Assets are upright planes. Preserve original aspect ratio and anchor ground line:

```js
const h = element.height;
const w = h * meta.width / meta.height;
mesh.position.set(
  element.x + (0.5 - meta.centroidX) * w,
  element.y + (meta.groundLine - 0.5) * h,
  element.z,
);
mesh.scale.set(w, h, 1);
```

Use real z separation. A useful starting spread:

- foreground: `z = 0..4`
- subject plane: `z = -2..-8`
- middle: `z = -8..-20`
- far bands: `z = -25..-70`

Set `depthWrite: false`, discard low alpha, and control `renderOrder` consistently. Use background-color distance wash sparingly for far objects; do not grey out the whole scene.

### 5. Camera and Interaction

- Start near `fov = 26` desktop and `30-36` portrait mobile.
- Advance camera z through each chapter; optionally add small x/y movement based on guide direction.
- Drag translates camera and look target together, bounded and damped. It must never rewrite element world coordinates.
- Let vertical touch remain native scrolling; engage drag after horizontal intent on touch.
- A reset-view icon returns drag offsets to zero.

### 6. Autonomous Motion

Actor motion uses an approved atlas. Frame selection and world translation are time-driven. Examples:

- squirrel: nibble frames plus rest;
- cat: stride frames tied to distance traveled, with a stop before turning;
- cyclist: fixed forward facing, time-driven travel, offstage reset hidden by edge fade;
- bird: time-driven x travel plus wing frames;
- tree/grass/waterweed: root-anchored vertex bend;
- rain: falling line and ripple at identical x/z;
- fish: time-driven swim plus tail deformation;
- bubbles: time-driven upward loop.

Never derive actor position from scroll progress unless it is intentionally a scroll-controlled demonstration.

### 7. Continuous Guide

The guide is one persistent mesh. Its chapter path is world-space. Project its 3D position into screen space using that chapter's actual camera, then interpolate across scene boundaries. For narrative handoffs, make scroll sample the handoff timeline; never force users to wait for a fixed-duration animation before allowing the next chapter.

### 8. Shadows

Use contact metadata from the alpha mask. Add one small soft ellipse per separate contact cluster. A bicycle usually needs two patches, one under each wheel; a tree needs one under the trunk; a walking animal may need multiple paw contacts per frame.

No silhouette-offset shadow for airborne or underwater assets. No large ellipse based on total sprite width. Keep opacity roughly 0.12-0.24 and vertical size very thin.

### 9. Narrated Autoplay

When requested:

- generate narration in the requested language and voice direction;
- never imitate a real person;
- make speech expressive with acted discoveries rather than broadcast prose;
- assemble a local audio track and metadata;
- use a linear monotonic mapping `progress = elapsed / secondsPerChapter`;
- begin muted autoplay after load when browser policy requires it;
- let audio permission or buffering fail independently from camera travel;
- expose play/pause, sound, speed, and elapsed time;
- pause on any manual navigation input;
- respect reduced motion by not auto-starting.

### 10. QA and Publish

Run deterministic contract tests, then browser QA at minimum:

- 1440x900 desktop;
- 390x844 portrait;
- 844x390 landscape;
- a narrow 320px viewport;
- a wide desktop when composition is expansive.

Capture every stable chapter plus both sides and midpoint of every transition. Compare frames over time to prove autonomous motion. Check contact shadows frame-by-frame. Only publish with `create-web-work` after all gates pass.

## Failure Modes That Must Stop the Run

- Static chapter is a flattened full-scene image instead of independent assets.
- Static asset positions are viewport percentages recalculated each frame.
- Source sheet is cropped or crosses cells.
- A neighbor fragment appears in a crop.
- Actor body, wheel, tail, branch, or stem is missing.
- Autonomous actor stops when scrolling stops.
- Duplicate guide objects pop at chapter boundaries.
- User must wait for an animation before scroll can continue.
- Shadows make assets look suspended or appear on fish/birds/floating leaves.
- Autoplay pauses at chapters or changes speed near boundaries.
- Audio buffering blocks visual progress.
- The ending chapter disappears during chapter reordering.
- Canvas is blank or important content overlaps at tested viewports.

## Delivery

State:

- chapter order;
- count and source of independent assets;
- autonomous motions added;
- whether autoplay is linear and whether audio defaults muted;
- voice language/style and duration;
- QA matrix and test results;
- published Work link.

Do not claim a voice sounds human or emotional based only on file validity. Say how it was directed and ask the creator to judge the subjective performance by listening.
