import { Canvex } from "./libs/canvex.js";
import { Canvas } from "./libs/canvas.js";
import { Shapes } from "./libs/shapes.js";
import { Interaction } from "./libs/interaction.js";
import { Camera } from "./libs/camera.js";
import { math } from "./libs/math.js";
import { Charts } from "./libs/charts.js";
import { pointer, Keyboard } from "./libs/events.js";
import { Helpers } from "./libs/helpers.js";
import { Triggers } from './libs/triggers.js';
import { Logic } from "./libs/logic.js";
import { DateTime } from './libs/datetime.js';
import { Multiplayer } from "./libs/mutliplayer.js";
import { Text } from "./libs/text.js";
import { GUI } from "./libs/gui.js";
import { Elements } from "./libs/elements.js";
import { Devices } from "./libs/devices.js";
import { List } from "./libs/list.js";
import { Physics } from "./libs/physics.js";
import { Transform } from './libs/transforms.js'
import { Color } from "./libs/color.js";
import { Sound } from "./libs/sound.js";
import { Flow } from "./libs/flow.js";
import { Sprites } from "./libs/sprites.js";
import { Image } from "./libs/image.js";
import { PixelArt } from "./editors/pixelart.js";

const canvasWidth  = 500;
const canvasHeight = 500;

// ─── Setup ────────────────────────────────────────────────────────────────────
window.setup = async function () {
  Canvex.createCanvas(0, 0, canvasWidth, canvasHeight);
  Canvex.background(Color.color(200));
  const x = new PixelArt('.pixel-container',{
    cols:32,
    rows: 32,
    showGrid: true
  });
  
};

// ─── Draw ─────────────────────────────────────────────────────────────────────
window.draw = function () {

};