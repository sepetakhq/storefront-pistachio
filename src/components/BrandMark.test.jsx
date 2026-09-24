import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

// The mark reads its shop out of the config context, and building a real one
// means a query client and a live endpoint. The hook is the seam.
const config = { brand: {} };
vi.mock('@sepetakhq/storefront-kit/config/ConfigProvider', () => ({
  useConfig: () => config,
}));

const { BrandMark } = await import('./BrandMark.jsx');

const wordmark = { primary: '#1B1530', accent: '#E0336F', size: 28 };

function withBrand(brand) {
  config.brand = brand;
}

describe('BrandMark', () => {
  // The state every tenant is in until they upload something, including the
  // seeded one. A header with no name in it is the worst possible regression
  // here, so this is the case that must never break.
  it('renders the wordmark when no logo is set', () => {
    withBrand({ wordmark_primary: 'Lily', wordmark_accent: 'Alora', logoImage: null });
    render(<BrandMark height={34} maxWidth={200} wordmark={wordmark} />);

    expect(screen.getByText('Lily')).toBeTruthy();
    expect(screen.getByText('Alora')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders the logo when the merchant has uploaded one', () => {
    withBrand({
      wordmark_primary: 'Lily',
      wordmark_accent: 'Alora',
      logoImage: { url: 'https://cdn.test/logo.png', srcset: '', alt: '' },
    });
    render(<BrandMark height={34} maxWidth={200} wordmark={wordmark} />);

    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('https://cdn.test/logo.png');
    expect(screen.queryByText('Lily')).toBeNull();
  });

  // A logo *is* the shop's name, so an empty alt would leave a screen reader
  // with no idea which shop it is on.
  it('falls back to the shop name for alt text', () => {
    withBrand({
      wordmark_primary: 'Lily',
      wordmark_accent: 'Alora',
      logoImage: { url: 'https://cdn.test/logo.png', alt: '' },
    });
    render(<BrandMark height={34} maxWidth={200} wordmark={wordmark} />);

    expect(screen.getByRole('img').getAttribute('alt')).toBe('Lily Alora');
  });

  it('prefers the merchant’s own alt text', () => {
    withBrand({
      wordmark_primary: 'Lily',
      logoImage: { url: 'https://cdn.test/logo.png', alt: 'Monogram Lily Alora' },
    });
    render(<BrandMark height={34} maxWidth={200} wordmark={wordmark} />);

    expect(screen.getByRole('img').getAttribute('alt')).toBe('Monogram Lily Alora');
  });

  // The media pipeline never retries an asset it once refused, so a logo that
  // failed to encode stays broken until somebody re-uploads. Until then the
  // header has to show the shop's name, not a broken-image icon.
  it('falls back to the wordmark when the logo fails to load', () => {
    withBrand({
      wordmark_primary: 'Lily',
      wordmark_accent: 'Alora',
      logoImage: { url: 'https://cdn.test/missing.png', alt: '' },
    });
    render(<BrandMark height={34} maxWidth={200} wordmark={wordmark} />);

    fireEvent.error(screen.getByRole('img'));

    expect(screen.getByText('Lily')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  // The height is what reserves space in a sticky header; the width belongs to
  // the image, because a wide wordmark and a square monogram both land here.
  it('fixes the height and leaves the width to the image', () => {
    withBrand({ logoImage: { url: 'https://cdn.test/logo.png', alt: 'x' } });
    render(<BrandMark height={34} maxWidth={200} wordmark={wordmark} />);

    const img = screen.getByRole('img');
    expect(img.getAttribute('height')).toBe('34');
    expect(img.style.width).toBe('auto');
    expect(img.style.maxWidth).toBe('200px');
  });

  // An empty candidate list is not the same as no candidate list, and browsers
  // disagree about what it means -- the same rule ui/Img.jsx follows.
  it('never emits an empty srcset', () => {
    withBrand({ logoImage: { url: 'https://cdn.test/logo.png', srcset: '', alt: 'x' } });
    render(<BrandMark height={34} maxWidth={200} wordmark={wordmark} />);

    expect(screen.getByRole('img').hasAttribute('srcset')).toBe(false);
  });
});
