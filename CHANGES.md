# Editor fixes — 2.5D/3D controls & usability

All changes are in `assets/js/editor.js`, plus a few small additions to
`assets/css/editor.css` to style new UI. No server/API code was touched.

## Root cause of "broken" orbit/fly + lag

The editor actually already had a correct, unified 2.5D/3D viewport
controller (bottom of `editor.js`) that does orbit/look/fly/pan and moves
the **selected object**, not the grid, when you drag it. But an older
prototype pan/zoom handler from earlier in the file was never gated to 2D
mode, so in 2.5D/3D it kept firing on top of the real controller:

- Every mouse-wheel tick was processed **twice**, by two different zoom
  curves/clamps (`.35–2.5` vs `.25–4`), fighting each other — this is what
  made zooming while orbiting/flying feel erratic.
- A global `mousemove` handler recomputed a 2D cursor readout and
  redrew the (invisible) flat grid canvas on *every single mouse move*,
  even while orbiting/flying in 3D — pure wasted work, i.e. the "lag."
- Middle-click panning triggered both the old and new pan systems at once.

**Fix:** all of those legacy handlers now bail out immediately unless
`state.mode === '2d'`. The 2.5D/3D controller is the sole owner of input
in those modes, exactly as its own header comment already claimed.

## Right-click "fly" popped a context menu on release

Holding RMB to look/fly and then releasing it fired the browser's
`contextmenu` event, which our custom context menu was listening for —
so every fly maneuver ended with an unwanted menu popup.

**Fix:** the controller now tracks whether an RMB drag actually moved the
camera. If it did, the next `contextmenu` event is swallowed once. A
genuine right-click (no drag) still opens the menu normally.

## Grid staying constant size while zooming

Already implemented correctly (adaptive grid step that doubles/halves to
keep cell size in a fixed pixel-per-unit band) — verified, no change needed.

## Placeholder controls replaced with real behavior

- **"+" viewport tab** used to just toast "a second viewport was added"
  with nothing actually added. It now creates a real second tab wired to
  the existing split/comparison view, and can be closed again.
- **Double-clicking an asset** used to toast "Opened X" and do nothing.
  It now opens a real preview modal (image render or type glyph +
  metadata) with working **Download** and **Attach to Selected Object**
  actions.
- **"Add Keyframe"** in the Animation panel used to toast a fake
  confirmation with nothing recorded. It now records the selected
  object's transform at the current frame (per object), shows recorded
  frames as ticks on a small track, and updates when you switch frames or
  selection.

## Axis gizmo lines (red/green/blue) not meeting cleanly at the origin

The 3D `project()` function uses a clamped linear depth scale
(`persp = clamp(1 - depth*.018, .2)`) rather than a true perspective (1/depth)
divide, so it does **not** preserve straightness for long world-space lines
the way a real pinhole-camera projection would. The old code drew each axis
as a single straight stroke between its two far-apart endpoints
(`worldLine`), so that stroke visibly diverged from where the line should
actually project to — and by a different amount per axis, since X/Y/Z have
different lengths. At one representative camera angle this was measured at
**~235px of divergence** on a ~380px-tall viewport, i.e. not a subtle
rounding error.

Grid cells never showed this because each grid line only spans one small
`step`, where the curvature is negligible.

**Fix:** added `worldPolyline()`, which samples several points along a
segment through `project()` instead of just its two endpoints. Each axis is
now drawn as two legs that both explicitly terminate at `project({0,0,0})`,
so all three axes are guaranteed — by construction, not just approximately —
to meet at the exact same screen point, with each leg's curvature sampled
finely enough to look smooth and consistent between axes.

## Already working (verified, not changed)
- Package Manager / Templates modals (browse, install/apply, download) —
  bundled sample packages & templates, real install/apply/download effects.
- Desktop right-click + mobile long-press context menus on hierarchy rows
  and viewport/3D objects, including "Attach Script…" / "Attach Asset…"
  which opens the same asset picker used by "+ Add Component".
