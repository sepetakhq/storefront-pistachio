import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

const config = { brand: { nav: [], heroImages: [], heroStats: [], sections: {} } };
vi.mock('@sepetakhq/storefront-kit/config/ConfigProvider', () => ({ useConfig: () => config }));

const home = { data: { sections: [] }, isPending: false, isError: false };
vi.mock('@sepetakhq/storefront-kit/hooks/queries', () => ({ useHome: () => home }));

const cart = { items: [], add: vi.fn(), setQty: vi.fn(), remove: vi.fn() };
vi.mock('@sepetakhq/storefront-kit/cart/CartProvider', () => ({ useCart: () => cart }));
vi.mock('@sepetakhq/storefront-kit/ui/ToastProvider', () => ({ useToast: () => vi.fn() }));

const { default: HomeRoute, RAIL_ARROWS_AFTER } = await import('./HomeRoute.jsx');

afterEach(cleanup);

function setup(sections, brand = {}, rest = {}) {
  Object.assign(config, { freeShipping: false, freeShippingMinLabel: '', paymentMethods: [], couriers: [], ...rest });
  config.brand = { nav: [], heroImages: [], heroStats: [], sections: {}, ...brand };
  home.data = { sections };
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <HomeRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const HERO = { id: 'h', type: 'hero', hero: { title: 'Camilan Seimbang.', em: 'Hidup Lebih Murni.', sub: 'Sub.', cta: 'Belanja Sekarang' } };
const CATS = { id: 'c', type: 'cats', cats: [{ key: 'kacang', label: 'Kacang & Biji', subtitle: 'Almond, mete' }] };
const product = (i) => ({ id: `p${i}`, slug: `p${i}`, name: `Produk ${i}`, price: 20000, stock: 20, availability: 'available' });
const PRODUCTS = [{ ...product(1), compare_at_price: 30000, on_sale: true }];

describe('HomeRoute', () => {
  it('invites the buyer to the catalogue when nothing is published', () => {
    setup([]);
    expect(screen.getByText('Toko sedang disiapkan')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Lihat katalog' })).toBeTruthy();
  });

  it('treats a page of empty or unknown sections as empty', () => {
    setup([{ id: 'x', type: 'video-hero' }, { id: 'f', type: 'features', features: { title: 'T', items: [] } }]);
    expect(screen.getByText('Toko sedang disiapkan')).toBeTruthy();
  });

  // hero.em is text after the title, not a part of it (the design's
  // indexOf split drew nothing when the two did not overlap).
  it('draws the hero title with its emphasis after it', () => {
    setup([HERO], { hero_eyebrow: 'Camilan sehat' });
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('Camilan Seimbang. Hidup Lebih Murni.');
    expect(h1.querySelector('em').textContent).toBe('Hidup Lebih Murni.');
    expect(screen.getByText('Camilan sehat')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Belanja Sekarang' }).getAttribute('href')).toBe('/katalog');
  });

  it('sends the second hero button to the categories, or the catalogue when there are none', () => {
    setup([HERO, CATS], { sections: { hero_secondary_cta: 'Pilih kategori' } });
    expect(screen.getByRole('link', { name: 'Pilih kategori' })).toBeTruthy();
    expect(document.getElementById('kategori')).toBeTruthy();
    cleanup();
    setup([HERO]);
    expect(screen.queryByRole('link', { name: 'Lihat kategori' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Lihat semua' }).getAttribute('href')).toBe('/katalog');
  });

  it('builds the hero chips from the shop config, never promising what is switched off', () => {
    setup([HERO], {}, {
      freeShipping: true,
      freeShippingMinLabel: 'Rp 150.000',
      paymentMethods: [{ code: 'QRIS', name: 'QRIS', enabled: true }],
      couriers: [{ code: 'jne', name: 'JNE', enabled: true }],
    });
    expect(screen.getByText('Gratis ongkir')).toBeTruthy();
    expect(screen.getByText('min. Rp 150.000')).toBeTruthy();
    expect(screen.getByText('1 kurir')).toBeTruthy();
    cleanup();
    setup([HERO], {}, { freeShipping: false, freeShippingMinLabel: 'Rp 150.000' });
    expect(screen.queryByText('Gratis ongkir')).toBeNull();
  });

  it('draws a known feature emoji as its icon and anything else as typed', () => {
    const { container } = setup([
      { id: 'f', type: 'features', features: { title: 'Kenapa kami', items: [{ mark: '🌿', title: 'Alami' }, { mark: '24j', title: 'Cepat' }, { mark: '', title: 'Tanpa' }] } },
    ]);
    expect(screen.getByRole('region', { name: 'Kenapa kami' })).toBeTruthy();
    expect(screen.queryByText('🌿')).toBeNull();
    expect(screen.getByText('24j')).toBeTruthy();
    expect(container.querySelectorAll('.pc-feature-mark svg')).toHaveLength(2);
  });

  it('links categories into the catalogue filter, with initials for a missing picture', () => {
    setup([CATS]);
    expect(screen.getByRole('link', { name: /Kacang & Biji/ }).getAttribute('href')).toBe('/katalog?cat=kacang');
    expect(screen.getByText('KB')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Kategori' })).toBeTruthy();
  });

  it('gives the carousel arrows only once it holds more than fits', () => {
    const few = Array.from({ length: RAIL_ARROWS_AFTER }, (_, i) => product(i));
    setup([{ id: 'g', type: 'grid', grid: { title: 'Pilihan', products: few } }]);
    expect(screen.queryByRole('button', { name: 'Berikutnya' })).toBeNull();
    cleanup();
    setup([{ id: 'g', type: 'grid', grid: { title: 'Pilihan', products: [...few, product(9)] } }]);
    expect(screen.getByRole('button', { name: 'Berikutnya' })).toBeTruthy();
    expect(screen.getAllByTestId('product-card')).toHaveLength(RAIL_ARROWS_AFTER + 1);
  });

  it('skips an empty grid and renders a filled one', () => {
    setup([
      { id: 'g0', type: 'grid', grid: { title: 'Kosong', products: [] } },
      { id: 'g1', type: 'carousel', grid: { title: 'Paling laris', products: PRODUCTS } },
    ]);
    expect(screen.queryByText('Kosong')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Paling laris' })).toBeTruthy();
  });

  it('shows the campaign badge and title, and a countdown only inside a week', () => {
    const soon = new Date(Date.now() + 54 * 3600 * 1000).toISOString();
    const far = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    setup([{ id: 'c', type: 'campaign', campaign: { badge: 'Hemat 20%', title: 'Flash Sale', discount_type: 'percentage', discount_value: 20, ends_at: soon, products: PRODUCTS } }]);
    expect(screen.getByText('Hemat 20%')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Flash Sale' })).toBeTruthy();
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Lihat semua promo/ }).getAttribute('href')).toBe('/katalog?sale=1');

    cleanup();
    setup([{ id: 'c', type: 'campaign', campaign: { title: 'Flash Sale', ends_at: far, products: PRODUCTS } }]);
    expect(screen.queryByRole('timer')).toBeNull();
  });

  // A promotion with no end date must not draw 00:00:00:00.
  it('draws no countdown for a campaign with no end, and phrases one with no title', () => {
    setup([{ id: 'c', type: 'campaign', campaign: { title: '', discount_type: 'percentage', discount_value: 30, ends_at: null, products: [] } }]);
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByText(/Berakhir dalam/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Diskon hingga 30%' })).toBeTruthy();
  });

  it("prefers the shop's campaign headline and labels", () => {
    setup([{ id: 'c', type: 'campaign', campaign: { title: 'Flash Sale', headline: 'Hemat akhir bulan', products: PRODUCTS } }], {
      sections: { campaign_cta: 'Semua diskon' },
    });
    expect(screen.getByRole('heading', { name: 'Hemat akhir bulan' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Semua diskon/ })).toBeTruthy();
  });

  it('sends the story to the about page, with facts and stats only for what the shop filled in', () => {
    setup([{ id: 's', type: 'story', story: { title: 'Sejak 2019', text: 'Kami mulai kecil.' } }], {
      sections: { story_eyebrow: 'Cerita kami', story_cta: 'Kenali kami' },
      origin_city: 'Bandung',
      heroStats: [{ value: '10.000+', label: 'Pelanggan puas' }],
    });
    expect(screen.getByText('Cerita kami')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Kenali kami' }).getAttribute('href')).toBe('/tentang');
    expect(screen.getByRole('link', { name: /Dikirim dari Bandung/ }).getAttribute('href')).toBe('/tentang');
    expect(screen.queryByText('Jam operasional')).toBeNull();
    expect(screen.getByText('10.000+').closest('dd')).toBeTruthy();
    expect(screen.getByText('Pelanggan puas').closest('dt')).toBeTruthy();
  });

  it('maps the banner tone names to its two bands, and links the catalogue', () => {
    const { container } = setup([{ id: 'b', type: 'banner', banner: { text: 'Pesan hampers?', cta: 'Belanja', bg: 'pink' } }]);
    expect(container.querySelector('.pc-banner.is-deep')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Belanja' }).getAttribute('href')).toBe('/katalog');
    cleanup();
    const quiet = setup([{ id: 'b', type: 'banner', banner: { text: 'Halo', bg: 'butter' } }]);
    expect(quiet.container.querySelector('.pc-banner.is-mist')).toBeTruthy();
  });
});
