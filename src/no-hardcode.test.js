import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The template's promise: nothing about a merchant, and no colour outside the
// stylesheet. One bundle serves every shop that picks it, so a phone number
// or a shop name in here is shown to all of them, and a colour in a JSX
// style is one the palette can never reach.

const SRC = import.meta.dirname;

function sources(dir = SRC) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    if (!/\.(js|jsx)$/.test(name) || /\.test\.(js|jsx)$/.test(name)) return [];
    return [p];
  });
}

// The QR encoder paints a canvas, which cannot read a CSS variable.
const COLOUR_EXEMPT = new Set(['ui/QrCode.jsx']);

const files = sources().map((p) => ({ path: relative(SRC, p), text: readFileSync(p, 'utf8') }));
const css = readFileSync(join(SRC, 'styles.css'), 'utf8');

describe('no hardcoded parts', () => {
  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('keeps every colour in styles.css', () => {
    const offenders = files
      .filter((f) => !COLOUR_EXEMPT.has(f.path))
      .flatMap((f) =>
        [...f.text.matchAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\(|hsla?\(/g)].map((m) => `${f.path}: ${m[0]}`),
      );
    expect(offenders).toEqual([]);
  });

  it('uses only tokens the stylesheet defines', () => {
    const defined = new Set([...css.matchAll(/(--pc-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set(files.flatMap((f) => [...f.text.matchAll(/var\((--pc-[a-z0-9-]+)\)/g)].map((m) => m[1])));
    const cssUsed = [...css.matchAll(/var\((--pc-[a-z0-9-]+)\)/g)].map((m) => m[1]);
    const missing = [...used, ...cssUsed].filter((t) => !defined.has(t));
    expect([...new Set(missing)]).toEqual([]);
  });

  it('names no shop, contact or brand', () => {
    // The seeded demo shops, and the templates this one was forked from.
    const banned = [/kebun/i, /camilan/i, /ayuna/i, /pasar segar/i, /lily ?alora/i, /bali linen/i, /wa\.me\/\d/, /\.local\b/, /plus jakarta/i, /@[a-z0-9-]+\.(com|id)\b/i];
    const offenders = files.flatMap((f) => banned.filter((re) => re.test(f.text)).map((re) => `${f.path}: ${re}`));
    expect(offenders).toEqual([]);
  });
});
