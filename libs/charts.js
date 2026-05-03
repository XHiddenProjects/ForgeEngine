import { Canvex } from "./canvex.js";
import { Canvas } from "./canvas.js";
import { Shapes } from "./shapes.js";
import { math } from "./math.js";
import { Keyboard, pointer, Window as CanvexWindow, controller, sensor } from "./events.js";
import { Transform } from "./transforms.js";
import { Lights } from "./lights.js";
import { Camera } from "./camera.js";
import { Interaction } from "./interaction.js";

// Re-export every event class individually so callers can tree-shake as needed.
export { Keyboard, pointer, controller, sensor };
export { CanvexWindow as Window };
export { Transform };

// Convenience namespace bundles preserved for backward-compat with code that did
//   import { Events, Transforms } from "./charts.js"
export const Events = { Keyboard, pointer, Window: CanvexWindow, controller, sensor };
export const Transforms = { Transform };

const PALETTE = [
  { background: "rgba(54, 162, 235, 0.75)", border: "rgb(54, 162, 235)" },
  { background: "rgba(255, 99, 132, 0.75)", border: "rgb(255, 99, 132)" },
  { background: "rgba(75, 192, 192, 0.75)", border: "rgb(75, 192, 192)" },
  { background: "rgba(255, 205, 86, 0.75)", border: "rgb(255, 205, 86)" },
  { background: "rgba(153, 102, 255, 0.75)", border: "rgb(153, 102, 255)" },
  { background: "rgba(255, 159, 64, 0.75)", border: "rgb(255, 159, 64)" },
  { background: "rgba(201, 203, 207, 0.75)", border: "rgb(201, 203, 207)" }
];

export const ChartTypes = [
  "bar", "line", "scatter", "bubble", "pie", "doughnut", "polarArea", "radar",
  "bar3d", "pie3d", "doughnut3d", "polarArea3d",
  "stackedBar", "area", "histogram", "gantt"
];

function pick(obj, keys) {
  for (const key of keys) if (obj && obj[key] != null) return obj[key];
  return undefined;
}

function getContext(item) {
  if (item?.canvas && typeof item.canvas.getContext === "function") return item.canvas.getContext("2d");
  if (typeof item?.getContext === "function") return item.getContext("2d");
  if (typeof item === "string" && typeof document !== "undefined") return document.getElementById(item)?.getContext("2d");
  const ctx = item
    ?? pick(Canvas, ["ctx", "context", "_ctx", "canvasContext"])
    ?? pick(Canvex, ["ctx", "context", "_ctx", "canvasContext"])
    ?? (typeof Canvas.getContext === "function" ? Canvas.getContext() : undefined)
    ?? (typeof Canvex.getContext === "function" ? Canvex.getContext() : undefined);
  const resolved = typeof ctx === "function" ? ctx() : ctx;
  if (!resolved) throw new Error("Charts: no 2D canvas context found. Expose ctx/context from canvas.js or canvex.js.");
  return resolved;
}

function getSize(ctx) {
  const canvas = ctx.canvas ?? pick(Canvex, ["canvas", "el", "element"]);
  return {
    width: Number(pick(Canvex, ["width", "w"]) ?? canvas?.width ?? 800),
    height: Number(pick(Canvex, ["height", "h"]) ?? canvas?.height ?? 450)
  };
}

