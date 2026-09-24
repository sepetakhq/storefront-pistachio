import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fmt, shippingCopy } from '@sepetakhq/storefront-kit/shared/format';

afterEach(cleanup);

// The bar reads the banner from the home query and the substitution rules from
// the config. Both are hooks, and both are the seam.
let home = { data: undefined };
let freeShipping = true;
let brand = {};

vi.mock('@sepetakhq/storefront-kit/hooks/queries', () => ({
  useHome: () => home,
  useProduct: () => ({ data: undefined }),
}));

vi.mock('@sepetakhq/storefront-kit/config/ConfigProvider', () => ({
  useConfig: () => ({
    brand,
    tenant: {},
    // The real provider's helper, wired the same way, so this test exercises
    // the actual withholding rule rather than a stand-in for it.
    copy: (s) => shippingCopy(s, { free_shipping_min: fmt(150000) }, freeShipping),
  }),
}));

const { Announcement } = await import('./RootLayout.jsx');

function show() {
  render(
    <MemoryRouter>
      <Announcement />
    </MemoryRouter>,
  );
}

describe('Announcement', () => {
  it('renders the merchant’s banner', () => {
    home = { data: { announcement: { enabled: true, text: 'Koleksi perdana telah hadir' } } };
    show();

    expect(screen.getByText('Koleksi perdana telah hadir')).toBeTruthy();
  });

  it('renders nothing while the query is still resolving', () => {
    home = { data: undefined };
    const { container } = render(
      <MemoryRouter>
        <Announcement />
      </MemoryRouter>,
    );

    expect(container.textContent).toBe('');
  });

  it('renders nothing when the merchant switched it off', () => {
    home = { data: { announcement: { enabled: false, text: 'Koleksi perdana telah hadir' } } };
    const { container } = render(
      <MemoryRouter>
        <Announcement />
      </MemoryRouter>,
    );

    expect(container.textContent).toBe('');
  });

  // The bug this fixes: the seeded banner said "Rp 150.000" as a literal, so a
  // merchant who raised their threshold advertised the old one indefinitely.
  it('substitutes the shop’s actual free-shipping threshold', () => {
    freeShipping = true;
    home = {
      data: {
        announcement: { enabled: true, text: 'Gratis ongkir min {free_shipping_min}.' },
      },
    };
    show();

    expect(screen.getByText('Gratis ongkir min Rp 150.000.')).toBeTruthy();
  });

  // A bar promising free shipping the checkout would refuse is worse than no
  // bar. The sentence is withheld, and a banner that was only that sentence
  // therefore disappears -- which the backoffice hint has to warn about.
  it('withholds a free-shipping promise the shop no longer offers', () => {
    freeShipping = false;
    home = {
      data: {
        announcement: { enabled: true, text: 'Gratis ongkir min {free_shipping_min}.' },
      },
    };
    const { container } = render(
      <MemoryRouter>
        <Announcement />
      </MemoryRouter>,
    );

    expect(container.textContent).toBe('');
  });

  // The design's right-hand side: where the shop ships from and its hours,
  // each only when the merchant filled it in, and the bar still shows with
  // no announcement at all.
  it('shows the origin city and hours beside the banner, each only when set', () => {
    freeShipping = true;
    brand = { origin_city: 'Bandung', opening_hours: 'Senin–Sabtu' };
    home = { data: { announcement: { enabled: false, text: 'x' } } };
    show();
    expect(screen.getByText('Dikirim dari Bandung')).toBeTruthy();
    expect(screen.getByText('Senin–Sabtu')).toBeTruthy();
    cleanup();

    brand = { opening_hours: '' };
    home = { data: { announcement: { enabled: true, text: 'Promo' } } };
    show();
    expect(screen.queryByText(/Dikirim dari/)).toBeNull();
    brand = {};
  });

  // Copy that says nothing about shipping is unaffected either way.
  it('keeps the sentences that are not about shipping', () => {
    freeShipping = false;
    home = {
      data: {
        announcement: {
          enabled: true,
          text: 'Koleksi perdana telah hadir. Gratis ongkir min {free_shipping_min}.',
        },
      },
    };
    show();

    expect(screen.getByText('Koleksi perdana telah hadir.')).toBeTruthy();
  });
});
