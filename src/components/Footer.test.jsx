import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const config = {};
vi.mock('@sepetakhq/storefront-kit/config/ConfigProvider', () => ({ useConfig: () => config }));
let categories = [];
vi.mock('@sepetakhq/storefront-kit/hooks/queries', () => ({ useCategories: () => ({ data: categories }) }));

const Footer = (await import('./Footer.jsx')).default;

afterEach(cleanup);

function setup(brand = {}, { cats = [{ key: 'kacang', label: 'Kacang' }], payments } = {}) {
  categories = cats;
  Object.assign(config, {
    paymentMethods: payments ?? [{ code: 'QRIS', name: 'QRIS', enabled: true }, { code: 'OFF', name: 'Mati', enabled: false }],
    tenant: { name: 'Toko Contoh' },
    brand: {
      nav: [{ route: 'home', path: '/', label: 'Beranda' }],
      wordmark_primary: 'Toko',
      address_line1: 'Jl. Contoh 1',
      phone: '0812-0000',
      social_links: [{ kind: 'tiktok', url: 'https://tiktok.com/@a' }],
      copyright: '© Toko',
      sections: {},
      ...brand,
    },
  });
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
}

describe('Footer', () => {
  it('uses its own column titles when the shop set none, and only enabled payments', () => {
    setup();
    for (const t of ['Menu', 'Kategori', 'Kontak']) expect(screen.getByRole('heading', { name: t })).toBeTruthy();
    expect(screen.getByText('Pembayaran:')).toBeTruthy();
    expect(screen.getByText('QRIS')).toBeTruthy();
    expect(screen.queryByText('Mati')).toBeNull();
    expect(screen.getByRole('link', { name: 'TikTok' }).textContent).toBe('TT');
  });

  it("uses the shop's column titles", () => {
    setup({ sections: { footer_shop_heading: 'Jelajah', footer_contact_heading: 'Hubungi', footer_payment_heading: 'Bayar' } });
    for (const t of ['Jelajah', 'Hubungi']) expect(screen.getByRole('heading', { name: t })).toBeTruthy();
    expect(screen.getByText('Bayar:')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Menu' })).toBeNull();
  });

  // The design's hardcoded "Bantuan" links (/page/shipping and friends) are
  // not routes; the column is the merchant's nav plus order tracking.
  it('links only the merchant nav and order tracking', () => {
    setup();
    const menu = screen.getByRole('navigation', { name: 'Menu' });
    expect([...menu.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/', '/lacak']);
    expect(screen.getByRole('link', { name: 'Kacang' }).getAttribute('href')).toBe('/katalog?cat=kacang');
    expect(screen.getByRole('link', { name: /0812-0000/ }).getAttribute('href')).toBe('tel:08120000');
  });

  it("draws the server's badge in place of a name, once per badge, and keeps names it has none for", () => {
    const bca = 'http://api.test/logos/payment/bca.svg';
    const { container } = setup({}, {
      payments: [
        { code: 'BCA', name: 'VA BCA', enabled: true, logo_url: bca },
        { code: 'MANUAL_BCA', name: 'Transfer BCA', enabled: true, logo_url: bca },
        { code: 'MANUAL_BANK_1', name: 'Transfer SeaBank', enabled: true },
      ],
    });
    const imgs = [...container.querySelectorAll('.pc-logo-chip img')];
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual([bca]);
    // The first name behind a badge is how it is read aloud.
    expect(screen.getByRole('img', { name: 'VA BCA' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Transfer BCA' })).toBeNull();
    expect(screen.getByText('Transfer SeaBank')).toBeTruthy();
  });

  it('draws no column for what the shop has not got', () => {
    setup({ nav: [], address_line1: '', phone: '', email: '', social_links: [], copyright: '' }, { cats: [], payments: [] });
    for (const t of ['Kategori', 'Kontak']) expect(screen.queryByRole('heading', { name: t })).toBeNull();
    expect(screen.queryByText('Pembayaran:')).toBeNull();
    // Tracking is never dropped: a buyer looking for a parcel scrolls here.
    expect(screen.getByRole('link', { name: 'Lacak pesanan' })).toBeTruthy();
  });
});
