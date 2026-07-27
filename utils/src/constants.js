'use strict';

/**
 * Shared immutable constants for rendering, input, geometry, typography,
 * textures, filters, device orientation, and numeric conversions.
 *
 * @module constants
 */
const PI = Math.PI;

const constants = Object.freeze({
  VERSION: '1.0.0',

  // Graphics renderers
  P2D: 'p2d',
  P2DP3: 'p2d-p3',
  WEBGL: 'webgl',
  WEBGL2: 'webgl2',
  WEBGPU: 'webgpu',

  // Environment
  ARROW: 'default',
  SIMPLE: 'simple',
  FULL: 'full',
  CROSS: 'crosshair',
  HAND: 'pointer',
  MOVE: 'move',
  TEXT: 'text',
  WAIT: 'wait',

  // Trigonometry
  HALF_PI: PI / 2,
  PI,
  QUARTER_PI: PI / 4,
  TAU: PI * 2,
  TWO_PI: PI * 2,
  DEG_TO_RAD: PI / 180,
  RAD_TO_DEG: 180 / PI,

  // Shape
  CORNER: 'corner',
  CORNERS: 'corners',
  RADIUS: 'radius',
  RIGHT: 'right',
  LEFT: 'left',
  CENTER: 'center',
  TOP: 'top',
  BOTTOM: 'bottom',
  BASELINE: 'alphabetic',

  POINTS: 0x0000,
  LINES: 0x0001,
  LINE_LOOP: 0x0002,
  LINE_STRIP: 0x0003,
  TRIANGLES: 0x0004,
  TRIANGLE_STRIP: 0x0005,
  TRIANGLE_FAN: 0x0006,

  QUADS: 'quads',
  QUAD_STRIP: 'quad_strip',
  TESS: 'tess',

  EMPTY_PATH: 0x0007,
  PATH: 0x0008,

  CLOSE: 'close',
  OPEN: 'open',
  CHORD: 'chord',
  PIE: 'pie',

  PROJECT: 'square',
  SQUARE: 'butt',
  ROUND: 'round',
  BEVEL: 'bevel',
  MITER: 'miter',

  // DOM
  AUTO: 'auto',

  // Input
  ALT: 'Alt',
  BACKSPACE: 'Backspace',
  CONTROL: 'Control',
  DELETE: 'Delete',
  DOWN_ARROW: 'ArrowDown',
  ENTER: 'Enter',
  ESCAPE: 'Escape',
  LEFT_ARROW: 'ArrowLeft',
  OPTION: 'Alt',
  RETURN: 'Enter',
  RIGHT_ARROW: 'ArrowRight',
  SHIFT: 'Shift',
  TAB: 'Tab',
  UP_ARROW: 'ArrowUp',

  // Rendering
  BLEND: 'source-over',
  REMOVE: 'destination-out',
  ADD: 'lighter',
  DARKEST: 'darken',
  LIGHTEST: 'lighten',
  DIFFERENCE: 'difference',
  SUBTRACT: 'subtract',
  EXCLUSION: 'exclusion',
  MULTIPLY: 'multiply',
  SCREEN: 'screen',
  REPLACE: 'copy',
  OVERLAY: 'overlay',
  HARD_LIGHT: 'hard-light',
  SOFT_LIGHT: 'soft-light',
  DODGE: 'color-dodge',
  BURN: 'color-burn',

  // Filters
  THRESHOLD: 'threshold',
  GRAY: 'gray',
  OPAQUE: 'opaque',
  INVERT: 'invert',
  POSTERIZE: 'posterize',
  DILATE: 'dilate',
  ERODE: 'erode',
  BLUR: 'blur',

  // Typography
  NORMAL: 'normal',
  ITALIC: 'italic',
  BOLD: 'bold',
  BOLDITALIC: 'bold italic',
  CHAR: 'CHAR',
  WORD: 'WORD',

  // Typography internals
  _DEFAULT_TEXT_FILL: '#000000',
  _DEFAULT_LEADMULT: 1.25,
  _CTX_MIDDLE: 'middle',

  // Vertices
  LINEAR: 'linear',
  QUADRATIC: 'quadratic',
  BEZIER: 'bezier',
  CURVE: 'curve',

  // Draw modes
  STROKE: 'stroke',
  FILL: 'fill',
  TEXTURE: 'texture',
  IMMEDIATE: 'immediate',

  // Texture mode
  IMAGE: 'image',

  // Texture wrapping and filtering
  LINEAR_MIPMAP: 'linear_mipmap',
  NEAREST: 'nearest',
  REPEAT: 'repeat',
  CLAMP: 'clamp',
  MIRROR: 'mirror',

  // Geometry shading
  FLAT: 'flat',
  SMOOTH: 'smooth',

  // Device orientation
  LANDSCAPE: 'landscape',
  PORTRAIT: 'portrait',

  // Defaults
  _DEFAULT_STROKE: '#000000',
  _DEFAULT_FILL: '#FFFFFF',

  GRID: 'grid',
  AXES: 'axes',
  LABEL: 'label',
  FALLBACK: 'fallback',

  CONTAIN: 'contain',
  COVER: 'cover',

  // Data types
  UNSIGNED_BYTE: 'unsigned-byte',
  UNSIGNED_INT: 'unsigned-int',
  FLOAT: 'float',
  HALF_FLOAT: 'half-float',

  // Spline endpoint modes
  INCLUDE: Symbol('include'),
  EXCLUDE: Symbol('exclude'),
  JOIN: Symbol('join')
});

module.exports = constants;