'use strict';

// Forge Engine demo / entry point.
//
// Lives at /assets/js/ForgeEngine.js and is loaded as a plain sibling
// <script> tag alongside the engine files themselves (Transform.js,
// color.js, canvas.js, shapes.js, text.js - see /utils, per
// package.json's @forgeEngine/utils package). Because those files are
// loaded the same way (see the notes at the top of each of them), Canvas,
// Shapes, Text, Color, and Transform are all already sitting on the global
// scope by the time this file runs - no require()/import needed here.
//
// Expected <script> order in index.html:
//   <script src="/utils/transform.js"></script>
//   <script src="/utils/color.js"></script>
//   <script src="/utils/canvas.js"></script>
//   <script src="/utils/shapes.js"></script>
//   <script src="/utils/text.js"></script>
//   <script src="/assets/js/ForgeEngine.js"></script>
//
// This demo uses Canvas's built-in sketch loop: define global `init()` and
// `frame()` functions (below), and canvas.init() calls `init()` once the
// page has loaded, then runs `frame()` on every requestAnimationFrame tick
// (throttled to canvas.frameRate(), 60fps by default).

const canvas = new Canvas({
    id: 'forge-demo',
    width: 800,
    height: 500,
    bg: Color.color(51),
    ctx: '2d'
});

let shapes, text;
let angle = 0;
let paused = false;
let pauseButton;

/**
 * Runs once, after the page finishes loading. Good place to create the
 * canvas and any drawing helpers, and to draw anything that doesn't need to
 * change every frame.
 */
function init() {
    canvas.create();
    shapes = new Shapes(canvas);
    text = new Text(canvas);
    canvas.frameRate(60);
    canvas.fill(Color.brightness(Color.color(255)));
}


/**
 * Runs on every animation frame (throttled to canvas.frameRate()). Good
 * place for anything that animates.
 */
function frame() {
    
}

canvas.init();