function isObject(v) { return v && typeof v === "object" && !Array.isArray(v); }
function merge(base = {}, extra = {}) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra ?? {})) out[k] = isObject(v) ? merge(base?.[k] ?? {}, v) : v;
  return out;
}
function resolve(value, context, fallback) {
  const v = typeof value === "function" ? value(context, context?.options ?? {}) : value;
  if (Array.isArray(v) && context?.dataIndex != null) return v[context.dataIndex % v.length];
  return v ?? fallback;
}
function normalizeDatasets(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    if (input.length && input[0] && Object.prototype.hasOwnProperty.call(input[0], "data")) return input;
    return [{ label: "Dataset", data: input }];
  }
  if (Array.isArray(input.datasets)) return input.datasets;
  if (Array.isArray(input.data)) return [{ ...input, data: input.data }];
  return [];
}
function normalizeLabels(labels, datasets) {
  if (Array.isArray(labels)) return labels;
  const first = datasets[0]?.data ?? [];
  return first.map((v, i) => (v && typeof v === "object" ? (v.label ?? v.x ?? String(i + 1)) : String(i + 1)));
}
function yValue(v) { return typeof v === "number" ? v : Number(v?.y ?? v?.value ?? v?.data ?? v ?? 0); }
function xValue(v, i) { return v && typeof v === "object" && v.x != null && !Number.isNaN(Number(v.x)) ? Number(v.x) : i; }
function rValue(v, fallback = 5) { return v && typeof v === "object" && v.r != null ? Number(v.r) : fallback; }
function baseChartType(type = "bar") {
  const normalized = String(type ?? "bar");
  if (/3d$/i.test(normalized)) return normalized.slice(0, -2);
  return normalized;
}
function is3DChart(type, opts = {}) {
  return /3d$/i.test(String(type ?? "")) || opts?.threeD?.enabled === true || opts?.plugins?.threeD?.enabled === true;
}
function get3DOptions(opts = {}) {
  return merge(
    { enabled: false, depth: 18, angle: Math.PI / 4, alpha: 0.22, shadow: true },
    merge(opts?.plugins?.threeD ?? {}, opts?.threeD ?? {})
  );
}
function colorWithAlpha(color, alpha = 1) {
  if (typeof color !== "string") return color;
  if (color.startsWith("rgba(")) return color.replace(/rgba\(([^)]+)\)/, (_, values) => {
    const parts = values.split(",").map(v => v.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${Number(parts[3] ?? 1) * alpha})`;
  });
  if (color.startsWith("rgb(")) return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  return color;
}
function shadeColor(color, amount = 0) {
  if (typeof color !== "string") return color;
  let r, g, b, a = 1;
  const rgba = color.match(/rgba?\(([^)]+)\)/i);
  if (rgba) {
    const parts = rgba[1].split(",").map(v => Number.parseFloat(v.trim()));
    [r, g, b] = parts; a = Number.isFinite(parts[3]) ? parts[3] : 1;
  } else if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    const n = parseInt(hex, 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  } else {
    return color;
  }
  const mix = amount >= 0 ? 255 : 0;
  const pct = Math.abs(amount);
  r = Math.round(r + (mix - r) * pct);
  g = Math.round(g + (mix - g) * pct);
  b = Math.round(b + (mix - b) * pct);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function threeDOffset(opts = {}) {
  const cfg = get3DOptions(opts);
  const depth = Math.max(0, Number(cfg.depth ?? 18));
  const angle = Number(cfg.angle ?? Math.PI / 4);
  return { depth, dx: Math.cos(angle) * depth, dy: Math.sin(angle) * depth, cfg };
}
function lightsShadeColor(baseColor, normalDot, defaultAmount) {
  const lightState = Lights.state;
  if (!lightState.enabled) return shadeColor(baseColor, defaultAmount);
  // Accumulate ambient + directional contributions as a brightness multiplier
  let r = 0, g = 0, b = 0;
  for (const amb of lightState.ambient) {
    r += amb.color01[0]; g += amb.color01[1]; b += amb.color01[2];
  }
  for (const dir of lightState.directional) {
    const diffuse = Math.max(0, normalDot * dir.color01[0]);
    r += diffuse * dir.color01[0];
    g += diffuse * dir.color01[1];
    b += diffuse * dir.color01[2];
  }
  const brightness = Math.min(1, (r + g + b) / 3);
  // Map brightness to a shade amount in [-0.4, 0.4]
  return shadeColor(baseColor, (brightness - 0.5) * 0.8);
}
function drawBar3D(ctx, x, y, w, h, style, opts) {
  const { dx, dy, cfg } = threeDOffset(opts);
  if (!dx && !dy) { rect(ctx, x, y, w, h, true, false); return; }
  const front = style.backgroundColor;
  // Use Lights shading when lights are active; otherwise fall back to fixed offsets
  const top = lightsShadeColor(front, 0.9, 0.16);
  const side = lightsShadeColor(front, 0.3, -0.18);
  const edge = style.borderColor ?? shadeColor(front, -0.28);
  ctx.save();
  if (cfg.shadow) {
    ctx.shadowColor = colorWithAlpha("#000", 0.14);
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = dx * 0.35;
    ctx.shadowOffsetY = dy * 0.35;
  }
  ctx.strokeStyle = edge;
  ctx.lineWidth = style.borderWidth ?? 1;
  ctx.fillStyle = side;
  ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w + dx, y - dy); ctx.lineTo(x + w + dx, y + h - dy); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = top;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y - dy); ctx.lineTo(x + w + dx, y - dy); ctx.lineTo(x + w, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = front;
  ctx.fillRect(x, y, w, h);
  if ((style.borderWidth ?? 0) > 0) ctx.strokeRect(x, y, w, h);
  ctx.restore();
}
function arcPath(ctx, cx, cy, outerR, innerR, start, end) {
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, start, end);
  if (innerR > 0) ctx.arc(cx, cy, innerR, end, start, true);
  else ctx.lineTo(cx, cy);
  ctx.closePath();
}
function drawArc3D(ctx, cx, cy, outerR, innerR, start, end, style, opts) {
  const { depth, cfg } = threeDOffset(opts);
  const steps = Math.max(1, Math.ceil(depth));
  ctx.save();
  if (cfg.shadow) {
    ctx.shadowColor = colorWithAlpha("#000", 0.12);
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = depth * 0.25;
  }
  for (let i = steps; i >= 1; i--) {
    arcPath(ctx, cx, cy + i, outerR, innerR, start, end);
    ctx.fillStyle = lightsShadeColor(style.backgroundColor, 0.2, -0.2);
    ctx.fill();
  }
  ctx.shadowColor = "transparent";
  arcPath(ctx, cx, cy, outerR, innerR, start, end);
  ctx.fillStyle = style.backgroundColor;
  ctx.fill();
  ctx.strokeStyle = style.borderColor;
  ctx.lineWidth = style.borderWidth;
  ctx.stroke();
  ctx.restore();
}
function niceMax(max) { max = Math.max(1, Number(max) || 1); const pow = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / pow) * pow; }
function niceScaleBounds(values, beginAtZero = true) {
  values = values?.length ? values : [0];
  const min = beginAtZero ? 0 : Math.min(...values, 0);
  const max = niceMax(Math.max(...values, 0));
  return { min, max };
}
function interpolatedScaleBounds(fromValues, toValues, progress, beginAtZero = true) {
  const from = niceScaleBounds(fromValues, beginAtZero);
  const to = niceScaleBounds(toValues, beginAtZero);
  return { min: math.lerp(from.min, to.min, progress), max: math.lerp(from.max, to.max, progress) };
}
function visibilityScaleProgress(transition, progress) { return transition ? progress : 1; }
function easing(name, t) {
  t = math.constrain(t, 0, 1);
  const f = {
    linear: t,
    easeInQuad: t * t,
    easeOutQuad: t * (2 - t),
    easeInOutQuad: t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeOutQuart: 1 - (--t) * t * t * t,
    easeInOutQuart: t < .5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
    easeOutBounce: (function(x){ const n1=7.5625,d1=2.75; if(x<1/d1)return n1*x*x; if(x<2/d1)return n1*(x-=1.5/d1)*x+.75; if(x<2.5/d1)return n1*(x-=2.25/d1)*x+.9375; return n1*(x-=2.625/d1)*x+.984375; })(t)
  };
  return f[name] ?? f.easeOutQuart;
}

export const defaultOptions = {
  // Core chart options
  responsive: false,
  maintainAspectRatio: true,
  aspectRatio: 2,
  resizeDelay: 0,
  devicePixelRatio: undefined,
  backgroundColor: undefined,
  color: "#666",
  threeD: { enabled: false, depth: 18, angle: Math.PI / 4, alpha: 0.22, shadow: true },
  font: { family: "Arial, sans-serif", size: 12, style: "normal", weight: null, lineHeight: 1.2 },
  locale: undefined,
  indexAxis: "x",
  parsing: true,
  normalized: false,
  clip: undefined,
  order: 0,
  showLine: true,
  spanGaps: false,
  events: ["mousemove", "mouseout", "click", "touchstart", "touchmove"],
  onHover: undefined,
  onClick: undefined,
  onResize: undefined,

  // Chart.js animation namespaces: options.animation, options.animations, options.transitions
  animation: { duration: 1000, easing: "easeOutQuart", delay: 0, loop: false, onProgress: undefined, onComplete: undefined },
  animations: {
    numbers: { type: "number", properties: ["x", "y", "borderWidth", "radius", "tension"] },
    colors: { type: "color", properties: ["color", "borderColor", "backgroundColor"] },
    x: undefined, y: undefined, radius: undefined, tension: undefined, borderWidth: undefined, backgroundColor: undefined, borderColor: undefined
  },
  transitions: {
    active: { animation: { duration: 400 } },
    resize: { animation: { duration: 0 } },
    show: { animations: { colors: { from: "transparent" }, visible: { type: "boolean", duration: 0 } } },
    hide: { animations: { colors: { to: "transparent" }, visible: { type: "boolean", easing: "linear", fn: v => v | 0 } } }
  },

  // Interaction and hover
  interaction: { mode: "nearest", intersect: true, axis: "xy", includeInvisible: false },
  hover: { mode: undefined, intersect: undefined, axis: undefined, animationDuration: 400 },

  // Layout
  layout: { autoPadding: true, padding: 60 },

  // Built-in plugin option namespaces
  plugins: {
    colors: { enabled: true, forceOverride: false },
    decimation: { enabled: false, algorithm: "min-max", samples: undefined, threshold: undefined },
    filler: { propagate: true, drawTime: "beforeDatasetDraw" },
    legend: {
      display: true,
      position: "top",
      align: "center",
      maxHeight: undefined,
      maxWidth: undefined,
      fullSize: true,
      reverse: false,
      rtl: undefined,
      textDirection: undefined,
      onClick: undefined,
      onHover: undefined,
      onLeave: undefined,
      labels: {
        boxWidth: 12,
        boxHeight: undefined,
        color: "#333",
        font: { size: 12, family: "Arial, sans-serif", style: "normal", weight: null, lineHeight: 1.2 },
        padding: 10,
        pointStyle: undefined,
        textAlign: undefined,
        usePointStyle: false,
        pointStyleWidth: undefined,
        useBorderRadius: false,
        borderRadius: undefined,
        generateLabels: undefined,
        filter: undefined,
        sort: undefined
      },
      title: { display: false, text: "", color: "#666", font: { size: 12, weight: "bold" }, padding: 0 }
    },
    title: {
      display: true,
      text: undefined,
      color: "#111",
      font: { size: 20, family: "Arial, sans-serif", style: "normal", weight: "bold", lineHeight: 1.2 },
      padding: { top: 0, bottom: 10 },
      position: "top",
      align: "center",
      fullSize: true
    },
    subtitle: {
      display: false,
      text: undefined,
      color: "#666",
      font: { size: 14, family: "Arial, sans-serif", style: "normal", weight: null, lineHeight: 1.2 },
      padding: { top: 0, bottom: 8 },
      position: "top",
      align: "center",
      fullSize: true
    },
    tooltip: {
      enabled: true,
      external: undefined,
      mode: undefined,
      intersect: undefined,
      position: "average",
      xAlign: undefined,
      yAlign: undefined,
      itemSort: undefined,
      filter: undefined,
      backgroundColor: "rgba(0,0,0,0.8)",
      titleColor: "#fff",
      titleFont: { weight: "bold" },
      titleAlign: "left",
      titleSpacing: 2,
      titleMarginBottom: 6,
      bodyColor: "#fff",
      bodyFont: {},
      bodyAlign: "left",
      bodySpacing: 2,
      footerColor: "#fff",
      footerFont: { weight: "bold" },
      footerAlign: "left",
      footerSpacing: 2,
      footerMarginTop: 6,
      padding: 6,
      caretPadding: 2,
      caretSize: 5,
      cornerRadius: 6,
      multiKeyBackground: "#fff",
      displayColors: true,
      boxWidth: undefined,
      boxHeight: undefined,
      boxPadding: 0,
      usePointStyle: false,
      borderColor: "rgba(0,0,0,0)",
      borderWidth: 0,
      rtl: undefined,
      textDirection: undefined,
      callbacks: {
        beforeTitle: undefined, title: undefined, afterTitle: undefined,
        beforeBody: undefined, beforeLabel: undefined, label: undefined, labelColor: undefined, labelTextColor: undefined, labelPointStyle: undefined, afterLabel: undefined, afterBody: undefined,
        beforeFooter: undefined, footer: undefined, afterFooter: undefined
      },
      animation: { duration: 400, easing: "easeOutQuart" },
      animations: {}
    }
  },

  // Common scale options plus per-axis scale namespaces
  scales: {
    color: "#333",
    backgroundColor: undefined,
    display: true,
    alignToPixels: false,
    bounds: "ticks",
    clip: true,
    grace: undefined,
    offset: false,
    position: undefined,
    reverse: false,
    stack: undefined,
    stackWeight: 1,
    stacked: false,
    suggestedMin: undefined,
    suggestedMax: undefined,
    min: undefined,
    max: undefined,
    beginAtZero: true,
    border: { display: true, color: "rgba(0,0,0,.1)", width: 1, dash: [], dashOffset: 0, z: 0 },
    grid: { display: true, color: "rgba(0,0,0,.08)", lineWidth: 1, drawOnChartArea: true, drawTicks: true, tickBorderDash: [], tickBorderDashOffset: 0, tickColor: undefined, tickLength: 8, tickWidth: undefined, offset: false, z: -1 },
    ticks: { display: true, color: "#555", count: 5, stepSize: undefined, maxTicksLimit: 11, precision: 2, includeBounds: true, sampleSize: undefined, autoSkip: true, autoSkipPadding: 3, labelOffset: 0, maxRotation: 50, minRotation: 0, mirror: false, padding: 3, callback: undefined, format: undefined, font: {}, major: { enabled: false }, showLabelBackdrop: false, backdropColor: "rgba(255,255,255,0.75)", backdropPadding: 2, z: 0 },
    title: { display: false, text: "", color: "#666", font: { size: 12, weight: "normal" }, padding: { top: 4, bottom: 4 } },
    x: { type: "category", axis: "x", display: true, stacked: false, min: undefined, max: undefined, offset: false, grid: {}, ticks: {}, title: { display: false, text: "" } },
    y: { type: "linear", axis: "y", display: true, stacked: false, min: undefined, max: undefined, beginAtZero: true, grace: undefined, grid: {}, ticks: {}, title: { display: false, text: "" } },
    r: {
      type: "radialLinear",
      axis: "r",
      display: true,
      animate: true,
      beginAtZero: true,
      min: undefined,
      max: undefined,
      suggestedMin: undefined,
      suggestedMax: undefined,
      startAngle: 0,
      angleLines: { display: true, color: "rgba(0,0,0,.12)", lineWidth: 1, borderDash: [], borderDashOffset: 0 },
      grid: {},
      ticks: {},
      pointLabels: { display: true, centerPointLabels: false, color: "#333", font: { size: 12 }, padding: 5, backdropColor: undefined, backdropPadding: 2, borderRadius: 0, callback: undefined }
    },
    time: { parser: undefined, round: false, isoWeekday: false, unit: false, minUnit: "millisecond", displayFormats: {}, tooltipFormat: undefined },
    adapters: { date: undefined }
  },

  // Element options
  elements: {
    arc: { backgroundColor: undefined, borderAlign: "center", borderColor: "#fff", borderDash: [], borderDashOffset: 0, borderJoinStyle: undefined, borderRadius: 0, borderWidth: 2, circular: true, hoverBackgroundColor: undefined, hoverBorderColor: undefined, hoverBorderDash: undefined, hoverBorderDashOffset: undefined, hoverBorderJoinStyle: undefined, hoverBorderRadius: undefined, hoverBorderWidth: undefined, offset: 0, spacing: 0, weight: 1 },
    bar: { backgroundColor: undefined, base: undefined, borderColor: undefined, borderSkipped: "start", borderWidth: 2, borderRadius: 0, inflateAmount: "auto", hoverBackgroundColor: undefined, hoverBorderColor: undefined, hoverBorderWidth: undefined, hoverBorderRadius: undefined, barPercentage: .72, categoryPercentage: .8, barThickness: undefined, maxBarThickness: undefined, minBarLength: undefined, pointStyle: undefined },
    line: { backgroundColor: undefined, borderCapStyle: "butt", borderColor: undefined, borderDash: [], borderDashOffset: 0, borderJoinStyle: "miter", borderWidth: 2, capBezierPoints: true, cubicInterpolationMode: "default", fill: false, stepped: false, tension: 0, spanGaps: false },
    point: { backgroundColor: undefined, borderColor: undefined, borderWidth: 1, hitRadius: 1, hoverBackgroundColor: undefined, hoverBorderColor: undefined, hoverBorderWidth: 1, hoverRadius: 5, pointStyle: "circle", radius: 4, rotation: 0, pointRadius: 4 }
  },

  // Dataset-controller option namespaces. These mirror Chart.js option buckets and are merged with dataset-level options.
  datasets: {
    bar: { grouped: true, indexAxis: "x", barPercentage: .9, categoryPercentage: .8, barThickness: undefined, maxBarThickness: undefined, minBarLength: undefined, skipNull: false, borderSkipped: "start", borderWidth: 2, borderRadius: 0, inflateAmount: "auto", backgroundColor: undefined, borderColor: undefined, hoverBackgroundColor: undefined, hoverBorderColor: undefined, hoverBorderWidth: undefined, hoverBorderRadius: undefined, parsing: true, normalized: false, animation: undefined, animations: undefined, transitions: undefined },
    line: { showLine: true, spanGaps: false, stepped: false, tension: 0, fill: false, cubicInterpolationMode: "default", pointBackgroundColor: undefined, pointBorderColor: undefined, pointBorderWidth: 1, pointHitRadius: 1, pointHoverBackgroundColor: undefined, pointHoverBorderColor: undefined, pointHoverBorderWidth: 1, pointHoverRadius: 4, pointRadius: 3, pointRotation: 0, pointStyle: "circle", borderCapStyle: "butt", borderDash: [], borderDashOffset: 0, borderJoinStyle: "miter", borderWidth: 2, backgroundColor: undefined, borderColor: undefined, parsing: true, normalized: false, animation: undefined, animations: undefined, transitions: undefined },
    scatter: { showLine: false, spanGaps: false, tension: 0, pointBackgroundColor: undefined, pointBorderColor: undefined, pointBorderWidth: 1, pointHitRadius: 1, pointHoverBackgroundColor: undefined, pointHoverBorderColor: undefined, pointHoverBorderWidth: 1, pointHoverRadius: 4, pointRadius: 3, pointRotation: 0, pointStyle: "circle", backgroundColor: undefined, borderColor: undefined, parsing: true, normalized: false, animation: undefined, animations: undefined, transitions: undefined },
    bubble: { radius: undefined, hitRadius: 1, hoverRadius: 4, hoverBorderWidth: 1, backgroundColor: undefined, borderColor: undefined, borderWidth: 1, pointStyle: "circle", rotation: 0, parsing: true, normalized: false, animation: undefined, animations: undefined, transitions: undefined },
    doughnut: { cutout: "55%", radius: "100%", rotation: 0, circumference: 360, animation: { animateRotate: true, animateScale: false }, backgroundColor: undefined, borderColor: "#fff", borderWidth: 2, borderAlign: "center", borderRadius: 0, hoverOffset: 0, offset: 0, spacing: 0, weight: 1, parsing: true, normalized: false, animations: undefined, transitions: undefined },
    pie: { radius: "100%", rotation: 0, circumference: 360, animation: { animateRotate: true, animateScale: false }, backgroundColor: undefined, borderColor: "#fff", borderWidth: 2, borderAlign: "center", borderRadius: 0, hoverOffset: 0, offset: 0, spacing: 0, weight: 1, parsing: true, normalized: false, animations: undefined, transitions: undefined },
    polarArea: { startAngle: 0, animation: { animateRotate: true, animateScale: true }, backgroundColor: undefined, borderColor: "#fff", borderWidth: 2, borderAlign: "center", borderRadius: 0, hoverOffset: 0, offset: 0, spacing: 0, circular: true, parsing: true, normalized: false, animations: undefined, transitions: undefined },
    radar: { showLine: true, spanGaps: false, tension: 0, fill: true, pointBackgroundColor: undefined, pointBorderColor: undefined, pointBorderWidth: 1, pointHitRadius: 1, pointHoverBackgroundColor: undefined, pointHoverBorderColor: undefined, pointHoverBorderWidth: 1, pointHoverRadius: 4, pointRadius: 3, pointRotation: 0, pointStyle: "circle", borderCapStyle: "butt", borderDash: [], borderDashOffset: 0, borderJoinStyle: "miter", borderWidth: 2, backgroundColor: undefined, borderColor: undefined, parsing: true, normalized: false, animation: undefined, animations: undefined, transitions: undefined }
  }
};

export const ChartOptionNamespaces = Object.freeze({
  core: ["responsive", "maintainAspectRatio", "aspectRatio", "resizeDelay", "devicePixelRatio", "locale", "color", "threeD", "font", "events", "onHover", "onClick", "onResize"],
  animation: ["animation", "animations", "transitions"],
  interaction: ["interaction", "hover"],
  layout: ["layout"],
  plugins: ["colors", "decimation", "filler", "legend", "title", "subtitle", "tooltip"],
  scales: ["category", "linear", "logarithmic", "time", "timeseries", "radialLinear", "x", "y", "r"],
  elements: ["arc", "bar", "line", "point"],
  datasets: ["bar", "line", "scatter", "bubble", "doughnut", "pie", "polarArea", "radar"]
});

export function configureChartOptions(options = {}) {
  return merge(Charts?.defaults ?? defaultOptions, options);
}

function clear(ctx, options) {
  let { width, height } = getSize(ctx);
  const ratio = options.devicePixelRatio ?? (typeof window !== "undefined" ? window.devicePixelRatio : 1) ?? 1;
  if (options?.responsive !== false && ctx.canvas) {
    const rect = ctx.canvas.getBoundingClientRect?.();
    if (rect?.width && rect?.height) {
      ctx.canvas.width = rect.width * ratio; ctx.canvas.height = rect.height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); width = rect.width; height = rect.height;
    }
  }
  ctx.clearRect(0, 0, width, height);
  if (options?.backgroundColor) { ctx.save(); ctx.fillStyle = options.backgroundColor; ctx.fillRect(0, 0, width, height); ctx.restore(); }
}
function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function rect(ctx, x, y, w, h, fill = true, stroke = false) { if (fill) ctx.fillRect(x, y, w, h); if (stroke) ctx.strokeRect(x, y, w, h); }
function text(ctx, value, x, y, align = Canvas.CENTER, color = "#111", size = 12, weight = "normal") {
  ctx.save(); ctx.fillStyle = color; ctx.font = `${weight} ${size}px Arial, sans-serif`; ctx.textAlign = align; ctx.textBaseline = Canvas.MIDDLE;
  ctx.fillText(String(value), x, y); ctx.restore();
}
function fontString(font = {}, fallback = defaultOptions.font) {
  return `${font.weight ?? fallback?.weight ?? "normal"} ${font.size ?? fallback?.size ?? 12}px ${font.family ?? fallback?.family ?? "Arial, sans-serif"}`;
}
function titleBlockHeight(opts) {
  const p = opts.layout?.padding ?? 60;
  const title = opts.plugins?.title ?? {};
  const subtitle = opts.plugins?.subtitle ?? {};
  let h = 0;
  if (title.display !== false && opts.__titleText) h += (title.font?.size ?? 20) + (title.padding?.bottom ?? 10) + (title.padding?.top ?? 0);
  if (subtitle?.display && subtitle.text) h += (subtitle.font?.size ?? 14) + (subtitle.padding?.bottom ?? 8) + (subtitle.padding?.top ?? 0);
  return h ? Math.max(h, p * 0.45) : 0;
}
function getVisibilityState(ctx) {
  const canvas = ctx?.canvas;
  if (!canvas) return { datasets: new Set(), data: new Set() };
  let state = visibilityRuntime.get(canvas);
  if (!state) { state = { datasets: new Set(), data: new Set() }; visibilityRuntime.set(canvas, state); }
  return state;
}
function isDatasetHidden(ctx, index) { return getVisibilityState(ctx).datasets.has(index); }
function isDataHidden(ctx, index) { return getVisibilityState(ctx).data.has(index); }
function toggleLegendItem(ctx, hit) {
  const state = getVisibilityState(ctx);
  const bucket = hit.kind === "data" ? state.data : state.datasets;
  bucket.has(hit.index) ? bucket.delete(hit.index) : bucket.add(hit.index);
}
function isLegendHitHidden(ctx, hit) {
  return hit.kind === "data" ? isDataHidden(ctx, hit.index) : isDatasetHidden(ctx, hit.index);
}
function visibilitySnapshot(ctx, datasetCount = 0, dataCount = 0) {
  return {
    datasets: Array.from({ length: datasetCount }, (_, i) => isDatasetHidden(ctx, i)),
    data: Array.from({ length: dataCount }, (_, i) => isDataHidden(ctx, i))
  };
}
function hiddenFromSnapshot(snapshot, kind, index, ctx) {
  if (snapshot) {
    const arr = kind === "data" ? snapshot.data : snapshot.datasets;
    if (Array.isArray(arr) && index in arr) return !!arr[index];
  }
  return kind === "data" ? isDataHidden(ctx, index) : isDatasetHidden(ctx, index);
}
function transitionFactor(ctx, opts, kind, index, progress = 1) {
  const t = opts.__visibilityTransition;
  const fromHidden = hiddenFromSnapshot(t?.before, kind, index, ctx);
  const toHidden = hiddenFromSnapshot(t?.after, kind, index, ctx);
  const from = fromHidden ? 0 : 1;
  const to = toHidden ? 0 : 1;
  return math.constrain(from + (to - from) * progress, 0, 1);
}
function transitionAwareProgress(opts, progress) {
  return opts.__visibilityTransition ? 1 : progress;
}
function visibleIndexesFromSnapshot(snapshot, kind, count, ctx) {
  return Array.from({ length: count }, (_, i) => i).filter(i => !hiddenFromSnapshot(snapshot, kind, i, ctx));
}
function unionIndexes(a, b) {
  return [...new Set([...(a ?? []), ...(b ?? [])])].sort((x, y) => x - y);
}
function interpolatedSlot(index, beforeIndexes, afterIndexes, progress) {
  const beforeSlot = beforeIndexes.indexOf(index);
  const afterSlot = afterIndexes.indexOf(index);
  const from = beforeSlot >= 0 ? beforeSlot : (afterSlot >= 0 ? afterSlot : 0);
  const to = afterSlot >= 0 ? afterSlot : from;
  return math.lerp(from, to, progress);
}
function interpolatedCount(beforeIndexes, afterIndexes, progress) {
  const from = Math.max(1, beforeIndexes.length || afterIndexes.length || 1);
  const to = Math.max(1, afterIndexes.length || beforeIndexes.length || 1);
  return math.lerp(from, to, progress);
}
function redrawWithVisibilityTransition(ctx, opts, render) {
  const originalAnimation = opts.animation;
  // Legend show/hide uses the same external animation switch as initial renders.
  // Support both Chart.js-style `animation: false` and this library's
  // friendly `animate: false` alias, plus a zero-duration animation object.
  const animationDisabled =
    opts.animate === false ||
    originalAnimation === false ||
    (originalAnimation != null && Number(originalAnimation.duration) === 0);

  const animation = animationDisabled
    ? false
    : {
        ...(originalAnimation ?? {}),
        onComplete: event => {
          originalAnimation?.onComplete?.(event);
        }
      };

  animate(ctx, { ...opts, animation }, render);
}
function visibleDatasets(ctx, datasets) {
  return datasets
    .map((dataset, index) => ({ ...dataset, __originalIndex: index }))
    .filter(dataset => !isDatasetHidden(ctx, dataset.__originalIndex));
}
function visibleDataIndexes(ctx, values) {
  return values.map((_, index) => index).filter(index => !isDataHidden(ctx, index));
}
function makeDatasetLegendItems(ctx, datasets) {
  return datasets.map((ds, i) => {
    const c = ds.borderColor ?? ds.backgroundColor ?? PALETTE[i % PALETTE.length].border;
    return { kind: "dataset", index: i, text: ds.label ?? `Dataset ${i + 1}`, color: Array.isArray(c) ? c[0] : c, hidden: isDatasetHidden(ctx, i) };
  });
}
function makeDataLegendItems(ctx, labels, dataset, values) {
  return labels.map((label, i) => {
    const c = resolve(dataset?.backgroundColor, { dataset, datasetIndex: 0, dataIndex: i, type: "legend" }, PALETTE[i % PALETTE.length].background);
    return { kind: "data", index: i, text: `${label}: ${values[i]}`, color: Array.isArray(c) ? c[i % c.length] : c, hidden: isDataHidden(ctx, i) };
  });
}
function measureLegend(ctx, items = [], opts, width, height) {
  const legend = opts.plugins?.legend ?? {};
  if (!legend.display || !items.length) return { width: 0, height: 0, rows: [] };
  const labels = legend.labels ?? {};
  const p = opts.layout?.padding ?? 60;
  const fontSize = labels.font?.size ?? 12;
  const boxWidth = labels.boxWidth ?? 12;
  const itemGap = labels.padding ?? 10;
  const lineHeight = Math.max(labels.boxHeight ?? boxWidth, fontSize) + itemGap;
  ctx.save();
  ctx.font = fontString(labels.font, opts.font);
  const itemWidths = items.map(item => boxWidth + 8 + ctx.measureText(String(item.text)).width + itemGap);
  ctx.restore();
  const position = legend.position ?? "top";

  if (position === "left" || position === "right") {
    const maxItem = Math.max(0, ...itemWidths);
    const maxW = legend.maxWidth ?? Math.min(width * 0.35, maxItem + p / 2);
    return { width: Math.min(maxW, maxItem + p / 2), height: Math.min(legend.maxHeight ?? height - p * 2, items.length * lineHeight), lineHeight, itemWidths };
  }
  const maxLineWidth = legend.maxWidth ?? Math.max(80, width - p * 2);
  const rows = [];
  let current = [], currentWidth = 0;
  itemWidths.forEach((itemWidth, i) => {
    if (current.length && currentWidth + itemWidth > maxLineWidth) { rows.push({ items: current, width: currentWidth }); current = []; currentWidth = 0; }
    current.push({ item: items[i], width: itemWidth }); currentWidth += itemWidth;
  });
  if (current.length) rows.push({ items: current, width: currentWidth });
  return { width: Math.min(maxLineWidth, Math.max(0, ...rows.map(r => r.width))), height: Math.min(legend.maxHeight ?? Infinity, rows.length * lineHeight), rows, lineHeight, itemWidths };
}
function drawTitle(ctx, title, opts, width) {
  const t = opts.plugins.title;
  const value = title ?? t.text;
  if (t.display !== false && value) text(ctx, value, width / 2, opts.layout.padding / 2, "center", t.color, t.font?.size ?? 20, t.font?.weight ?? "bold");
  const st = opts.plugins.subtitle;
  if (st?.display && st.text) text(ctx, st.text, width / 2, opts.layout.padding / 2 + 24, "center", st.color, st.font?.size ?? 14);
}
function drawLegend(ctx, items, opts, width, height) {
  const legend = opts.plugins.legend;
  if (!legend?.display || !items?.length) { opts.__legendHitboxes = []; return; }
  const labels = legend.labels ?? {};
  const p = opts.layout.padding;
  const boxWidth = labels.boxWidth ?? 12;
  const boxHeight = labels.boxHeight ?? boxWidth;
  const fontSize = labels.font?.size ?? 12;
  const lineHeight = Math.max(boxHeight, fontSize) + (labels.padding ?? 10);
  const metrics = measureLegend(ctx, items, opts, width, height);
  const position = legend.position ?? "top";
  const align = legend.align ?? "center";
  const titleH = titleBlockHeight(opts);
  const hitboxes = [];
  ctx.save();
  ctx.font = fontString(labels.font, opts.font);
  ctx.textBaseline = Canvas.MIDDLE;
  const strike = (x, y, textWidth) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + textWidth, y); ctx.stroke(); };
  const drawItem = (item, x, y, itemWidth) => {
    ctx.globalAlpha = item.hidden ? 0.45 : 1;
    ctx.fillStyle = item.color; ctx.fillRect(x, y - boxHeight / 2, boxWidth, boxHeight);
    const textX = x + boxWidth + 8;
    ctx.fillStyle = labels.color ?? "#333"; ctx.textAlign = Canvas.LEFT;
    ctx.fillText(String(item.text), textX, y);
    const textWidth = ctx.measureText(String(item.text)).width;
    if (item.hidden) { ctx.strokeStyle = labels.color ?? "#333"; ctx.lineWidth = 1; strike(textX, y, textWidth); }
    ctx.globalAlpha = 1;
    hitboxes.push({ kind: item.kind, index: item.index, x, y: y - lineHeight / 2, w: itemWidth, h: lineHeight });
  };
  if (position === "left" || position === "right") {
    const x = position === "left" ? p : width - p - metrics.width;
    let y = p + titleH + lineHeight / 2;
    items.forEach((item, i) => { drawItem(item, x, y, metrics.itemWidths[i] ?? metrics.width); y += lineHeight; });
  } else {
    const yStart = position === "bottom" ? height - p - metrics.height + lineHeight / 2 : p + titleH + lineHeight / 2;
    metrics.rows.forEach((row, rowIndex) => {
      let x = align === "start" ? p : align === "end" ? width - p - row.width : (width - row.width) / 2;
      const y = yStart + rowIndex * lineHeight;
      row.items.forEach(({ item, width: itemWidth }) => { drawItem(item, x, y, itemWidth); x += itemWidth; });
    });
  }
  ctx.restore();
  opts.__legendHitboxes = hitboxes;
}
function chartArea(ctx, opts) {
  const { width, height } = getSize(ctx), p = opts.layout.padding;
  const legend = opts.plugins?.legend ?? {};
  const position = legend.position ?? "top";
  const metrics = measureLegend(ctx, opts.__legendItems ?? [], opts, width, height);
  const titleH = titleBlockHeight(opts);

  const tickFontSize =
    opts.scales?.x?.ticks?.font?.size ??
    opts.scales?.ticks?.font?.size ??
    opts.font?.size ??
    12;

  const tickPadding =
    opts.scales?.x?.ticks?.padding ??
    opts.scales?.ticks?.padding ??
    3;

  // Space needed for X-axis labels below the axis.
  // drawAxes currently draws labels at area.bottom + 18.
  const xAxisLabelReserve = tickFontSize + tickPadding + 18;

  let left = p, right = width - p, top = p + titleH, bottom = height - p;

  if (legend.display !== false) {
    if (position === "top") {
      top += metrics.height + 8;
    } else if (position === "bottom") {
      bottom -= metrics.height + xAxisLabelReserve;
    } else if (position === "left") {
      left += metrics.width + 10;
    } else if (position === "right") {
      right -= metrics.width + 10;
    }
  }

  if (right - left < 40) {
    left = p;
    right = width - p;
  }

  if (bottom - top < 40) {
    top = p + titleH;
    bottom = height - p;
  }

  return {
    width,
    height,
    area: {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top
    }
  };
}
function drawAxes(ctx, area, opts, labels, maxY, minY = 0, type = "bar") {
  ctx.save(); ctx.strokeStyle = opts.scales.color; ctx.lineWidth = 1; line(ctx, area.left, area.top, area.left, area.bottom); line(ctx, area.left, area.bottom, area.right, area.bottom);
  const ticks = opts.scales.ticks.count ?? 5;
  for (let i = 0; i <= ticks; i++) {
    const y = area.bottom - (i / ticks) * area.height; const val = minY + ((maxY - minY) * i) / ticks;
    if (opts.scales.grid?.display !== false) { ctx.strokeStyle = opts.scales.grid.color; ctx.globalAlpha = i === 0 ? 1 : .65; line(ctx, area.left, y, area.right, y); }
    if (opts.scales.ticks?.display !== false) text(ctx, opts.scales.ticks.callback?.(val, i) ?? Math.round(val * 100) / 100, area.left - 8, y, "right", opts.scales.ticks.color, 11);
  }
  ctx.globalAlpha = 1;
  // bar/polarArea: labels sit at column centres; line/scatter/bubble/radar: labels sit at data-point x positions
  const isPointChart = type === "line" || type === "scatter" || type === "bubble" || type === "radar";
  labels.forEach((label, i) => {
    const x = isPointChart
      ? area.left + (labels.length === 1 ? area.width / 2 : (i / (labels.length - 1)) * area.width)
      : area.left + (i + .5) * (area.width / Math.max(1, labels.length));
    text(ctx, label, x, area.bottom + 18, "center", opts.scales.ticks.color, 11);
  });
  ctx.restore();
}
function animate(ctx, opts, render) {
  const a = opts.animation === false ? { duration: 0 } : merge(defaultOptions.animation, opts.animation ?? {});
  const duration = Number(a.duration ?? 0), delay = Number(a.delay ?? 0), easeName = a.easing ?? "easeOutQuart";
  const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(() => fn(Date.now()), 16);
  const key = ctx?.canvas ?? ctx;
  const token = ((animationRuntime.get(key) ?? 0) + 1);
  if (key) animationRuntime.set(key, token);
  const isCurrent = () => !key || animationRuntime.get(key) === token;
  const startAnimation = () => {
    if (!isCurrent()) return;
    const start = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const step = (now) => {
      if (!isCurrent()) return;
      const raw = duration ? (now - start) / duration : 1;
      const p = duration ? easing(easeName, raw) : 1;
      render(math.constrain(p, 0, 1));
      a.onProgress?.({ chart: ctx, currentStep: raw, numSteps: 1 });
      if (raw < 1) raf(step);
      else {
        a.onComplete?.({ chart: ctx });
        if (a.loop && isCurrent()) raf(() => startAnimation());
      }
    };
    raf(step);
  };
  delay ? setTimeout(startAnimation, delay) : startAnimation();
}
function styleFor(ds, di, i, kind, opts) {
  const ctx = { dataset: ds, datasetIndex: di, dataIndex: i, type: "data", options: opts };
  return {
    backgroundColor: resolve(ds.backgroundColor, ctx, PALETTE[(kind === "arc" ? i : (ds.__originalIndex ?? di)) % PALETTE.length].background),
    borderColor: resolve(ds.borderColor, ctx, kind === "arc" ? (opts.elements.arc.borderColor ?? "#fff") : PALETTE[(ds.__originalIndex ?? di) % PALETTE.length].border),
    borderWidth: resolve(ds.borderWidth, ctx, opts.elements[kind]?.borderWidth ?? opts.elements.borderWidth ?? 2)
  };
}
function prep(title, labels, datasets, options) {
  const ctx = getContext(options?.canvas ?? options?.ctx);
  const opts = merge(Charts?.defaults ?? defaultOptions, options);
  opts.__titleText = title ?? opts.plugins?.title?.text;
  const ds = normalizeDatasets(datasets);
  return { ctx, opts, ds, labels: normalizeLabels(labels, ds), title };
}

const animationRuntime = new WeakMap();
const tooltipRuntime = new WeakMap();
const legendRuntime = new WeakMap();
const visibilityRuntime = new WeakMap();

/**
 * Reads the pointer location relative to a canvas.
 *
 * Prefers coordinates already tracked by the `pointer` class when the event
 * target matches the Canvex-managed canvas, falling back to a manual
 * rect-offset computation for any other canvas element.
 *
 * @param {HTMLCanvasElement} canvas - Canvas receiving the pointer event.
 * @param {MouseEvent|PointerEvent} event - Browser pointer event.
 * @returns {{x:number,y:number}} Pointer coordinates in canvas CSS pixels.
 * @private
 */
function getPointerPosition(canvas, event) {
  // When the chart lives on the same canvas that `pointer` tracks, reuse its
  // already-computed relative coordinates to avoid a second getBoundingClientRect call.
  if (
    typeof Canvex !== "undefined" &&
    Canvex.canvas instanceof HTMLCanvasElement &&
    canvas === Canvex.canvas
  ) {
    return { x: pointer.x, y: pointer.y };
  }

  const rect = canvas.getBoundingClientRect?.();
  if (!rect) return { x: event.offsetX ?? 0, y: event.offsetY ?? 0 };
  const scaleX = canvas.width / (rect.width || canvas.width || 1);
  const scaleY = canvas.height / (rect.height || canvas.height || 1);
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

/**
 * Determines whether the pointer is inside a tooltip hitbox.
 *
 * @param {object} hit - Hitbox generated during chart rendering.
 * @param {number} x - Pointer x coordinate.
 * @param {number} y - Pointer y coordinate.
 * @returns {boolean} True when the pointer intersects the hitbox.
 * @private
 */
function isTooltipHit(hit, x, y) {
  if (!hit) return false;
  if (typeof hit.contains === "function") return hit.contains(x, y);
  if (hit.r != null) return Math.hypot(x - hit.cx, y - hit.cy) <= hit.r;
  return x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h;
}

/**
 * Finds the closest tooltip hitbox for a pointer location.
 *
 * @param {Array<object>} hitboxes - Rendered chart hitboxes.
 * @param {number} x - Pointer x coordinate.
 * @param {number} y - Pointer y coordinate.
 * @returns {object|undefined} Matching hitbox, if one exists.
 * @private
 */
function findTooltipHit(hitboxes, x, y) {
  return [...(hitboxes ?? [])].reverse().find(hit => isTooltipHit(hit, x, y));
}

/**
 * Draws a tooltip using Chart.js-style tooltip plugin options.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context.
 * @param {object} opts - Resolved chart options.
 * @param {object} hit - Active hitbox metadata.
 * @param {number} pointerX - Pointer x coordinate.
 * @param {number} pointerY - Pointer y coordinate.
 * @returns {void}
 * @private
 */
function drawTooltip(ctx, opts, hit, pointerX, pointerY) {
  const tooltip = opts.plugins?.tooltip ?? {};
  if (tooltip.enabled === false || !hit) return;

  const { width, height } = getSize(ctx);
  const title = hit.datasetLabel ? String(hit.datasetLabel) : String(hit.label ?? "");
  const labelText = tooltip.callbacks?.label?.({
    chart: ctx,
    label: hit.label,
    raw: hit.raw,
    parsed: hit.value,
    dataset: hit.dataset,
    datasetIndex: hit.datasetIndex,
    dataIndex: hit.dataIndex
  }) ?? `${hit.label ?? "Value"}: ${hit.value}`;
  const lines = [title, String(labelText)].filter(Boolean);

  ctx.save();
  const titleFont = tooltip.titleFont ?? {};
  const bodyFont = tooltip.bodyFont ?? {};
  const titleSize = titleFont.size ?? opts.font?.size ?? 12;
  const bodySize = bodyFont.size ?? opts.font?.size ?? 12;
  const padding = typeof tooltip.padding === "number" ? tooltip.padding : 8;
  const caret = tooltip.caretSize ?? 6;
  const radius = tooltip.cornerRadius ?? 6;

  ctx.font = `${titleFont.weight ?? "bold"} ${titleSize}px ${titleFont.family ?? opts.font?.family ?? "Arial, sans-serif"}`;
  const titleWidth = title ? ctx.measureText(title).width : 0;
  ctx.font = `${bodyFont.weight ?? "normal"} ${bodySize}px ${bodyFont.family ?? opts.font?.family ?? "Arial, sans-serif"}`;
  const bodyWidth = ctx.measureText(String(labelText)).width;
  const boxW = Math.max(titleWidth, bodyWidth) + padding * 2 + (tooltip.displayColors === false ? 0 : 16);
  const boxH = padding * 2 + (title ? titleSize + 6 : 0) + bodySize;

  let x = pointerX + caret + 10;
  let y = pointerY - boxH - caret;
  if (x + boxW > width) x = pointerX - boxW - caret - 10;
  if (y < 0) y = pointerY + caret + 10;
  x = math.constrain(x, 0, Math.max(0, width - boxW));
  y = math.constrain(y, 0, Math.max(0, height - boxH));

  ctx.fillStyle = tooltip.backgroundColor ?? "rgba(0,0,0,0.8)";
  ctx.strokeStyle = tooltip.borderColor ?? "rgba(0,0,0,0)";
  ctx.lineWidth = tooltip.borderWidth ?? 0;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + boxW - radius, y);
  ctx.quadraticCurveTo(x + boxW, y, x + boxW, y + radius);
  ctx.lineTo(x + boxW, y + boxH - radius);
  ctx.quadraticCurveTo(x + boxW, y + boxH, x + boxW - radius, y + boxH);
  ctx.lineTo(x + radius, y + boxH);
  ctx.quadraticCurveTo(x, y + boxH, x, y + boxH - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
  if ((tooltip.borderWidth ?? 0) > 0) ctx.stroke();

  let textX = x + padding;
  let textY = y + padding;
  if (title) {
    ctx.fillStyle = tooltip.titleColor ?? "#fff";
    ctx.font = `${titleFont.weight ?? "bold"} ${titleSize}px ${titleFont.family ?? opts.font?.family ?? "Arial, sans-serif"}`;
    ctx.textAlign = tooltip.titleAlign ?? Canvas.LEFT;
    ctx.textBaseline = Canvas.TOP;
    ctx.fillText(title, textX, textY);
    textY += titleSize + 6;
  }

  if (tooltip.displayColors !== false) {
    ctx.fillStyle = hit.color ?? PALETTE[hit.datasetIndex % PALETTE.length].background;
    ctx.fillRect(textX, textY + 2, 10, 10);
    textX += 16;
  }

  ctx.fillStyle = tooltip.bodyColor ?? "#fff";
  ctx.font = `${bodyFont.weight ?? "normal"} ${bodySize}px ${bodyFont.family ?? opts.font?.family ?? "Arial, sans-serif"}`;
  ctx.textAlign = tooltip.bodyAlign ?? Canvas.LEFT;
  ctx.textBaseline = Canvas.TOP;
  ctx.fillText(String(labelText), textX, textY);
  ctx.restore();
}

/**
 * Installs or refreshes tooltip mouse handlers for a rendered chart.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context.
 * @param {object} opts - Resolved chart options.
 * @param {Array<object>} hitboxes - Hitboxes generated during drawing.
 * @param {Function} redraw - Callback that redraws the chart at its final frame.
 * @returns {void}
 * @private
 */
function registerLegend(ctx, opts, hitboxes, redraw) {
  const canvas = ctx?.canvas;
  const legend = opts.plugins?.legend ?? {};
  if (!canvas || legend.display === false || opts.__skipLegend) return;

  const handleLegendClick = (event, current) => {
    if (!current) return;

    // The renderer listens to both the canvas click event and the Canvex
    // pointer bridge. In some integrations those paths receive the same native
    // event, so guard against toggling twice and immediately undoing the click.
    if (event?.__canvexLegendHandled) return;
    if (event) event.__canvexLegendHandled = true;

    const { x, y } = getPointerPosition(canvas, event);
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const last = current.lastLegendClick;
    if (last && now - last.time < 32 && Math.abs(last.x - x) < 1 && Math.abs(last.y - y) < 1) return;
    current.lastLegendClick = { time: now, x, y };

    const hit = [...(current.hitboxes ?? [])]
      .reverse()
      .find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    if (!hit) return;

    const result = current.opts.plugins?.legend?.onClick?.(event, hit, current);
    if (result === false) return;

    const datasetCount = current.opts.__datasetCount ?? 0;
    const dataCount = current.opts.__dataCount ?? 0;
    const before = visibilitySnapshot(current.ctx, datasetCount, dataCount);

    toggleLegendItem(current.ctx, hit);

    const after = visibilitySnapshot(current.ctx, datasetCount, dataCount);
    current.redraw?.({ transition: { kind: hit.kind, index: hit.index, before, after } });
  };

  let state = legendRuntime.get(canvas);
  if (!state) {
    state = { ctx, opts, hitboxes, redraw, lastLegendClick: null };

    const click = event => handleLegendClick(event, legendRuntime.get(canvas));
    canvas.addEventListener("click", click);
    state.click = click;

    // Also hook into the pointer class so legend clicks are visible to the
    // broader Canvex event system when this canvas is the active pointer target.
    const prevClicked = pointer.mouseClicked;
    pointer.mouseClicked = (e) => {
      prevClicked(e);
      if (e.target === canvas || (Canvex.canvas instanceof HTMLCanvasElement && e.target === Canvex.canvas && canvas === Canvex.canvas)) {
        handleLegendClick(e, legendRuntime.get(canvas));
      }
    };

    legendRuntime.set(canvas, state);
  }

  state.ctx = ctx;
  state.opts = opts;
  state.hitboxes = hitboxes;
  state.redraw = redraw;
}

function registerTooltip(ctx, opts, hitboxes, redraw) {
  const canvas = ctx?.canvas;
  const tooltip = opts.plugins?.tooltip ?? {};
  if (!canvas || tooltip.enabled === false || opts.__skipTooltip) return;

  let state = tooltipRuntime.get(canvas);
  if (!state) {
    state = { ctx, opts, hitboxes, redraw, active: null };
    const move = event => {
      const current = tooltipRuntime.get(canvas);
      if (!current) return;
      const { x, y } = getPointerPosition(canvas, event);
      const hit = findTooltipHit(current.hitboxes, x, y);
      if (!hit) {
        if (current.active) {
          current.active = null;
          current.redraw?.({ tooltip: true });
        }
        return;
      }
      current.active = hit;
      current.redraw?.({ tooltip: true });
      drawTooltip(current.ctx, current.opts, hit, x, y);
    };
    const leave = () => {
      const current = tooltipRuntime.get(canvas);
      if (!current) return;
      current.active = null;
      current.redraw?.({ tooltip: true });
    };
    
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseleave", leave);
    canvas.addEventListener("mouseout", leave);
    state.move = move;
    state.leave = leave;

    // Chain into pointer.mouseMoved so tooltip hit-testing also runs when the
    // Canvex pointer system dispatches a move on the same canvas.
    const prevMoved = pointer.mouseMoved;
    pointer.mouseMoved = (e) => {
      prevMoved(e);
      if (
        canvas === Canvex.canvas ||
        (e.target instanceof HTMLCanvasElement && e.target === canvas)
      ) {
        move(e);
      }
    };

    tooltipRuntime.set(canvas, state);
  }

  state.ctx = ctx;
  state.opts = opts;
  state.hitboxes = hitboxes;
  state.redraw = redraw;
}

function drawCartesian(type, title, labels, datasets, options = {}, progress = 1) {
  const chartType = baseChartType(type);
  const { ctx, opts, ds: allDs } = prep(title, labels, datasets, options); labels = normalizeLabels(labels, allDs); clear(ctx, opts);
  const use3D = is3DChart(type, opts);
  const hitboxes = [];
  opts.__datasetCount = allDs.length;
  opts.__dataCount = labels.length;
  opts.__legendItems = makeDatasetLegendItems(ctx, allDs);
  const transition = opts.__visibilityTransition;
  const beforeIndexes = transition ? visibleIndexesFromSnapshot(transition.before, "dataset", allDs.length, ctx) : visibleIndexesFromSnapshot(null, "dataset", allDs.length, ctx);
  const afterIndexes = transition ? visibleIndexesFromSnapshot(transition.after, "dataset", allDs.length, ctx) : beforeIndexes;
  const activeIndexes = transition ? unionIndexes(beforeIndexes, afterIndexes) : afterIndexes;
  const ds = activeIndexes.map(index => ({ ...allDs[index], __originalIndex: index })).filter(Boolean);
  // Keep drawing the transition union, but animate scales between the previous
  // and final visible states when user-configured animation is enabled.
  const beforeScaleDs = beforeIndexes.map(index => allDs[index]).filter(Boolean);
  const afterScaleDs = afterIndexes.map(index => allDs[index]).filter(Boolean);
  const drawProgress = transitionAwareProgress(opts, progress);
  const scaleProgress = visibilityScaleProgress(transition, progress);
  const { width, height, area } = chartArea(ctx, opts);
  const beforeValues = beforeScaleDs.length ? beforeScaleDs.flatMap(d => d.data.map(yValue)) : [0];
  const afterValues = afterScaleDs.length ? afterScaleDs.flatMap(d => d.data.map(yValue)) : [0];
  const beginAtZero = opts.scales.y?.beginAtZero ?? opts.scales.beginAtZero ?? true;
  const autoY = interpolatedScaleBounds(beforeValues, afterValues, scaleProgress, beginAtZero);
  const minY = opts.scales.y?.min ?? opts.scales.min ?? autoY.min;
  const maxY = opts.scales.y?.max ?? opts.scales.max ?? autoY.max;
  const rangeY = maxY - minY || 1;
  const beforeXValues = (chartType === "scatter" || chartType === "bubble") ? beforeScaleDs.flatMap(d => d.data.map(xValue)) : [];
  const afterXValues = (chartType === "scatter" || chartType === "bubble") ? afterScaleDs.flatMap(d => d.data.map(xValue)) : [];
  const beforeXMax = beforeXValues.length ? niceMax(Math.max(...beforeXValues, 1)) : 1;
  const afterXMax = afterXValues.length ? niceMax(Math.max(...afterXValues, 1)) : 1;
  const xMax = math.lerp(beforeXMax, afterXMax, scaleProgress);
  drawTitle(ctx, title, opts, width); drawLegend(ctx, opts.__legendItems, opts, width, height); drawAxes(ctx, area, opts, labels, maxY, minY, chartType);
  if (chartType === "bar") {
    const horizontal = opts.indexAxis === "y";
    const group = (horizontal ? area.height : area.width) / Math.max(1, labels.length);
    const count = transition ? interpolatedCount(beforeIndexes, afterIndexes, progress) : Math.max(1, afterIndexes.length || 1);
    const baseBarW = (group * (opts.elements.bar.barPercentage ?? .72)) / count;
    ds.forEach((d, di) => {
      const originalIndex = d.__originalIndex ?? di;
      const vf = transitionFactor(ctx, opts, "dataset", originalIndex, progress);
      if (vf <= 0) return;
      const slot = transition ? interpolatedSlot(originalIndex, beforeIndexes, afterIndexes, progress) : afterIndexes.indexOf(originalIndex);
      const barW = d.barThickness ?? opts.elements.bar.barThickness ?? baseBarW;
      ctx.save(); ctx.globalAlpha *= vf;
      d.data.forEach((v, i) => {
        const val = yValue(v) * drawProgress * vf;
        const s = styleFor(d, originalIndex, i, "bar", opts);
        ctx.fillStyle = s.backgroundColor; ctx.strokeStyle = s.borderColor; ctx.lineWidth = s.borderWidth;
        if (horizontal) {
          const w = math.map(val, minY, maxY, 0, area.width);
          const y = area.top + i * group + group * .14 + slot * barW;
          // Use Shapes helper when drawing on the Canvex-managed canvas; fall
          // back to the direct ctx API for any other canvas.
          if (use3D) {
            drawBar3D(ctx, area.left, y, w, barW - 2, s, opts);
          } else if (ctx.canvas && ctx.canvas === Canvex.canvas) {
            Shapes.rect(area.left, y, w, barW - 2);
          } else {
            rect(ctx, area.left, y, w, barW - 2);
          }
          if (vf > 0.05) hitboxes.push({ type, x: area.left, y, w: Math.max(1, w), h: barW - 2, label: labels[i], value: yValue(v), raw: v, dataset: d, datasetLabel: d.label, datasetIndex: originalIndex, dataIndex: i, color: s.backgroundColor });
        } else {
          const h = math.map(val, minY, maxY, 0, area.height);
          const x = area.left + i * group + group * .14 + slot * barW;
          if (use3D) {
            drawBar3D(ctx, x, area.bottom - h, barW - 2, h, s, opts);
          } else if (ctx.canvas && ctx.canvas === Canvex.canvas) {
            Shapes.rect(x, area.bottom - h, barW - 2, h);
          } else {
            rect(ctx, x, area.bottom - h, barW - 2, h);
          }
          if (vf > 0.05) hitboxes.push({ type, x, y: area.bottom - h, w: barW - 2, h: Math.max(1, h), label: labels[i], value: yValue(v), raw: v, dataset: d, datasetLabel: d.label, datasetIndex: originalIndex, dataIndex: i, color: s.backgroundColor });
        }
      });
      ctx.restore();
    });
  } else {
    ds.forEach((d, di) => {
      const originalIndex = d.__originalIndex ?? di;
      const vf = transitionFactor(ctx, opts, "dataset", originalIndex, progress);
      if (vf <= 0) return;
      const showLine = chartType === "line" || d.showLine;
      ctx.save(); ctx.globalAlpha *= vf;
      ctx.strokeStyle = d.borderColor ?? PALETTE[originalIndex % PALETTE.length].border;
      ctx.lineWidth = d.borderWidth ?? opts.elements.line.borderWidth;
      if (showLine) ctx.beginPath();
      d.data.forEach((v, i) => {
        const x = (chartType === "scatter" || chartType === "bubble") ? area.left + (xValue(v, i) / xMax) * area.width : area.left + (labels.length === 1 ? area.width / 2 : (i / (labels.length - 1)) * area.width);
        const y = area.bottom - math.map(yValue(v) * drawProgress * vf, minY, maxY, 0, area.height);
        if (showLine) i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      if (showLine) ctx.stroke();
      d.data.forEach((v, i) => {
        const x = (chartType === "scatter" || chartType === "bubble") ? area.left + (xValue(v, i) / xMax) * area.width : area.left + (labels.length === 1 ? area.width / 2 : (i / (labels.length - 1)) * area.width);
        const y = area.bottom - math.map(yValue(v) * drawProgress * vf, minY, maxY, 0, area.height);
        const s = styleFor(d, originalIndex, i, "point", opts);
        const radius = chartType === "bubble" ? rValue(v, d.radius ?? opts.elements.point.radius) * drawProgress * vf : (d.pointRadius ?? opts.elements.point.radius) * vf;
        ctx.fillStyle = d.pointBackgroundColor ?? s.backgroundColor;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
        if (vf > 0.05) hitboxes.push({ type, cx: x, cy: y, r: Math.max(8, radius + 4), label: labels[i] ?? xValue(v, i), value: yValue(v), raw: v, dataset: d, datasetLabel: d.label, datasetIndex: originalIndex, dataIndex: i, color: d.pointBackgroundColor ?? s.backgroundColor });
      });
      ctx.restore();
    });
  }
  const redraw = ({ transition, tooltip } = {}) => {
    if (tooltip) {
      drawCartesian(type, title, labels, datasets, { ...opts, animation: false, __visibilityTransition: undefined, __skipLegend: true, __skipTooltip: true }, 1);
      return;
    }
    const renderOpts = transition ? { ...opts, __visibilityTransition: transition } : { ...opts, __visibilityTransition: undefined };
    redrawWithVisibilityTransition(ctx, opts, p => drawCartesian(type, title, labels, datasets, renderOpts, p));
  };
  if (!opts.__skipLegend) registerLegend(ctx, opts, opts.__legendHitboxes, redraw);
  if (!opts.__skipTooltip) registerTooltip(ctx, opts, hitboxes, redraw);
}
function drawCircle(type, title, labels, datasets, options = {}, progress = 1) {
  const chartType = baseChartType(type);
  const { ctx, opts, ds } = prep(title, labels, datasets, options); const d = ds[0] ?? { data: [] }; labels = normalizeLabels(labels, [d]); clear(ctx, opts);
  const use3D = is3DChart(type, opts);
  const hitboxes = [];
  const values = d.data.map(yValue);
  opts.__datasetCount = ds.length;
  opts.__dataCount = values.length;
  const transition = opts.__visibilityTransition;
  const beforeIndexes = transition ? visibleIndexesFromSnapshot(transition.before, "data", values.length, ctx) : visibleIndexesFromSnapshot(null, "data", values.length, ctx);
  const afterIndexes = transition ? visibleIndexesFromSnapshot(transition.after, "data", values.length, ctx) : beforeIndexes;
  const activeIndexes = transition ? unionIndexes(beforeIndexes, afterIndexes) : afterIndexes;
  const beforeTotal = beforeIndexes.reduce((sum, i) => sum + values[i], 0) || 1;
  const afterTotal = afterIndexes.reduce((sum, i) => sum + values[i], 0) || 1;
  const drawProgress = transitionAwareProgress(opts, progress);
  opts.__legendItems = makeDataLegendItems(ctx, labels, d, values);
  const { width, height } = getSize(ctx); const layout = chartArea(ctx, opts); const area = layout.area;
  const r = Math.min(area.width, area.height) / 2.6; const baseStart = (-Math.PI / 2) + ((opts.rotation ?? opts.datasets?.[type]?.rotation ?? 0) * Math.PI / 180); const cx = (area.left + area.right) / 2, cy = (area.top + area.bottom) / 2;
  drawTitle(ctx, title, opts, width); drawLegend(ctx, opts.__legendItems, opts, width, height);
  const angleMap = (indexes, total) => {
    const map = new Map(); let start = baseStart;
    indexes.forEach(i => {
      const frac = chartType === "polarArea" ? (1 / Math.max(1, indexes.length)) : (values[i] / total);
      const end = start + frac * Math.PI * 2;
      map.set(i, { start, end }); start = end;
    });
    return map;
  };
  const beforeAngles = angleMap(beforeIndexes, beforeTotal);
  const afterAngles = angleMap(afterIndexes, afterTotal);
  const polarBeforeIndexes = beforeIndexes.length ? beforeIndexes : activeIndexes;
  const polarAfterIndexes = afterIndexes.length ? afterIndexes : activeIndexes;
  const polarBeforeMax = niceMax(Math.max(...polarBeforeIndexes.map(idx => values[idx]), 1));
  const polarAfterMax = niceMax(Math.max(...polarAfterIndexes.map(idx => values[idx]), 1));
  const polarMax = math.lerp(polarBeforeMax, polarAfterMax, visibilityScaleProgress(transition, progress));
  activeIndexes.forEach(i => {
    const vf = transitionFactor(ctx, opts, "data", i, progress);
    const beforeAngle = beforeAngles.get(i) ?? afterAngles.get(i) ?? { start: baseStart, end: baseStart };
    const afterAngle = afterAngles.get(i) ?? beforeAngles.get(i) ?? beforeAngle;
    const start = math.lerp(beforeAngle.start, afterAngle.start, progress);
    const endFull = math.lerp(beforeAngle.end, afterAngle.end, progress);
    const end = start + (endFull - start) * drawProgress * vf;
    const v = values[i];
    const rr = chartType === "polarArea" ? r * Math.sqrt(v / polarMax) * drawProgress * vf : r * vf;
    const s = styleFor(d, 0, i, "arc", opts);
    if (vf > 0) {
      const cut = chartType === "doughnut" ? (opts.cutout ?? opts.datasets.doughnut.cutout ?? "55%") : 0;
      const cr = typeof cut === "string" && cut.endsWith("%") ? r * Number(cut.slice(0, -1)) / 100 : Number(cut || 0);
      ctx.save(); ctx.globalAlpha *= vf;
      if (use3D) drawArc3D(ctx, cx, cy, rr, cr, start, end, s, opts);
      else { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rr, start, end); ctx.closePath(); ctx.fillStyle = s.backgroundColor; ctx.fill(); ctx.strokeStyle = s.borderColor; ctx.lineWidth = s.borderWidth; ctx.stroke(); }
      ctx.restore();
    }
    if (vf > 0.05) hitboxes.push({ type, label: labels[i], value: v, raw: d.data[i], dataset: d, datasetLabel: d.label, datasetIndex: 0, dataIndex: i, color: s.backgroundColor, contains: (x, y) => { const dx = x - cx, dy = y - cy; const dist = Math.hypot(dx, dy); let a = Math.atan2(dy, dx); if (a < -Math.PI / 2) a += Math.PI * 2; let sA = start, eA = end; while (sA < -Math.PI / 2) { sA += Math.PI * 2; eA += Math.PI * 2; } const cut = chartType === "doughnut" ? (opts.cutout ?? opts.datasets.doughnut.cutout ?? "55%") : 0; const cr = typeof cut === "string" && cut.endsWith("%") ? r * Number(cut.slice(0, -1)) / 100 : Number(cut || 0); return dist >= cr && dist <= rr && a >= sA && a <= eA; } });
  });
  if (chartType === "doughnut" && !use3D) { const cut = opts.cutout ?? opts.datasets.doughnut.cutout ?? "55%"; const cr = typeof cut === "string" && cut.endsWith("%") ? r * Number(cut.slice(0, -1)) / 100 : Number(cut); ctx.globalCompositeOperation = "destination-out"; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = "source-over"; }
  const redraw = ({ transition, tooltip } = {}) => {
    if (tooltip) {
      drawCircle(type, title, labels, datasets, { ...opts, animation: false, __visibilityTransition: undefined, __skipLegend: true, __skipTooltip: true }, 1);
      return;
    }
    const renderOpts = transition ? { ...opts, __visibilityTransition: transition } : { ...opts, __visibilityTransition: undefined };
    redrawWithVisibilityTransition(ctx, opts, p => drawCircle(type, title, labels, datasets, renderOpts, p));
  };
  if (!opts.__skipLegend) registerLegend(ctx, opts, opts.__legendHitboxes, redraw);
  if (!opts.__skipTooltip) registerTooltip(ctx, opts, hitboxes, redraw);
}
function drawRadar(title, labels, datasets, options = {}, progress = 1) {
  const { ctx, opts, ds: allDs } = prep(title, labels, datasets, options); labels = normalizeLabels(labels, allDs); clear(ctx, opts);
  const hitboxes = [];
  opts.__datasetCount = allDs.length;
  opts.__dataCount = labels.length;
  opts.__legendItems = makeDatasetLegendItems(ctx, allDs);
  const transition = opts.__visibilityTransition;
  const beforeIndexes = transition ? visibleIndexesFromSnapshot(transition.before, "dataset", allDs.length, ctx) : visibleIndexesFromSnapshot(null, "dataset", allDs.length, ctx);
  const afterIndexes = transition ? visibleIndexesFromSnapshot(transition.after, "dataset", allDs.length, ctx) : beforeIndexes;
  const activeIndexes = transition ? unionIndexes(beforeIndexes, afterIndexes) : afterIndexes;
  const ds = activeIndexes.map(index => ({ ...allDs[index], __originalIndex: index })).filter(Boolean);
  // Keep drawing the transition union, but animate the radial scale between the
  // previous and final visible states when user-configured animation is enabled.
  const beforeScaleDs = beforeIndexes.map(index => allDs[index]).filter(Boolean);
  const afterScaleDs = afterIndexes.map(index => allDs[index]).filter(Boolean);
  const drawProgress = transitionAwareProgress(opts, progress);
  const radarBeforeMax = niceMax(Math.max(...(beforeScaleDs.length ? beforeScaleDs.flatMap(d => d.data.map(yValue)) : [0]), 0));
  const radarAfterMax = niceMax(Math.max(...(afterScaleDs.length ? afterScaleDs.flatMap(d => d.data.map(yValue)) : [0]), 0));
  const { width, height, area } = chartArea(ctx, opts); const cx = (area.left + area.right) / 2, cy = (area.top + area.bottom) / 2, r = Math.min(area.width, area.height) / 2.7; const maxY = opts.scales.r.max ?? math.lerp(radarBeforeMax, radarAfterMax, visibilityScaleProgress(transition, progress));
  drawTitle(ctx, title, opts, width); drawLegend(ctx, opts.__legendItems, opts, width, height); ctx.strokeStyle = opts.scales.grid.color;
  for (let ring = 1; ring <= (opts.scales.ticks.count ?? 5); ring++) { ctx.beginPath(); labels.forEach((_, i) => { const a = -Math.PI / 2 + i * Math.PI * 2 / labels.length; const rr = r * ring / (opts.scales.ticks.count ?? 5); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke(); }
  labels.forEach((l, i) => { const a = -Math.PI / 2 + i * Math.PI * 2 / labels.length; line(ctx, cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r); text(ctx, l, cx + Math.cos(a) * (r + 18), cy + Math.sin(a) * (r + 18), "center", opts.scales.r.pointLabels.color, opts.scales.r.pointLabels.font.size); });
  ds.forEach((d, di) => { const originalIndex = d.__originalIndex ?? di; const vf = transitionFactor(ctx, opts, "dataset", originalIndex, progress); if (vf <= 0) return; ctx.save(); ctx.globalAlpha *= vf; ctx.beginPath(); const points = []; d.data.forEach((v, i) => { const a = -Math.PI / 2 + i * Math.PI * 2 / labels.length; const rr = (yValue(v) / (maxY || 1)) * r * drawProgress * vf; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; points.push({ x, y, v, i }); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fillStyle = d.backgroundColor ?? PALETTE[originalIndex % PALETTE.length].background; ctx.strokeStyle = d.borderColor ?? PALETTE[originalIndex % PALETTE.length].border; ctx.save(); ctx.globalAlpha *= .45; ctx.fill(); ctx.restore(); ctx.stroke(); points.forEach(pt => { if (vf > 0.05) hitboxes.push({ type: "radar", cx: pt.x, cy: pt.y, r: 10, label: labels[pt.i], value: yValue(pt.v), raw: pt.v, dataset: d, datasetLabel: d.label, datasetIndex: originalIndex, dataIndex: pt.i, color: d.backgroundColor ?? PALETTE[originalIndex % PALETTE.length].background }); }); ctx.restore(); });
  const redraw = ({ transition, tooltip } = {}) => {
    if (tooltip) {
      drawRadar(title, labels, datasets, { ...opts, animation: false, __visibilityTransition: undefined, __skipLegend: true, __skipTooltip: true }, 1);
      return;
    }
    const renderOpts = transition ? { ...opts, __visibilityTransition: transition } : { ...opts, __visibilityTransition: undefined };
    redrawWithVisibilityTransition(ctx, opts, p => drawRadar(title, labels, datasets, renderOpts, p));
  };
  if (!opts.__skipLegend) registerLegend(ctx, opts, opts.__legendHitboxes, redraw);
  if (!opts.__skipTooltip) registerTooltip(ctx, opts, hitboxes, redraw);
}
function drawStackedBar(title, labels, datasets, options = {}, progress = 1) {
  const { ctx, opts, ds: allDs } = prep(title, labels, datasets, options);
  labels = normalizeLabels(labels, allDs);
  clear(ctx, opts);
  const hitboxes = [];
  opts.__datasetCount = allDs.length;
  opts.__dataCount = labels.length;
  opts.__legendItems = makeDatasetLegendItems(ctx, allDs);
  const transition = opts.__visibilityTransition;
  const beforeIndexes = transition ? visibleIndexesFromSnapshot(transition.before, "dataset", allDs.length, ctx) : visibleIndexesFromSnapshot(null, "dataset", allDs.length, ctx);
  const afterIndexes = transition ? visibleIndexesFromSnapshot(transition.after, "dataset", allDs.length, ctx) : beforeIndexes;
  const activeIndexes = transition ? unionIndexes(beforeIndexes, afterIndexes) : afterIndexes;
  const ds = activeIndexes.map(index => ({ ...allDs[index], __originalIndex: index })).filter(Boolean);
  const drawProgress = transitionAwareProgress(opts, progress);
  const scaleProgress = visibilityScaleProgress(transition, progress);
  const horizontal = opts.indexAxis === "y";
  // Interpolate stacked axis max between before/after visible datasets so the
  // axis rescales smoothly when the user shows or hides a dataset.
  const beforeScaleDs = beforeIndexes.map(index => allDs[index]).filter(Boolean);
  const afterScaleDs  = afterIndexes.map(index => allDs[index]).filter(Boolean);
  const stackedBefore = labels.map((_, li) =>
    (beforeScaleDs.length ? beforeScaleDs : allDs).reduce((sum, d) => sum + Math.max(0, yValue(d.data[li])), 0)
  );
  const stackedAfter = labels.map((_, li) =>
    (afterScaleDs.length ? afterScaleDs : allDs).reduce((sum, d) => sum + Math.max(0, yValue(d.data[li])), 0)
  );
  const autoMaxBefore = niceMax(Math.max(...stackedBefore, 1));
  const autoMaxAfter  = niceMax(Math.max(...stackedAfter, 1));
  const maxY = opts.scales?.y?.max ?? opts.scales?.max ?? math.lerp(autoMaxBefore, autoMaxAfter, scaleProgress);
  const { width, height, area } = chartArea(ctx, opts);
  drawTitle(ctx, title, opts, width);
  drawLegend(ctx, opts.__legendItems, opts, width, height);
  drawAxes(ctx, area, opts, labels, maxY, 0, "bar");
  const group = (horizontal ? area.height : area.width) / Math.max(1, labels.length);
  const barW = (group * (opts.elements.bar.barPercentage ?? 0.72));
  // Track per-label stacking offsets
  const offsets = labels.map(() => 0);
  ds.forEach((d) => {
    const originalIndex = d.__originalIndex ?? 0;
    const vf = transitionFactor(ctx, opts, "dataset", originalIndex, progress);
    if (vf <= 0) return;
    ctx.save();
    ctx.globalAlpha *= vf;
    d.data.forEach((v, i) => {
      const rawVal = Math.max(0, yValue(v));
      const val = rawVal * drawProgress * vf;
      const s = styleFor(d, originalIndex, i, "bar", opts);
      ctx.fillStyle = s.backgroundColor;
      ctx.strokeStyle = s.borderColor;
      ctx.lineWidth = s.borderWidth;
      if (horizontal) {
        const x = area.left + math.map(offsets[i], 0, maxY, 0, area.width);
        const w = math.map(val, 0, maxY, 0, area.width);
        const y = area.top + i * group + group * 0.14;
        rect(ctx, x, y, Math.max(0, w), barW - 2);
        if (vf > 0.05) hitboxes.push({ type: "stackedBar", x, y, w: Math.max(1, w), h: barW - 2, label: labels[i], value: yValue(v), raw: v, dataset: d, datasetLabel: d.label, datasetIndex: originalIndex, dataIndex: i, color: s.backgroundColor });
      } else {
        const h = math.map(val, 0, maxY, 0, area.height);
        const offsetH = math.map(offsets[i], 0, maxY, 0, area.height);
        const x = area.left + i * group + group * 0.14;
        const y = area.bottom - offsetH - h;
        rect(ctx, x, y, barW - 2, Math.max(0, h));
        if (vf > 0.05) hitboxes.push({ type: "stackedBar", x, y, w: barW - 2, h: Math.max(1, h), label: labels[i], value: yValue(v), raw: v, dataset: d, datasetLabel: d.label, datasetIndex: originalIndex, dataIndex: i, color: s.backgroundColor });
      }
      // Accumulate using the animated value so segments reposition smoothly
      // throughout the animation instead of jumping to final positions.
      offsets[i] += val;
    });
    ctx.restore();
  });
  const redraw = ({ transition: t, tooltip } = {}) => {
    if (tooltip) { drawStackedBar(title, labels, datasets, { ...opts, animation: false, __visibilityTransition: undefined, __skipLegend: true, __skipTooltip: true }, 1); return; }
    const renderOpts = t ? { ...opts, __visibilityTransition: t } : { ...opts, __visibilityTransition: undefined };
    redrawWithVisibilityTransition(ctx, opts, p => drawStackedBar(title, labels, datasets, renderOpts, p));
  };
  if (!opts.__skipLegend) registerLegend(ctx, opts, opts.__legendHitboxes, redraw);
  if (!opts.__skipTooltip) registerTooltip(ctx, opts, hitboxes, redraw);
}

function drawArea(title, labels, datasets, options = {}, progress = 1) {
  const { ctx, opts, ds: allDs } = prep(title, labels, datasets, options);
  labels = normalizeLabels(labels, allDs);
  clear(ctx, opts);
  const hitboxes = [];
  opts.__datasetCount = allDs.length;
  opts.__dataCount = labels.length;
  opts.__legendItems = makeDatasetLegendItems(ctx, allDs);
  const transition = opts.__visibilityTransition;
  const beforeIndexes = transition ? visibleIndexesFromSnapshot(transition.before, "dataset", allDs.length, ctx) : visibleIndexesFromSnapshot(null, "dataset", allDs.length, ctx);
  const afterIndexes = transition ? visibleIndexesFromSnapshot(transition.after, "dataset", allDs.length, ctx) : beforeIndexes;
  const activeIndexes = transition ? unionIndexes(beforeIndexes, afterIndexes) : afterIndexes;
  const ds = activeIndexes.map(index => ({ ...allDs[index], __originalIndex: index })).filter(Boolean);
  const drawProgress = transitionAwareProgress(opts, progress);
  const beforeScaleDs = beforeIndexes.map(i => allDs[i]).filter(Boolean);
  const afterScaleDs = afterIndexes.map(i => allDs[i]).filter(Boolean);
  const scaleProgress = visibilityScaleProgress(transition, progress);
  const beginAtZero = opts.scales?.y?.beginAtZero ?? opts.scales?.beginAtZero ?? true;
  const autoY = interpolatedScaleBounds(
    beforeScaleDs.flatMap(d => d.data.map(yValue)),
    afterScaleDs.flatMap(d => d.data.map(yValue)),
    scaleProgress, beginAtZero
  );
  const minY = opts.scales?.y?.min ?? opts.scales?.min ?? autoY.min;
  const maxY = opts.scales?.y?.max ?? opts.scales?.max ?? autoY.max;
  const { width, height, area } = chartArea(ctx, opts);
  drawTitle(ctx, title, opts, width);
  drawLegend(ctx, opts.__legendItems, opts, width, height);
  drawAxes(ctx, area, opts, labels, maxY, minY, "line");
  ds.forEach((d) => {
    const originalIndex = d.__originalIndex ?? 0;
    const vf = transitionFactor(ctx, opts, "dataset", originalIndex, progress);
    if (vf <= 0) return;
    ctx.save();
    ctx.globalAlpha *= vf;
    const fillColor = d.backgroundColor ?? colorWithAlpha(PALETTE[originalIndex % PALETTE.length].border, 0.25);
    const strokeColor = d.borderColor ?? PALETTE[originalIndex % PALETTE.length].border;
    const pts = d.data.map((v, i) => ({
      x: area.left + (labels.length === 1 ? area.width / 2 : (i / (labels.length - 1)) * area.width),
      y: area.bottom - math.map(yValue(v) * drawProgress * vf, minY, maxY, 0, area.height)
    }));
    // Fill area under line
    ctx.beginPath();
    ctx.moveTo(pts[0].x, area.bottom);
    pts.forEach(pt => ctx.lineTo(pt.x, pt.y));
    ctx.lineTo(pts[pts.length - 1].x, area.bottom);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    // Draw line on top
    ctx.beginPath();
    pts.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = d.borderWidth ?? opts.elements.line.borderWidth ?? 2;
    ctx.stroke();
    // Draw points + hitboxes
    pts.forEach((pt, i) => {
      const radius = d.pointRadius ?? opts.elements.point.radius ?? 3;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = strokeColor;
      ctx.fill();
      if (vf > 0.05) hitboxes.push({ type: "area", cx: pt.x, cy: pt.y, r: Math.max(8, radius + 4), label: labels[i], value: yValue(d.data[i]), raw: d.data[i], dataset: d, datasetLabel: d.label, datasetIndex: originalIndex, dataIndex: i, color: strokeColor });
    });
    ctx.restore();
  });
  const redraw = ({ transition: t, tooltip } = {}) => {
    if (tooltip) { drawArea(title, labels, datasets, { ...opts, animation: false, __visibilityTransition: undefined, __skipLegend: true, __skipTooltip: true }, 1); return; }
    const renderOpts = t ? { ...opts, __visibilityTransition: t } : { ...opts, __visibilityTransition: undefined };
    redrawWithVisibilityTransition(ctx, opts, p => drawArea(title, labels, datasets, renderOpts, p));
  };
  if (!opts.__skipLegend) registerLegend(ctx, opts, opts.__legendHitboxes, redraw);
  if (!opts.__skipTooltip) registerTooltip(ctx, opts, hitboxes, redraw);
}

function drawHistogram(title, labels, datasets, options = {}, progress = 1) {
  const { ctx, opts, ds: allDs } = prep(title, labels, datasets, options);
  clear(ctx, opts);
  const hitboxes = [];
  // Collect all raw values from the first dataset (flat numeric array expected)
  const rawData = (allDs[0]?.data ?? []).map(v => (typeof v === "number" ? v : yValue(v)));
  const binCount = opts.datasets?.histogram?.bins ?? options.bins ?? Math.max(5, Math.ceil(Math.sqrt(rawData.length)));
  const dataMin = Math.min(...rawData);
  const dataMax = Math.max(...rawData);
  const binWidth = (dataMax - dataMin) / binCount || 1;
  // Build bins
  const bins = Array.from({ length: binCount }, (_, i) => ({
    min: dataMin + i * binWidth,
    max: dataMin + (i + 1) * binWidth,
    count: 0
  }));
  rawData.forEach(v => {
    const idx = Math.min(binCount - 1, Math.floor((v - dataMin) / binWidth));
    if (idx >= 0) bins[idx].count++;
  });
  const binLabels = bins.map(b => `${Math.round(b.min * 10) / 10}–${Math.round(b.max * 10) / 10}`);
  const maxCount = niceMax(Math.max(...bins.map(b => b.count), 1));
  opts.__datasetCount = 1;
  opts.__dataCount = bins.length;
  opts.__legendItems = [];
  const { width, height, area } = chartArea(ctx, opts);
  drawTitle(ctx, title, opts, width);
  drawLegend(ctx, opts.__legendItems, opts, width, height);
  drawAxes(ctx, area, opts, binLabels, maxCount, 0, "bar");
  const barW = area.width / Math.max(1, bins.length);
  const drawProgress = transitionAwareProgress(opts, progress);
  bins.forEach((bin, i) => {
    const h = math.map(bin.count * drawProgress, 0, maxCount, 0, area.height);
    const x = area.left + i * barW;
    const y = area.bottom - h;
    const palette = PALETTE[0];
    ctx.fillStyle = (allDs[0]?.backgroundColor ?? palette.background);
    ctx.strokeStyle = (allDs[0]?.borderColor ?? palette.border);
    ctx.lineWidth = 1;
    rect(ctx, x + 1, y, barW - 2, Math.max(0, h));
    if (h > 0) hitboxes.push({ type: "histogram", x: x + 1, y, w: barW - 2, h: Math.max(1, h), label: binLabels[i], value: bin.count, raw: bin.count, dataset: allDs[0], datasetLabel: allDs[0]?.label ?? "Count", datasetIndex: 0, dataIndex: i, color: allDs[0]?.backgroundColor ?? palette.background });
  });
  const redraw = ({ tooltip } = {}) => {
    if (tooltip) { drawHistogram(title, labels, datasets, { ...opts, animation: false, __skipLegend: true, __skipTooltip: true }, 1); return; }
    animate(ctx, opts, p => drawHistogram(title, labels, datasets, opts, p));
  };
  if (!opts.__skipTooltip) registerTooltip(ctx, opts, hitboxes, redraw);
}

function drawGantt(title, labels, datasets, options = {}, progress = 1) {
  // Gantt expects data points as { start, end, label? } or [start, end]
  // `labels` = task names (y-axis); datasets[i].data[j] = { start, end } (numeric or Date ms)
  const { ctx, opts, ds: allDs } = prep(title, labels, datasets, options);
  labels = normalizeLabels(labels, allDs);
  clear(ctx, opts);
  const hitboxes = [];
  opts.__datasetCount = allDs.length;
  opts.__dataCount = labels.length;
  opts.__legendItems = makeDatasetLegendItems(ctx, allDs);
  const transition = opts.__visibilityTransition;
  const beforeIndexes = transition ? visibleIndexesFromSnapshot(transition.before, "dataset", allDs.length, ctx) : visibleIndexesFromSnapshot(null, "dataset", allDs.length, ctx);
  const afterIndexes  = transition ? visibleIndexesFromSnapshot(transition.after,  "dataset", allDs.length, ctx) : beforeIndexes;
  const activeIndexes = transition ? unionIndexes(beforeIndexes, afterIndexes) : afterIndexes;
  const scaleProgress = visibilityScaleProgress(transition, progress);
  const drawProgress  = transitionAwareProgress(opts, progress);
  // Helper to flatten start/end from a dataset entry
  const pointsOf = ds => ds.flatMap(d => d.data.map(v => {
    if (Array.isArray(v)) return { start: Number(v[0]), end: Number(v[1]) };
    if (v && typeof v === "object") return { start: Number(v.start ?? v.x ?? 0), end: Number(v.end ?? v.x2 ?? 1) };
    return { start: 0, end: Number(v) };
  }));
  // Interpolate x scale between before/after visible datasets so the axis
  // rescales smoothly when the user shows or hides a dataset.
  const beforeDs = beforeIndexes.map(i => allDs[i]).filter(Boolean);
  const afterDs  = afterIndexes.map(i => allDs[i]).filter(Boolean);
  const beforePoints = pointsOf(beforeDs.length ? beforeDs : allDs);
  const afterPoints  = pointsOf(afterDs.length  ? afterDs  : allDs);
  const beforeXMin = Math.min(...beforePoints.map(p => p.start), 0);
  const afterXMin  = Math.min(...afterPoints.map(p => p.start),  0);
  const beforeXMax = niceMax(Math.max(...beforePoints.map(p => p.end), 1));
  const afterXMax  = niceMax(Math.max(...afterPoints.map(p => p.end),  1));
  const xMin = opts.scales?.x?.min ?? math.lerp(beforeXMin, afterXMin, scaleProgress);
  const xMax = opts.scales?.x?.max ?? math.lerp(beforeXMax, afterXMax, scaleProgress);
  const { width, height, area } = chartArea(ctx, opts);
  drawTitle(ctx, title, opts, width);
  drawLegend(ctx, opts.__legendItems, opts, width, height);
  // Draw horizontal grid lines + y-axis labels (task names) + x-axis tick marks
  ctx.save();
  ctx.strokeStyle = opts.scales.color;
  ctx.lineWidth = 1;
  line(ctx, area.left, area.top, area.left, area.bottom);
  line(ctx, area.left, area.bottom, area.right, area.bottom);
  const xTicks = opts.scales?.ticks?.count ?? 5;
  for (let i = 0; i <= xTicks; i++) {
    const xv = xMin + (xMax - xMin) * (i / xTicks);
    const xp = area.left + (i / xTicks) * area.width;
    if (opts.scales.grid?.display !== false) {
      ctx.strokeStyle = opts.scales.grid.color; ctx.globalAlpha = i === 0 ? 1 : 0.5;
      line(ctx, xp, area.top, xp, area.bottom);
    }
    ctx.globalAlpha = 1;
    text(ctx, Math.round(xv * 10) / 10, xp, area.bottom + 18, "center", opts.scales.ticks.color, 11);
  }
  ctx.globalAlpha = 1;
  const rowH = area.height / Math.max(1, labels.length);
  const barH = rowH * 0.55;
  labels.forEach((label, i) => {
    const y = area.top + i * rowH + rowH / 2;
    text(ctx, label, area.left - 8, y, "right", opts.scales.ticks.color, 11);
    if (opts.scales.grid?.display !== false) {
      ctx.strokeStyle = opts.scales.grid.color; ctx.globalAlpha = 0.35;
      line(ctx, area.left, y, area.right, y);
      ctx.globalAlpha = 1;
    }
  });
  ctx.restore();
  // Draw bars — only for active (visible or transitioning) datasets
  activeIndexes.forEach(originalIndex => {
    const d = allDs[originalIndex];
    if (!d) return;
    const vf = transitionFactor(ctx, opts, "dataset", originalIndex, progress);
    if (vf <= 0) return;
    ctx.save();
    ctx.globalAlpha *= vf;
    d.data.forEach((v, i) => {
      let start, end;
      if (Array.isArray(v)) { start = Number(v[0]); end = Number(v[1]); }
      else if (v && typeof v === "object") { start = Number(v.start ?? v.x ?? 0); end = Number(v.end ?? v.x2 ?? start + 1); }
      else { start = 0; end = Number(v); }
      const xStart = area.left + math.map(start, xMin, xMax, 0, area.width);
      const rawEnd = area.left + math.map(end, xMin, xMax, 0, area.width);
      const w = Math.max(2, (rawEnd - xStart) * drawProgress * vf);
      const y = area.top + i * (area.height / Math.max(1, labels.length)) + (area.height / Math.max(1, labels.length)) * 0.225;
      const s = styleFor(d, originalIndex, i, "bar", opts);
      ctx.fillStyle = s.backgroundColor;
      ctx.strokeStyle = s.borderColor;
      ctx.lineWidth = s.borderWidth;
      rect(ctx, xStart, y, w, barH);
      if (vf > 0.05) hitboxes.push({ type: "gantt", x: xStart, y, w, h: barH, label: labels[i] ?? `Task ${i + 1}`, value: end - start, raw: v, dataset: d, datasetLabel: d.label, datasetIndex: originalIndex, dataIndex: i, color: s.backgroundColor });
    });
    ctx.restore();
  });
  const redraw = ({ transition: t, tooltip } = {}) => {
    if (tooltip) { drawGantt(title, labels, datasets, { ...opts, animation: false, __visibilityTransition: undefined, __skipLegend: true, __skipTooltip: true }, 1); return; }
    const renderOpts = t ? { ...opts, __visibilityTransition: t } : { ...opts, __visibilityTransition: undefined };
    redrawWithVisibilityTransition(ctx, opts, p => drawGantt(title, labels, datasets, renderOpts, p));
  };
  if (!opts.__skipLegend) registerLegend(ctx, opts, opts.__legendHitboxes, redraw);
  if (!opts.__skipTooltip) registerTooltip(ctx, opts, hitboxes, redraw);
}

/**
 * Builds a per-chart options object/**
 * Builds a per-chart options object without mutating {@link Charts.defaults}.
 *
 * This helper lets any chart method accept either a normal Chart.js-style
 * options object or a wrapper object with an `options` or `configure` key:
 *
 * - `{ animation: false }` applies only to the current chart.
 * - `{ options: { animation: false } }` is accepted for compatibility.
 * - `{ configure: { animation: false } }` behaves like `Charts.configure(...)`
 *   for this one render only and does not affect other charts.
 * - `{ animate: false }` is supported as a friendly alias for
 *   `{ animation: false }`.
 *
 * @param {string} type - Chart type being rendered, such as `bar`, `line`, or `radar`.
 * @param {object} [options={}] - Per-chart options supplied to the chart method.
 * @returns {object} A new merged options object for the current chart only.
 * @private
 */
function configureLocalOptions(type, options = {}) {
  type = baseChartType(type);
  const input = isObject(options) ? options : {};
  const wrapperOptions = isObject(input.options) ? input.options : {};
  const localConfigure = isObject(input.configure) ? input.configure : {};
  const typeDefaults = (Charts?.defaults?.datasets?.[type] && isObject(Charts.defaults.datasets[type]))
    ? { datasets: { [type]: Charts.defaults.datasets[type] } }
    : {};

  const passthrough = { ...input };
  delete passthrough.options;
  delete passthrough.configure;

  let resolved = merge(Charts?.defaults ?? defaultOptions, typeDefaults);
  resolved = merge(resolved, localConfigure);
  resolved = merge(resolved, passthrough);
  resolved = merge(resolved, wrapperOptions);

  if (resolved.animate === false) resolved.animation = false;
  if (resolved.animate === true && resolved.animation === false) resolved.animation = defaultOptions.animation;

  return resolved;
}

/**
 * Sets up the shared 3D environment (Lights, Camera, Interaction) for a 3D chart render.
 *
 * - Applies default ambient + directional lights via {@link Lights} when no lights have been
 *   configured yet, so the extruded faces receive realistic shading out of the box.
 * - Positions a default perspective {@link Camera} when no camera has been placed yet,
 *   oriented to give a comfortable isometric-ish viewing angle for chart data.
 * - Enables {@link Interaction.orbitControl} on the Canvex canvas so the user can
 *   drag to rotate and scroll/pinch to zoom the 3D chart view.
 *
 * Callers can bypass any part of this setup by configuring Lights, Camera, or Interaction
 * themselves before calling a 3D chart method; this function detects existing state and
 * avoids overwriting user-configured values.
 *
 * @param {object} opts - Resolved chart options (used to read canvas/ctx target).
 * @returns {void}
 * @private
 */
function setup3DEnvironment(opts) {
  // --- Lights ---
  // Only apply default lights when no lights are currently active so that
  // user-configured lighting is never overwritten.
  const lightState = Lights.state;
  if (!lightState.enabled) {
    Lights.noLights();
    Lights.ambientLight(160, 160, 160);                // soft gray ambient
    Lights.directionalLight(200, 200, 200, 0, -1, -1); // top-front key light
    Lights.directionalLight(80, 80, 100, 0, 1, 0.5);   // soft fill from below
  }

  // --- Camera ---
  // Set a default perspective camera when none has been placed yet.
  const snap = Camera.snapshot?.();
  const hasCamera = snap && (
    snap.eyeX !== 0 || snap.eyeY !== 0 || snap.eyeZ !== 0 ||
    (snap.eye && (snap.eye.x !== 0 || snap.eye.y !== 0 || snap.eye.z !== 0))
  );
  if (!hasCamera) {
    const canvas = (() => {
      try { return getContext(opts?.ctx ?? opts?.canvas)?.canvas ?? Canvex?.canvas ?? null; } catch { return Canvex?.canvas ?? null; }
    })();
    const w = canvas?.width ?? 800;
    const h = canvas?.height ?? 450;
    const aspect = w / (h || 1);
    const fovy = Math.PI / 3; // 60°
    const cameraZ = (h / 2) / Math.tan(fovy / 2);
    // Angle the camera slightly above and to the side for a classic 3D chart look.
    const eyeX = cameraZ * 0.3;
    const eyeY = -cameraZ * 0.25;
    const eyeZ = cameraZ;
    if (typeof Camera.perspective === "function") Camera.perspective(fovy, aspect, 0.1, cameraZ * 10);
    if (typeof Camera.camera === "function") Camera.camera(eyeX, eyeY, eyeZ, 0, 0, 0, 0, 1, 0);
  }

  // --- Interaction (orbit control) ---
  // Wire up mouse/touch orbit control on the canvas so the user can rotate the chart.
  // orbitControl is safe to call repeatedly — it guards against double-registration.
  if (typeof Interaction.orbitControl === "function") {
    try { Interaction.orbitControl(); } catch { /* no-op in non-WebGL / test contexts */ }
  }
}

/**
 *
 * The class supports both constructor-style usage (`new Charts(ctx, config)`) and
 * static convenience methods (`Charts.bar(...)`, `Charts.line(...)`, etc.). Global
 * defaults live in {@link Charts.defaults}; per-chart options are resolved locally
 * through {@link configureLocalOptions} so one chart can override behavior without
 * changing any other chart.
 */
export const Charts = class {
  /**
   * Global default options used as the base for every chart render.
   *
   * Use {@link Charts.configure} to update these defaults globally, or pass options
   * directly to a chart method to keep the configuration local to that chart.
   *
   * @type {object}
   */
  static defaults = defaultOptions;

  /**
   * Supported chart type names.
   *
   * @type {string[]}
   */
  static types = ChartTypes;

  /**
   * Optional storage for chart instances created by consumers.
   *
   * @type {Map<string, Charts>}
   */
  static instances = new Map();

  /**
   * Registry placeholder for plugins and custom controllers.
   *
   * @type {{plugins: Array<*> , controllers: object}}
   */
  static registry = { plugins: [], controllers: {} };

  /**
   * Named option groups that mirror the Chart.js documentation structure.
   *
   * @type {Readonly<object>}
   */
  static optionNamespaces = ChartOptionNamespaces;

  /**
   * Permanently merges options into the global chart defaults.
   *
   * Use this when you want every chart created after the call to inherit the same
   * settings. If you only want to configure a single chart, pass `{ configure: {...} }`
   * or normal options directly to that chart method instead.
   *
   * @param {object} [options={}] - Global options to merge into {@link Charts.defaults}.
   * @returns {object} The updated global defaults object.
   *
   * @example
   * Charts.configure({ animation: false });
   */
  static configure(options = {}) { Charts.defaults = merge(Charts.defaults, options); return Charts.defaults; }

  /**
   * Alias for {@link Charts.configure}.
   *
   * @param {object} [options={}] - Global options to merge into {@link Charts.defaults}.
   * @returns {object} The updated global defaults object.
   */
  static setDefaults(options = {}) { return Charts.configure(options); }

  /**
   * Returns the current global defaults object.
   *
   * @returns {object} The current global defaults.
   */
  static getDefaults() { return Charts.defaults; }

  /**
   * Returns a new options object by merging the global defaults with local options.
   *
   * This method does not mutate {@link Charts.defaults}.
   *
   * @param {object} [options={}] - Local options to merge over the global defaults.
   * @returns {object} A merged options object.
   */
  static getOptions(options = {}) { return merge(Charts.defaults, options); }

  /**
   * Creates and immediately renders a chart instance.
   *
   * @param {HTMLCanvasElement|CanvasRenderingContext2D|string|object} item - Canvas,
   * rendering context, DOM id, or compatible Canvex/Canvas context target.
   * @param {object} [config={}] - Chart.js-style configuration object.
   * @param {string} [config.type="bar"] - Chart type to render.
   * @param {{labels?: Array<*>, datasets?: Array<object>, title?: string}} [config.data] -
   * Chart labels, datasets, and optional title.
   * @param {object} [config.options] - Per-instance chart options.
   * @param {Array<*>} [config.plugins] - Inline plugins to associate with this chart.
   */
  constructor(item, config = {}) {
    this.ctx = getContext(item);
    this.config = config;
    this.type = config.type ?? "bar";
    this.data = config.data ?? {};
    this.options = config.options ?? {};
    this.plugins = config.plugins ?? [];
    this.render();
  }

  /**
   * Renders the current chart instance using its stored type, data, and options.
   *
   * @returns {Charts} The current chart instance for chaining.
   */
  render() { Charts.draw(this.type, this.data.labels, this.data.datasets, this.options, this.data.title ?? this.options?.plugins?.title?.text, this.ctx); return this; }

  /**
   * Re-renders the chart after data or option changes.
   *
   * @param {string} [mode] - Optional update mode placeholder for Chart.js-style APIs.
   * @returns {Charts} The current chart instance for chaining.
   */
  update(mode) { this.render(mode); return this; }

  /**
   * Resizes the underlying canvas and re-renders the chart.
   *
   * @param {number} width - New canvas width in pixels.
   * @param {number} height - New canvas height in pixels.
   * @returns {Charts} The current chart instance for chaining.
   */
  resize(width, height) { if (this.ctx.canvas && width && height) { this.ctx.canvas.width = width; this.ctx.canvas.height = height; } return this.render(); }

  /**
   * Clears the chart drawing area and releases the rendered output.
   *
   * @returns {undefined}
   */
  destroy() { clear(this.ctx, configureLocalOptions(this.type, this.options)); return undefined; }

  /**
   * Clears the chart drawing area without destroying the instance.
   *
   * @returns {Charts} The current chart instance for chaining.
   */
  clear() { clear(this.ctx, configureLocalOptions(this.type, this.options)); return this; }

  /**
   * Resets the chart by rendering it again from the stored configuration.
   *
   * @returns {Charts} The current chart instance for chaining.
   */
  reset() { return this.render(); }

  /**
   * Placeholder for stopping active animations.
   *
   * The current renderer uses requestAnimationFrame directly and does not keep a
   * cancellable animation handle yet, so this method currently returns the instance.
   *
   * @returns {Charts} The current chart instance for chaining.
   */
  stop() { return this; }

  /**
   * Exports the underlying canvas as a Base64 data URL.
   *
   * @param {string} [type="image/png"] - MIME type for the exported image.
   * @param {number} [quality] - Optional encoder quality for supported formats.
   * @returns {string|undefined} A data URL when the canvas supports `toDataURL`.
   */
  toBase64Image(type = "image/png", quality) { return this.ctx.canvas?.toDataURL?.(type, quality); }

  /**
   * Returns lightweight metadata for a dataset.
   *
   * @param {number} [datasetIndex=0] - Index of the dataset to inspect.
   * @returns {{index: number, type: string, data: Array<*>, dataset: object|undefined}}
   * Dataset metadata used by this renderer.
   */
  getDatasetMeta(datasetIndex = 0) { return { index: datasetIndex, type: this.type, data: this.data.datasets?.[datasetIndex]?.data ?? [], dataset: this.data.datasets?.[datasetIndex] }; }

  /**
   * Registers plugins or extension objects with the chart registry.
   *
   * @param {...*} items - Plugin, controller, or extension objects to register.
   * @returns {typeof Charts} The Charts class for chaining.
   */
  static register(...items) { Charts.registry.plugins.push(...items.flat()); return Charts; }

  /**
   * Removes plugins or extension objects from the chart registry.
   *
   * @param {...*} items - Previously registered items to remove.
   * @returns {typeof Charts} The Charts class for chaining.
   */
  static unregister(...items) { Charts.registry.plugins = Charts.registry.plugins.filter(p => !items.flat().includes(p)); return Charts; }

  /**
   * Factory method for creating a chart instance.
   *
   * @param {HTMLCanvasElement|CanvasRenderingContext2D|string|object|object} itemOrConfig -
   * Canvas target or a full configuration object when `config` is omitted.
   * @param {object} [config] - Chart configuration object.
   * @returns {Charts} A newly rendered chart instance.
   */
  static create(itemOrConfig, config) { return config ? new Charts(itemOrConfig, config) : new Charts(undefined, itemOrConfig); }

  /**
   * Dispatches rendering to the static chart method matching `type`.
   *
   * @param {string} type - Chart type to render.
   * @param {Array<*>} labels - Labels for the chart.
   * @param {Array<object>|object|Array<number>} datasets - Dataset collection or shorthand data array.
   * @param {object} [options={}] - Per-chart options. Supports `options`, `configure`, and `animate` aliases.
   * @param {string} [title] - Optional chart title.
   * @param {CanvasRenderingContext2D} [ctx] - Optional context override.
   * @returns {*} The result of the selected chart renderer.
   */
  static draw(type, labels, datasets, options = {}, title, ctx) { const o = ctx ? { ...options, ctx } : options; if (type === "mixed") return Charts.mixed(title, labels, datasets, o); return (Charts[type] ?? Charts.bar)(title, labels, datasets, o); }

  /**
   * Renders a bar chart.
   *
   * @param {string} title - Chart title.
   * @param {Array<*>} labels - Category labels.
   * @param {Array<object>|Array<number>|object} datasets - Dataset definitions or shorthand numeric data.
   * @param {object} [options={}] - Per-chart options; use `{ animation: false }`, `{ options: {...} }`, or `{ configure: {...} }` for local-only configuration.
   * @returns {void}
   */
  static bar(title, labels, datasets, options = {}) { const opts = configureLocalOptions("bar", options); animate(getContext(opts?.ctx ?? opts?.canvas), opts, p => drawCartesian("bar", title, labels, datasets, opts, p)); }

  /**
   * Renders a line chart.
   *
   * @param {string} title - Chart title.
   * @param {Array<*>} labels - Labels for each point.
   * @param {Array<object>|Array<number>|object} datasets - Dataset definitions or shorthand numeric data.
   * @param {object} [options={}] - Per-chart options; local overrides do not mutate global defaults.
   * @returns {void}
   */
  static line(title, labels, datasets, options = {}) { const opts = configureLocalOptions("line", options); animate(getContext(opts?.ctx ?? opts?.canvas), opts, p => drawCartesian("line", title, labels, datasets, opts, p)); }

  /**
   * Renders a scatter chart.
   *
   * @param {string} title - Chart title.
   * @param {Array<*>} labels - Optional labels; point objects may also provide `x` values.
   * @param {Array<object>|object} datasets - Scatter datasets with `{x, y}` points.
   * @param {object} [options={}] - Per-chart options; local overrides do not mutate global defaults.
   * @returns {void}
   */
  static scatter(title, labels, datasets, options = {}) { const opts = configureLocalOptions("scatter", merge({ datasets: { scatter: { showLine: false } } }, options)); animate(getContext(opts?.ctx ?? opts?.canvas), opts, p => drawCartesian("scatter", title, labels, datasets, opts, p)); }

  /**
   * Renders a bubble chart.
   *
   * @param {string} title - Chart title.
   * @param {Array<*>} labels - Optional labels; bubble points may provide `x`, `y`, and `r`.
   * @param {Array<object>|object} datasets - Bubble datasets with `{x, y, r}` points.
   * @param {object} [options={}] - Per-chart options; local overrides do not mutate global defaults.
   * @returns {void}
   */
  static bubble(title, labels, datasets, options = {}) { const opts = configureLocalOptions("bubble", options); animate(getContext(opts?.ctx ?? opts?.canvas), opts, p => drawCartesian("bubble", title, labels, datasets, opts, p)); }

  /**
   * Renders a pie chart.
   *
   * @param {string} title - Chart title.
   * @param {Array<*>} labels - Segment labels.
   * @param {Array<object>|Array<number>|object} datasets - Segment values or dataset object.
   * @param {object} [options={}] - Per-chart options; local overrides do not mutate global defaults.
   * @returns {void}
   */
  static pie(title, labels, datasets, options = {}) { const opts = configureLocalOptions("pie", options); animate(getContext(opts?.ctx ?? opts?.canvas), opts, p => drawCircle("pie", title, labels, datasets, opts, p)); }

  /**
   * Renders a doughnut chart.
   *
   * @param {string} title - Chart title.
   * @param {Array<*>} labels - Segment labels.
   * @param {Array<object>|Array<number>|object} datasets - Segment values or dataset object.
   * @param {object} [options={}] - Per-chart options; set `cutout` or `datasets.doughnut.cutout` to control the center radius.
   * @returns {void}
   */
  static doughnut(title, labels, datasets, options = {}) { const opts = configureLocalOptions("doughnut", options); animate(getContext(opts?.ctx ?? opts?.canvas), opts, p => drawCircle("doughnut", title, labels, datasets, opts, p)); }

  /**
   * Renders a polar area chart.
   *
   * @param {string} title - Chart title.
   * @param {Array<*>} labels - Segment labels.
   * @param {Array<object>|Array<number>|object} datasets - Segment values or dataset object.
   * @param {object} [options={}] - Per-chart options; local overrides do not mutate global defaults.
   * @returns {void}
   */
  static polarArea(title, labels, datasets, options = {}) { const opts = configureLocalOptions("polarArea", options); animate(getContext(opts?.ctx ?? opts?.canvas), opts, p => drawCircle("polarArea", title, labels, datasets, opts, p)); }
  /** Renders a 3D-styled bar chart using Canvas 2D extrusion with Lights shading, Camera perspective, and Interaction orbit control. */
  static bar3d(title, labels, datasets, options = {}) {
    const opts = configureLocalOptions("bar", merge({ threeD: { enabled: true } }, options));
    setup3DEnvironment(opts);
    animate(getContext(opts?.ctx ?? opts?.canvas), opts, p => drawCartesian("bar3d", title, labels, datasets, opts, p));
  }
  /** Renders a 3D-styled pie chart using Canvas 2D extrusion with Lights shading, Camera perspective, and Interaction orbit control. */
  static pie3d(title, labels, datasets, options = {}) {
    const opts = configureLocalOptions("pie", merge({ threeD: { enabled: true } }, options));
    setup3DEnvironment(opts);
    animate(getContext(opts?.ctx ?? opts?.canvas), opts, p => drawCircle("pie3d", title, labels, datasets, opts, p));
  }
  /** Renders a 3D-styled doughnut chart using Canvas 2D extrusion with Lights shading, Camera perspective, and Interaction orbit control. */
  static doughnut3d(title, labels, datasets, options = {}) {
    const opts = configureLocalOptions("doughnut", merge({ threeD: { enabled: true } }, options));
    setup3DEnvironment(opts);
    animate(getContext(opts?.ctx ?? opts?.canvas), opts, p => drawCircle("doughnut3d", title, labels, datasets, opts, p));
  }
  /** Renders a 3D-styled polar area chart using Canvas 2D extrusion with Lights shading, Camera perspective, and Interaction orbit control. */
  static polarArea3d(title, labels, datasets, options = {}) {
    const opts = configureLocalOptions("polarArea", merge({ threeD: { enabled: true } }, options));
    setup3DEnvironment(opts);
    animate(getContext(opts?.ctx ?? opts?.canvas), opts, p => drawCircle("polarArea3d", title, labels, datasets, opts, p));
  }

  /**
   * Renders a radar chart.
   *
   * @param {string} title - Chart title.
   * @param {Array<*>} labels - Axis labels around the radar chart.
   * @param {Array<object>|Array<number>|object} datasets - Radar datasets or shorthand numeric data.
   * @param {object} [options={}] - Per-chart options; local overrides do not mutate global defaults.
   * @returns {void}
   */
  static radar(title, labels, datasets, options = {}) { const opts = configureLocalOptions("radar", options); animate(getContext(opts?.ctx ?? opts?.canvas), opts, p => drawRadar(title, labels, datasets, opts, p)); }

  /**
   * Renders a stacked bar chart where dataset values are stacked on top of each other.
   *
   * @param {string} title - Chart title.
   * @param {Array<*>} labels - Category labels.
   * @param {Array<object>|Array<number>|object} datasets - Dataset definitions; each dataset's values are stacked.
   * @param {object} [options={}] - Per-chart options. Use `{ indexAxis: "y" }` for horizontal stacking.
   * @returns {void}
   */
  static stackedBar(title, labels, datasets, options = {}) { const opts = configureLocalOptions("bar", options); animate(getContext(opts?.ctx ?? opts?.canvas), opts, p => drawStackedBar(title, labels, datasets, opts, p)); }

  /**
   * Renders a filled area chart (line chart with shading under each line).
   *
   * @param {string} title - Chart title.
   * @param {Array<*>} labels - Labels for each point along the x-axis.
   * @param {Array<object>|Array<number>|object} datasets - Dataset definitions or shorthand numeric data.
   * @param {object} [options={}] - Per-chart options; set `backgroundColor` on each dataset to control fill color.
   * @returns {void}
   */
  static area(title, labels, datasets, options = {}) { const opts = configureLocalOptions("line", options); animate(getContext(opts?.ctx ?? opts?.canvas), opts, p => drawArea(title, labels, datasets, opts, p)); }

  /**
   * Renders a histogram by automatically binning a flat numeric dataset.
   *
   * @param {string} title - Chart title.
   * @param {Array<*>} labels - Unused (bins are auto-labelled); pass `[]` or `null`.
   * @param {Array<object>|Array<number>|object} datasets - A single dataset whose `data` is a flat numeric array.
   * @param {object} [options={}] - Per-chart options. Set `options.bins` (or `datasets.histogram.bins`) to control bin count.
   * @returns {void}
   */
  static histogram(title, labels, datasets, options = {}) { const opts = configureLocalOptions("bar", options); animate(getContext(opts?.ctx ?? opts?.canvas), opts, p => drawHistogram(title, labels, datasets, opts, p)); }

  /**
   * Renders a Gantt / timeline chart with horizontal bars positioned by start and end values.
   *
   * Each data point should be `{ start, end }`, `[start, end]`, or a plain number (treated as end, start=0).
   * `labels` maps to the y-axis task names; the x-axis shows the numeric time/value range.
   *
   * @param {string} title - Chart title.
   * @param {Array<*>} labels - Task / row names shown on the y-axis.
   * @param {Array<object>|object} datasets - Datasets where each data point has `{ start, end }`.
   * @param {object} [options={}] - Per-chart options. Use `scales.x.min` / `scales.x.max` to fix the time axis.
   * @returns {void}
   */
  static gantt(title, labels, datasets, options = {}) { const opts = configureLocalOptions("bar", options); animate(getContext(opts?.ctx ?? opts?.canvas), opts, p => drawGantt(title, labels, datasets, opts, p)); }

  /**
   * Renders a mixed chart by grouping datasets by their `type` property.
   *
   * @param {string} title - Chart title.
   * @param {Array<*>} labels - Labels shared by all grouped datasets.
   * @param {Array<object>|object} datasets - Datasets with optional per-dataset `type` values.
   * @param {object} [options={}] - Per-chart options; local overrides do not mutate global defaults.
   * @returns {void}
   */
  static mixed(title, labels, datasets, options = {}) {
    const opts = configureLocalOptions("mixed", options);
    const ds = normalizeDatasets(datasets); const byType = new Map(); ds.forEach(d => { const t = d.type ?? "bar"; if (!byType.has(t)) byType.set(t, []); byType.get(t).push(d); });
    let first = true; for (const [type, group] of byType) { const groupOptions = first ? opts : merge(opts, { backgroundColor: undefined, plugins: { title: { display: false }, legend: { display: false } }, animation: { duration: 0 } }); Charts.draw(type, labels, group, groupOptions, first ? title : undefined); first = false; }
  }
}

export { Lights, Camera, Interaction };