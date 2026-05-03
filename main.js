import { Canvex } from "./libs/canvex.js";
import { Canvas } from "./libs/canvas.js";
import { Shapes } from "./libs/shapes.js";
import { Interaction } from "./libs/interaction.js";
import { Camera } from "./libs/camera.js";
import { math } from "./libs/math.js";
import { Charts } from "./libs/charts.js";
import { pointer } from "./libs/events.js";
import { Helpers } from "./libs/helpers.js";
import { Triggers } from './libs/triggers.js';
import { Logic } from "./libs/logic.js";
import { DateTime } from './libs/datetime.js';

const canvasWidth = 500;
const canvasHeight = 500;

window.setup = function () {
  Canvex.createCanvas(0, 0, canvasWidth, canvasHeight, Canvex.WEBGL);
  
  Canvex.background(200);

};




window.draw = function () {

};

