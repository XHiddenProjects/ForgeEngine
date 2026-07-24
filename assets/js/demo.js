"use strict";

// Relies on color.js, transform.js, canvas.js, shapes.js, constants.js, and
// structure.js already being loaded as sibling <script> tags before this
// file (see demo.html) - they attach Color/Transform/Canvas/Shapes/
// Constants/Sketch/createSketch onto window, the same way editor.js and
// dashboard.js rely on their own dependencies being loaded first.

// --- Canvas + Shapes setup -------------------------------------------
const canvas = new Canvas({
  id: "demo",
  width: 720,
  height: 440,
  bg: "#0b1020",
  ctx: "2d"
});
canvas.create();

const shapes = new Shapes(canvas);

// --- Scene state --------------------------------------------------------
const balls = [
  { x: 90, y: 80, r: 18, dx: 3.4, dy: 2.1, hue: 200 },
  { x: 300, y: 220, r: 26, dx: -2.6, dy: 3.0, hue: 320 },
  { x: 520, y: 140, r: 14, dx: 2.0, dy: -2.8, hue: 40 }
];

const orbit = { cx: 360, cy: 220, radius: 150, angle: 0 };

let sweepAngle = 0;

// --- Sketch: setup() runs once, draw() runs every frame -----------------
// (Sketch is the class the instance-mode helper is built on top of;
// createSketch(fn) is the instance-mode entry point that hands the
// running instance to `fn`.)
const sketch = new Sketch({
  canvas,
  setup() {
    canvas.frameRate(60);
  },
  draw() {
    canvas.background("#0b1020");

    // Sweeping translucent arc, driven by the Constants module
    // (TWO_PI/HALF_PI instead of hand-rolled Math.PI*2 everywhere).
    sweepAngle = (sweepAngle + 0.01) % TWO_PI;
    shapes.arc(orbit.cx, orbit.cy, orbit.radius * 2, orbit.radius * 2, 0, sweepAngle, "pie", "rgba(120, 170, 255, 0.10)");

    // Orbiting satellite, using Constants.TWO_PI for one full lap.
    orbit.angle = (orbit.angle + 0.02) % TWO_PI;
    const sx = orbit.cx + Math.cos(orbit.angle) * orbit.radius;
    const sy = orbit.cy + Math.sin(orbit.angle) * orbit.radius * 0.55;
    shapes.line(orbit.cx, orbit.cy, sx, sy, "rgba(255, 255, 255, 0.25)", 1);
    shapes.circle(sx, sy, 8, "#ffe9a8");

    // Bouncing, color-cycling balls, using Color to build/format each fill.
    for (const ball of balls) {
      ball.x += ball.dx;
      ball.y += ball.dy;

      if (ball.x - ball.r < 0 || ball.x + ball.r > canvas.canvas().width) ball.dx *= -1;
      if (ball.y - ball.r < 0 || ball.y + ball.r > canvas.canvas().height) ball.dy *= -1;

      ball.hue = (ball.hue + 0.6) % 360;
      const fillColor = Color.toString(Color.color(`hsl(${ball.hue}, 80%, 62%)`));
      shapes.circle(ball.x, ball.y, ball.r, fillColor);
    }

    // Small readout in the corner, drawn as a plain rect (no Text module
    // wired up in this demo).
    canvas.noStroke();
    canvas.fill("rgba(255,255,255,0.35)");
    shapes.rect(16, 16, 40 + 20 * Math.sin(sweepAngle), 4, "rgba(255,255,255,0.35)");
  }
});

sketch.start();

// Also exercise createSketch()/registerAddon() so both entry points in
// structure.js get demonstrated, not just `new Sketch(...)`:
Sketch.registerAddon((instance) => {
  console.log("[ForgeEngine demo] addon attached to sketch", instance);
});