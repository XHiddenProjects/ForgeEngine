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
Storage = require('./src/storage.js'),
MathUtils = require('./src/math.js'),
Data = require('./src/data.js'),
Events = require('./src/events.js'),
Elements = require('./src/elements.js'),
ImageModule = require('./src/image.js'),
Environment = require('./src/environment.js'),
Rendering = require('./src/rendering.js'),
ThreeD = require('./src/3d.js'),
StructureModule = require('./src/structure.js'),
Constants = require('./src/constants.js'),
Foundation = require('./src/foundation.js');

module.exports = {
    // Shape category: 2D/3D primitives, custom shapes, curves.
    Canvas,
    Shapes,
    // Transform category: matrix helpers used to position/rotate/scale shapes.
    Transform,
    // Color category: creating/reading/setting colors.
    Color,
    // Typography category: text drawing and font metrics.
    Text,
    Typography,
    // IO category: file/network input and Time & Date helpers.
    IO,
    // DOM category: creating and querying page elements.
    DOM,
    Element: Elements.Element,
    ElementFile: Elements.ElementFile,
    ElementMedia: Elements.ElementMedia,
    Sound,
    Storage,
    // Math category: Vector class plus Calc/Random/Noise/Trig/Quaternion namespaces.
    Vector: MathUtils.Vector,
    Calc: MathUtils.Calc,
    Random: MathUtils.Random,
    Noise: MathUtils.Noise,
    Trig: MathUtils.Trig,
    Quaternion: MathUtils.Quaternion,
    // Data category: type conversion + formatting/parsing utilities.
    Data,
    // Events category: mouse/pointer/keyboard/touch state and callbacks.
    Events,
    // Image category: portable RGBA pixel buffer (get/set/filter/resize/mask/blend/...).
    Image: ImageModule.Image,
    createImage: ImageModule.createImage,
    loadImage: ImageModule.loadImage,
    // Environment category: window/display info, cursor, fullscreen, a11y descriptions, URL helpers.
    Environment,
    // Rendering category: createCanvas/createGraphics/createFramebuffer + Graphics/Framebuffer classes.
    createCanvas: Rendering.createCanvas,
    createGraphics: Rendering.createGraphics,
    createFramebuffer: Rendering.createFramebuffer,
    noCanvas: Rendering.noCanvas,
    resizeCanvas: Rendering.resizeCanvas,
    setAttributes: Rendering.setAttributes,
    clearDepth: Rendering.clearDepth,
    drawingContext: Rendering.drawingContext,
    Graphics: Rendering.Graphics,
    Framebuffer: Rendering.Framebuffer,
    // 3D category: Camera, Lights, Material for WebGL sketches.
    Camera: ThreeD.Camera,
    Lights: ThreeD.Lights,
    Material: ThreeD.Material,
    // Structure category: setup()/draw() sketch lifecycle, on top of Canvas.
    Sketch: StructureModule.Sketch,
    structure: StructureModule.createSketch,
    // Constants category: named engine-wide constants (PI, WEBGL, DEGREES, ...).
    Constants,
    // Foundation category: core JS language glossary + small type-check helpers.
    Foundation
};