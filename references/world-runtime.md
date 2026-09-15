# World Runtime

## Scene structure

Use config data, not hand-coded one-off DOM layers:

```js
{
  id: 'woodland',
  camera: { from: [-2, 1.7, 17], to: [-1.3, 1.4, 9], fov: 26 },
  look: [-1.3, 1.3, -6],
  guidePath: [[-.7,1.8,.6],[-1.1,.9,-3],[-.3,1.8,-7]],
  elements: [
    { asset: 'maple-large', x: 1.2, y: 0, z: -12, height: 5.4 },
    { asset: 'squirrel-nibble', x: -.8, y: 0, z: -2, height: 1.2, motion: 'time' }
  ]
}
```

Static geometry is immutable after build. Store base vectors and scales; animation applies temporary offsets each frame and resets from base first.

## Anchoring

For a plane with asset metadata:

```js
const width = height * meta.width / meta.height;
const x = element.x + (0.5 - meta.centroidX) * width;
const y = element.y + (meta.groundLine - 0.5) * height;
```

This puts the horizontal visual centroid at `element.x` and ground line at `element.y`.

## Depth

Use depth to create inspectable parallax:

| Layer | Typical z |
|---|---:|
| near foreground | 0 to 4 |
| actor/focus | -2 to -8 |
| middle objects | -8 to -20 |
| far objects | -20 to -35 |
| broad distant bands | -35 to -70 |

Avoid rows where every object shares one z. Do not compensate for weak depth by scaling objects from viewport dimensions at runtime.

## Camera

- Perspective camera, FOV 24-30 desktop.
- Portrait may widen to 30-36.
- Interpolate camera start/end inside a scene.
- To follow a guide, add small x/y offsets with a slight delay.
- Keep the look target stable enough that horizon does not wobble.

## Drag

Drag changes view, not scene data:

```js
camera.position.x += dragX;
camera.position.y += dragY;
look.x += dragX;
look.y += dragY;
camera.lookAt(look);
```

Bound offsets and damp them. Release pointer capture outside the canvas. On touch, keep vertical movement for page scroll; engage pan only after horizontal intent.

## Guide object

Use one persistent guide mesh. Keep a three-point path per scene and project its world point with that scene camera:

```js
const ndc = worldPoint.clone().project(sceneCamera);
const screenX = (ndc.x + 1) / 2;
const screenY = (1 - ndc.y) / 2;
```

Interpolate its screen position across scene transitions. Do not duplicate the guide in scene element lists.

## Transitions

Recommended chapter mapping:

- 80-88%: clear scene and camera travel;
- 12-20%: handoff to next scene.

The stable section remains opacity 1. During a crossfade, render each chapter with its own camera and opacity. Preserve the ending chapter when reordering.

Narrative transitions may have internal stages, but scroll samples those stages. Never rewrite page progress to force users to wait.