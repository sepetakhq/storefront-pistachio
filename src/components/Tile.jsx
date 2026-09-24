import { initials, tintFor } from '../lib/copy.js';

/**
 * The picture a product or category has when it has none: two letters on
 * the category's tint. This is what a shop looks like before the merchant
 * uploads anything, so it has to look designed rather than broken.
 */
export function Tile({ label, tintKey, size = 22 }) {
  return (
    <div className="pc-tile" style={{ background: tintFor(tintKey ?? label), fontSize: size }} aria-hidden="true">
      {initials(label)}
    </div>
  );
}
