/**
 * Maps a hard-coded light-mode color to its dark-mode counterpart, by role.
 *
 * Only used for literal colors written in screens (e.g. '#F5F5F5'); palette
 * tokens (Colors.*) have hand-picked dark values in palettes.js instead.
 *
 * Roles:
 *  - 'bg'     : light fills become dark surfaces (tints keep their hue);
 *               saturated/dark fills (buttons, badges, navy) are kept.
 *  - 'text'   : dark text becomes light text (hue kept); light text is kept.
 *  - 'border' : light hairlines become dark hairlines.
 *  - 'keep'   : untouched (shadows, brand accents, chart series).
 */

const NAMED = {
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export const parseColor = (input) => {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  if (NAMED[value]) return NAMED[value].slice();
  let m = /^#([0-9a-f]{3,8})$/.exec(value);
  if (m) {
    let hex = m[1];
    if (hex.length === 3 || hex.length === 4) hex = hex.split('').map((ch) => ch + ch).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), hex.length === 8 ? n(6) / 255 : 1];
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  return null;
};

const rgbToHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
};

const hslToRgb = (h, s, l) => {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
};

const format = ([r, g, b], a) => {
  const R = Math.round(r);
  const G = Math.round(g);
  const B = Math.round(b);
  if (a >= 1) {
    return `#${[R, G, B].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  }
  return `rgba(${R}, ${G}, ${B}, ${Number(a.toFixed(3))})`;
};

const cache = new Map();

export const toDarkColor = (color, role) => {
  if (role === 'keep' || typeof color !== 'string') return color;
  const key = `${role}|${color}`;
  if (cache.has(key)) return cache.get(key);

  let result = color;
  const rgba = parseColor(color);
  if (rgba) {
    const [r, g, b, a] = rgba;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (role === 'bg' && a < 0.5) {
      // Translucent washes (e.g. rgba(255,255,255,0.06) on a navy hero) stay as-is.
    } else if (role === 'bg' && l >= 0.7) {
      // White -> #252526-ish card; pastel tints -> deep tints of the same hue.
      const nl = 0.145 + (1 - l) * 0.6;
      result = format(hslToRgb(h, clamp01(s * 0.45), nl), a);
    } else if (role === 'text' && l <= 0.5) {
      // #0B0B0B -> ~#E6E6E6, #636363 -> ~#A8A8A8, dark green -> light green.
      const nl = Math.max(0.93 - l * 0.7, s > 0.35 ? 0.7 : 0);
      result = format(hslToRgb(h, Math.min(s, 0.85), nl), a);
    } else if (role === 'text' && s > 0.35 && l < 0.7) {
      // Saturated mid-tones (#7C3AED, #4F46E5) are too dim on dark surfaces.
      result = format(hslToRgb(h, Math.min(s, 0.85), 0.7), a);
    } else if (role === 'border' && l >= 0.7) {
      const nl = 0.19 + (1 - l) * 0.6;
      result = format(hslToRgb(h, clamp01(s * 0.5), nl), a);
    }
  }
  cache.set(key, result);
  return result;
};

const ROLE_BY_PROP = {
  backgroundColor: 'bg',
  color: 'text',
  tintColor: 'text',
  placeholderTextColor: 'text',
  textDecorationColor: 'text',
  borderColor: 'border',
  borderTopColor: 'border',
  borderBottomColor: 'border',
  borderLeftColor: 'border',
  borderRightColor: 'border',
  borderStartColor: 'border',
  borderEndColor: 'border',
  borderBlockColor: 'border',
  borderInlineColor: 'border',
  outlineColor: 'border',
  overlayColor: 'bg',
  // shadowColor / textShadowColor intentionally kept.
};

export const roleForProp = (prop, extraRoles) =>
  (extraRoles && extraRoles[prop]) || ROLE_BY_PROP[prop] || null;
