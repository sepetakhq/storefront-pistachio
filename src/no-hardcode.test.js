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

  // Every label the merchant can rename has one home, DEFAULT_LABELS in
  // lib/copy.js, read through sectionText. The same words typed anywhere
  // else would be a label the backoffice cannot reach.
  it('keeps renameable labels in DEFAULT_LABELS only', () => {
    const copyJs = files.find((f) => f.path === 'lib/copy.js').text;
    const table = copyJs.slice(copyJs.indexOf('export const DEFAULT_LABELS'), copyJs.indexOf('};', copyJs.indexOf('export const DEFAULT_LABELS')));
    const labels = [...table.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]).filter((l) => l.length > 6 && !l.includes('{'));
    // Checkout and the order page are the shop system's own wording (step
    // names, payment help), which shares a few words with the labels.
    const SYSTEM = new Set(['screens/CheckoutRoute.jsx', 'screens/OrderRoute.jsx']);
    const offenders = files.filter((f) => !SYSTEM.has(f.path)).flatMap((f) => {
      const text = f.path === 'lib/copy.js' ? f.text.replace(table, '') : f.text;
      return labels.filter((l) => text.includes(`'${l}'`) || text.includes(`>${l}<`) || text.includes(`\`${l} `)).map((l) => `${f.path}: ${l}`);
    });
    expect(labels.length).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });

  it('names no shop, contact or brand', () => {
    // The seeded demo shops, and the templates this one was forked from.
    const banned = [/kebun/i, /camilan/i, /ayuna/i, /pasar segar/i, /lily ?alora/i, /bali linen/i, /wa\.me\/\d/, /\.local\b/, /plus jakarta/i, /@[a-z0-9-]+\.(com|id)\b/i];
    const offenders = files.flatMap((f) => banned.filter((re) => re.test(f.text)).map((re) => `${f.path}: ${re}`));
    expect(offenders).toEqual([]);
  });
});
