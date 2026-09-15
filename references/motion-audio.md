# Motion, Shadows, and Narration

## Driver separation

Every animated field declares one driver:

```text
scroll  camera path, scene transition, explicitly scrubbed story action
time    character locomotion, wings, wind, rain, fish, bubbles
guide   one persistent clue object's journey
```

Time motion stops only when the page or motion controls are paused, not when scrolling stops. Compare positions at fixed `scrollY` over 300-1000ms to prove this.

## Motion patterns

- Walk: tie frame phase to distance; stop before reversing; mirror only if atlas supports direction.
- Cyclist: always face travel direction; pedal and translate from elapsed time; hide offstage reset with short edge fade.
- Bird: alternate approved wing poses and translate independently with elapsed time.
- Rooted plant/tree: use subdivided plane and vertex bend weighted by height above root.
- Fish: time-driven translation, slight y wave, tail deformation, edge fade/reset.
- Bubble: repeat y rise with light x oscillation and fade at loop edges.
- Rain: drop endpoint and ripple center share exact x/z.

Reduced motion freezes all time-driven motion at a valid base pose.

## Ground shadows

Silhouette-offset shadows are forbidden: they read as a second floating sprite.

Generate contact metadata from the lowest opaque alpha band. Split separate clusters, so two wheels create two contacts. At runtime:

1. transform each normalized contact point through actor matrix;
2. place a thin soft ellipse at that world point;
3. width follows contact cluster, not entire sprite;
4. opacity 0.12-0.24;
5. frame atlas uses per-frame contacts.

No floor shadows for clouds, birds, floating leaves, fish, bubbles, water surfaces, or suspended roots. Water-surface response is a ripple, not a dark ellipse.

## Narration writing

Write narration as discovery, not description. Prefer:

```text
“Oh! Did you see that?”
“Shh... listen.”
“Wait—where are the bubbles taking me?”
```

Avoid eight paragraphs with identical sentence structure. Direct emotional contrast by chapter: curious, delighted, hushed, surprised, intimate farewell.

## TTS

Use an available TTS generation model and inspect its declaration. For a designed original child voice:

- specify language/accent;
- state approximate age range;
- request childlike vocal tract/pitch, not an adult voice pitched up;
- describe acted emotional variation;
- explicitly reject broadcast cadence, sing-song rhythm, forced squeak, and real-person imitation;
- keep provider voice prompt under its declared limit;
- generate a canonical first clip, then clone that generated clip across chapters for identity consistency.

Do not claim emotional quality based on file validity. Human listening is required.

## Continuous autoplay

For constant speed, the mapping is exactly linear:

```js
progress = clamp(elapsedSeconds / secondsPerChapter, 0, chapterCount);
```

Use equal-duration chapter slots. Do not apply smoothstep/easing in the autoplay timeline. The Three.js camera must also use local linear progress unless the creator explicitly asks for cinematic easing.

Start visual autoplay immediately after assets load. Because browsers block unmuted autoplay, default to muted motion and expose a sound button. Audio is optional synchronization media, never the authoritative visual clock: buffering must not stop camera travel.

Manual wheel, pointer drag, scrollbar, keyboard navigation, or chapter buttons pause autoplay and narration. Resume from `timeAtProgress(currentProgress)`.

Controls:

- play/pause icon + short label;
- sound toggle;
- 0.8x / 1x / 1.2x speed;
- elapsed/total time;
- reduced-motion: do not auto-start.