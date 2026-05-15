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
import { Models } from "./libs/models.js";
import { Lights } from "./libs/lights.js";

let ship;

// ─── Setup ────────────────────────────────────────────────────────────────────
window.setup = async function () {
  Canvex.createCanvas(0, 0, 700, 600, Canvex.WEBGL);

  // Camera/light setup is important: the outline should be subtle, while depth
  // should mostly come from lighting and smooth normals.
  Camera.perspective();
  Camera.camera(0, 18, 190, 0, 0, 0, 0, 1, 0);
  const color = Color.color('lightgreen');
  ship = await Models.load('assets/ship.obj',{
    material: {
      mode: 'ambient',
      ambient: [Color.red(color),Color.green(color),Color.blue(color),Color.alpha(color)]
    }
  });

};

// ─── Draw ─────────────────────────────────────────────────────────────────────
window.draw = function () {
  // Slightly lighter background than the ship so the outline can show.
  Canvex.background(Color.color(200));

  Interaction.orbitControl();


  Models.drawAll();
};