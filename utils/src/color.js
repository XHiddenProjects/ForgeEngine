"use strict";

/** Dependency-free RGBA color utility. Channels are integers from 0 to 255. */
(function (root, factory) {
    const Color = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = Color;          // const Color = require("./color");
        module.exports.Color = Color;    // const { Color } = require("./color");
    } else if (root) {
        root.Color = Color;
    }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    const byte = value => {
        value = Number(value);
        return Number.isFinite(value) ? Math.min(255, Math.max(0, Math.round(value))) : 0;
    };
    const unit = value => Math.min(1, Math.max(0, Number(value) || 0));

    class Color {
        constructor(r = 0, g = 0, b = 0, a = 255) {
            if (typeof r === "string" || (typeof r === "number" && arguments.length === 1)) {
                return Color.parse(r);
            }
            if (r && typeof r === "object") {
                ({ r = 0, g = 0, b = 0, a = 255 } = r);
            }
            this.r = byte(r); this.g = byte(g); this.b = byte(b); this.a = byte(a);
        }

        set(r = 0, g = 0, b = 0, a = 255) {
            if (r && typeof r === "object") ({ r, g, b, a = 255 } = r);
            this.r = byte(r); this.g = byte(g); this.b = byte(b); this.a = byte(a);
            return this;
        }
        copy(color) { return this.set(color); }
        clone() { return new Color(this.r, this.g, this.b, this.a); }
        equals(c) { return !!c && this.r === c.r && this.g === c.g && this.b === c.b && this.a === c.a; }

        add(c) {
            this.r = byte(this.r + c.r); this.g = byte(this.g + c.g);
            this.b = byte(this.b + c.b); this.a = byte(this.a + (c.a ?? 0));
            return this;
        }
        multiply(value) {
            if (value && typeof value === "object") {
                this.r = byte(this.r * value.r / 255); this.g = byte(this.g * value.g / 255);
                this.b = byte(this.b * value.b / 255); this.a = byte(this.a * (value.a ?? 255) / 255);
            } else {
                this.r = byte(this.r * value); this.g = byte(this.g * value); this.b = byte(this.b * value);
            }
            return this;
        }
        lerp(target, amount) {
            const t = unit(amount);
            this.r = byte(this.r + (target.r - this.r) * t);
            this.g = byte(this.g + (target.g - this.g) * t);
            this.b = byte(this.b + (target.b - this.b) * t);
            this.a = byte(this.a + ((target.a ?? 255) - this.a) * t);
            return this;
        }
        withAlpha(alpha) {
            const result = this.clone();
            result.a = byte(alpha >= 0 && alpha <= 1 ? alpha * 255 : alpha);
            return result;
        }

        toHex(includeAlpha = this.a !== 255) {
            const hex = n => n.toString(16).padStart(2, "0").toUpperCase();
            return `#${hex(this.r)}${hex(this.g)}${hex(this.b)}${includeAlpha ? hex(this.a) : ""}`;
        }
        toRGB() { return `rgb(${this.r}, ${this.g}, ${this.b})`; }
        toRGBA() { return `rgba(${this.r}, ${this.g}, ${this.b}, ${Number((this.a / 255).toFixed(3))})`; }
        toArray(normalized = false) {
            return normalized ? [this.r / 255, this.g / 255, this.b / 255, this.a / 255] : [this.r, this.g, this.b, this.a];
        }
        toJSON() { return { r: this.r, g: this.g, b: this.b, a: this.a }; }
        toUint32() { return ((this.r << 24) | (this.g << 16) | (this.b << 8) | this.a) >>> 0; }
        toString() { return this.toHex(); }

        static fromHex(input) {
            if (typeof input !== "string") throw new TypeError("Hex color must be a string.");
            let hex = input.trim().replace(/^#/, "");
            if (/^[0-9a-f]{3,4}$/i.test(hex)) hex = [...hex].map(c => c + c).join("");
            if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) throw new TypeError(`Invalid hex color: ${input}`);
            return new Color(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16),
                parseInt(hex.slice(4, 6), 16), hex.length === 8 ? parseInt(hex.slice(6), 16) : 255);
        }
        static fromArray(v, normalized = false) {
            if (!Array.isArray(v) && !ArrayBuffer.isView(v)) throw new TypeError("Expected an array or typed array.");
            const s = normalized ? 255 : 1;
            return new Color((v[0] ?? 0) * s, (v[1] ?? 0) * s, (v[2] ?? 0) * s, (v[3] ?? (normalized ? 1 : 255)) * s);
        }
        static fromUint32(v) {
            v = Number(v) >>> 0;
            return new Color(v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
        }
        static parse(v) {
            if (v instanceof Color) return v.clone();
            if (typeof v === "string") return Color.fromHex(v);
            if (typeof v === "number") return Color.fromUint32(v);
            if (Array.isArray(v) || ArrayBuffer.isView(v)) return Color.fromArray(v);
            if (v && typeof v === "object") return new Color(v);
            throw new TypeError("Unsupported color value.");
        }
        static lerp(start, end, amount) { return Color.parse(start).lerp(Color.parse(end), amount); }

        // Getters prevent callers from mutating shared constants.
        static get TRANSPARENT() { return new Color(0, 0, 0, 0); }
        static get BLACK() { return new Color(0, 0, 0); }
        static get WHITE() { return new Color(255, 255, 255); }
        static get RED() { return new Color(255, 0, 0); }
        static get GREEN() { return new Color(0, 255, 0); }
        static get BLUE() { return new Color(0, 0, 255); }
        static get YELLOW() { return new Color(255, 255, 0); }
        static get CYAN() { return new Color(0, 255, 255); }
        static get MAGENTA() { return new Color(255, 0, 255); }
    }
    return Color;
});
