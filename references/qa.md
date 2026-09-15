# QA and Publish Gates

## Asset QA

For every asset:

- alpha exists and content is non-empty;
- outer 8-10px are transparent;
- source is semantically complete;
- no adjacent-cell fragments;
- metadata aspect and anchors are valid;
- numbered contact sheet inspected.

For actor atlases, inspect all frames, identity, contacts, loop seam, baseline, and source containment.

## Runtime contract tests

Test:

- unique chapter and asset ids;
- world-space `x/y/z/height` are finite;
- camera FOV/range valid;
- meaningful z spread;
- guide path exists in every illustrated chapter;
- exactly one persistent guide runtime object;
- autonomous motion declares `driver: time`;
- ending chapter preserved;
- narration ids match chapter order;
- autoplay chapter durations are equal and progress derivative is constant;
- no shadow assigned to air/water categories.

## Browser matrix

At minimum:

```text
1440x900
390x844
844x390
320x568
wide desktop if relevant
```

Capture:

- stable midpoint of every chapter;
- transition start/middle/end for each boundary;
- before/after drag;
- before/after 300-1000ms at fixed scroll;
- first and last autoplay frame;
- reduced-motion mode.

## Canvas checks

- prove nonblank pixels in every screenshot;
- check subject focal region, not only global variance;
- no text overlap;
- no incoherent clipping;
- no horizontal document overflow;
- guide colored pixels visible in every chapter;
- contact shadows stay within a small vertical distance of measured contact;
- no rectangular/silhouette shadow artifacts.

## Motion checks

At fixed scroll:

- actor/world position changes for autonomous travel;
- bird wing frame changes;
- plant bend changes while root position stays fixed;
- rain endpoint and ripple center match;
- bubble y changes;
- pause freezes all time-driven values;
- scroll changes camera but does not mutate static geometry.

## Autoplay/audio checks

- starts immediately after load (except reduced motion);
- visual progress changes even when audio is muted or blocked;
- progress derivative is constant before/after boundaries;
- no per-scene hold;
- sound toggle starts requested narration track;
- correct language metadata and local track URL;
- playback rate works;
- pause/resume preserves position;
- manual input pauses mode;
- ending remains visible and replay returns to start;
- decode succeeds and peak audio level has headroom.

## Publish gate

Do not publish until:

- contract validator passes;
- asset and source visual QA pass;
- browser console/network have no relevant errors;
- all target viewport screenshots inspected;
- autonomous motion proven at fixed scroll;
- shadows visually grounded;
- audio behavior tested with and without autoplay permission.

Keep QA files outside the final public package unless the creator requests them.