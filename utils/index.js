// Entry point for using ForgeEngine's building blocks from Node code
// (as opposed to browser usage via page.addScriptTag, which server.js does).
const Canvas = require('./src/canvas.js'),
Shapes = require('./src/shapes.js'),
Transform = require('./src/transform.js'),
Color = require('./src/color.js'),
Text = require('./src/text.js'),
Typography = require('./src/typography.js'),
IO = require('./src/io.js'),
DOM = require('./src/dom.js'),
Sound = require('./src/sound.js'),
Storage = require('./src/storage.js');

module.exports = { 
    Canvas, 
    Shapes, 
    Transform, 
    Color, 
    Text, 
    Typography, 
    IO, 
    DOM, 
    Sound,
    Storage
};
