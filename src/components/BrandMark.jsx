import { useState } from 'react';

import { useConfig } from '@sepetakhq/storefront-kit/config/ConfigProvider';

import Icon from '../ui/Icon.jsx';

/**
 * The shop's name: its uploaded logo, or the design's leaf beside the
 * two-line wordmark (primary above, accent under it).
 *
 * Deliberately not `ui/Img.jsx`: a logo whose ratio nobody knows would be
 * cropped by it, and its loading gradient would show through a transparent
 * PNG. The height is fixed and the width follows the image, so a wide
 * wordmark logo and a square monogram both fit. A logo that fails to load
 * falls back to the wordmark rather than leaving a hole -- the media pipeline
 * never retries an asset it once refused.
 *
 * @param {number} height   logo height in px; width follows the image
 * @param {number} maxWidth cap, so an extremely wide logo cannot push the nav
 * @param {'light'|'dark'} tone  light = on white (header), dark = on the footer
 */
export function BrandMark({ height = 40, maxWidth = 200, tone = 'light' }) {
  const { brand, tenant } = useConfig();
  const [failed, setFailed] = useState(false);

  const logo = brand.logoImage;
  const primary = brand.wordmark_primary || tenant?.name || '';
  const accent = brand.wordmark_accent || '';
  const name = [primary, accent].filter(Boolean).join(' ');

  if (logo?.url && !failed) {
    return (
      <img
        src={logo.url}
        srcSet={logo.srcset || undefined}
        sizes={logo.srcset ? `${maxWidth}px` : undefined}
        // Never empty: this image *is* the shop's name.
        alt={logo.alt || name}
        height={height}
        onError={() => setFailed(true)}
        style={{ height, width: 'auto', maxWidth, display: 'block', objectFit: 'contain' }}
      />
    );
  }

  const dark = tone === 'dark';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <Icon name="leaf" size={dark ? 32 : 36} strokeWidth={1.6} style={{ color: dark ? 'var(--pc-white)' : 'var(--pc-green)' }} />
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span
          className="pc-wordmark-primary"
          style={{ color: dark ? 'var(--pc-white)' : undefined, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {primary}
        </span>
        {accent && (
          <span className="pc-wordmark-accent" style={{ color: dark ? 'var(--pc-foot-text)' : undefined }}>
            {accent}
          </span>
        )}
      </span>
    </span>
  );
}
