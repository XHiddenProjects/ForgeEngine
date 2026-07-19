// Entry point for using ForgeEngine's building blocks from Node code
// (as opposed to browser usage via page.addScriptTag, which server.js does).
const Canvas = require('./src/canvas.js');
const Shapes = require('./src/shapes.js');
const Transform = require('./src/transform.js');
const Color = require('./src/color.js');
const Text = require('./src/text.js');

module.exports = { Canvas, Shapes, Transform, Color, Text};
