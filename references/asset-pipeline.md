# Asset Pipeline

## Asset contract

Every source item must have one semantic identity and one drawable object. A valid tree includes trunk and crown; a valid bicycle actor includes both wheels and the complete rider; a valid grass clump includes its base. A scene image containing several objects is not a valid source item.

Record:

```json
{
  "id": "tree-maple-large",
  "file": "assets/elements/tree-maple-large.webp",
  "width": 318,
  "height": 472,
  "centroidX": 0.49,
  "groundLine": 0.96,
  "category": "grounded",
  "contacts": [{ "x": 0.49, "y": 0.96, "width": 0.13 }]
}
```

`centroidX` and `groundLine` use normalized image coordinates. Contact points are measured from actual opaque pixels, not guessed from full sprite width.

## 4x4 generation

Use the `referenced-4x4-asset-sheet` skill. Attach both:

1. mandatory 4x4 grid reference;
2. current world's style anchor.

Prompt structure:

```text
Use reference 1 strictly as mandatory 4x4 spatial layout.
Use reference 2 only for watercolor line, pigment, edge, and palette.
Exactly 16 independent complete objects, one in each cell.
32px safe margin, no crossing, no shadows, no ground, no scenery,
no text, no labels, no grid in output.
[slot list]
```

If transparency generation paints checkerboard squares, regenerate on solid white. Do not attempt to key a painted checkerboard.

## Crop method

Do not blindly slice the nominal cell. Preferred method:

1. preserve native alpha or estimate edge-connected background;
2. segment connected components on the full source sheet;
3. assign each whole component to the cell containing its centroid;
4. crop all components owned by that cell;
5. add 10-18px transparent margin;
6. recenter into a stable output canvas;
7. write metadata and a numbered contact sheet.

Whole-sheet segmentation avoids assigning the bottom of one tree to the bird cell below it.

## QA

Reject an asset if:

- alpha bbox touches outer 8px;
- expected parts are absent at the source edge;
- content from a neighbor cell is present;
- an actor frame changes identity, aspect, wheelbase, clothing, or object count;
- a white/transparent halo dominates edges;
- visual style differs materially from the anchor.

Inspect the numbered contact sheet yourself. Automated margin checks cannot detect a limb already missing from source art.

## Actor atlases

Use `production-spritesheet-builder`. Define action semantics before generation. For a generated action atlas:

- attach exact grid reference plus identity reference;
- one complete actor per frame;
- stable scale, camera, baseline, and identity;
- no motion smears crossing cells;
- use chroma key only when key color is absent from the actor;
- keep a shared runtime canvas after alpha-tight QA;
- test every frame and loop seam.

Do not install a draft atlas until visual approval.