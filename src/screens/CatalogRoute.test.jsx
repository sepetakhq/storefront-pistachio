import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls = [];
const products = { pages: [{ products: [] }] };
vi.mock('@sepetakhq/storefront-kit/hooks/queries', () => ({
  useCategories: () => ({ data: [{ key: 'wajah', label: 'Perawatan Wajah', subtitle: 'Serum & pelembap' }], isError: false }),
  useProducts: (params) => {
    calls.push(params);
    return { data: products, isPending: false, isError: false, hasNextPage: false };
  },
}));
// The shop's labels, and the config's substitution: free shipping off withholds
// a sentence naming its threshold, as the real provider does.
const config = { brand: { sections: {} }, copy: (t) => (String(t).includes('{free_shipping_min}') ? '' : t) };
vi.mock('@sepetakhq/storefront-kit/config/ConfigProvider', () => ({ useConfig: () => config }));
vi.mock('@sepetakhq/storefront-kit/cart/CartProvider', () => ({ useCart: () => ({ items: [] }) }));
vi.mock('@sepetakhq/storefront-kit/ui/ToastProvider', () => ({ useToast: () => vi.fn() }));

const CatalogRoute = (await import('./CatalogRoute.jsx')).default;

beforeEach(() => {
  config.brand.sections = {};
  calls.length = 0;
  products.pages = [{ products: [] }];
});
afterEach(cleanup);

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function open(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/katalog"
          element={
            <>
              <CatalogRoute />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const last = () => calls[calls.length - 1];

describe('CatalogRoute', () => {
  it('asks the API for the sale list rather than filtering a page', () => {
    open('/katalog?sale=1');
    expect(last()).toMatchObject({ on_sale: 1 });
    expect(screen.getByRole('heading', { level: 1, name: 'Promo' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Promo' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('Belum ada promo saat ini')).toBeTruthy();
  });

  it('sends no sale filter otherwise, and passes category, search and sort through', () => {
    open('/katalog?cat=wajah&sort=priceAsc');
    expect(last().on_sale).toBeUndefined();
    expect(last()).toMatchObject({ cat: 'wajah', sort: 'priceAsc' });
    expect(screen.getByRole('heading', { level: 1, name: 'Perawatan Wajah' })).toBeTruthy();
    expect(screen.getByText('Serum & pelembap')).toBeTruthy();
  });

  it('falls back to the default sort for one the API does not know', () => {
    open('/katalog?sort=diskon');
    expect(last().sort).toBe('featured');
  });

  it('titles a search and explains an empty one', () => {
    open('/katalog?q=durian');
    expect(last().q).toBe('durian');
    expect(screen.getByRole('heading', { level: 1, name: 'Hasil untuk “durian”' })).toBeTruthy();
    expect(screen.getByText(/Tidak ada produk bernama “durian”/)).toBeTruthy();
  });

  it('keeps the sort when a chip changes the filter, and clears filters but not the sort', () => {
    open('/katalog?cat=wajah&sort=priceDesc');
    expect(screen.getByRole('link', { name: 'Semua' }).getAttribute('href')).toBe('/katalog?sort=priceDesc');
    expect(screen.getByRole('link', { name: /Hapus filter/ }).getAttribute('href')).toBe('/katalog?sort=priceDesc');
  });

  it('writes a sort change into the URL and drops the default', () => {
    open('/katalog?cat=wajah');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nameAsc' } });
    expect(screen.getByTestId('where').textContent).toBe('/katalog?cat=wajah&sort=nameAsc');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'featured' } });
    expect(screen.getByTestId('where').textContent).toBe('/katalog?cat=wajah');
  });

  it('counts what it shows', () => {
    products.pages = [{ products: [{ id: 'p', slug: 'a', name: 'Serum', price: 1, stock: 9, availability: 'available' }] }];
    open('/katalog');
    expect(screen.getByText('1 produk')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Hapus filter/ })).toBeNull();
  });

  it('titles the promo page and its chip with the shop\'s own words', () => {
    config.brand.sections = { promo_title: 'Diskon Spesial', promo_subtitle: 'Hanya minggu ini' };
    open('/katalog?sale=1');
    expect(screen.getByRole('heading', { level: 1, name: 'Diskon Spesial' })).toBeTruthy();
    expect(screen.getByText('Hanya minggu ini')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Diskon Spesial' }).getAttribute('aria-current')).toBe('true');
  });

  it('falls back when the subtitle is withheld or blank', () => {
    config.brand.sections = { promo_title: '   ', promo_subtitle: 'Gratis ongkir min. {free_shipping_min}' };
    open('/katalog?sale=1');
    expect(screen.getByRole('heading', { level: 1, name: 'Promo' })).toBeTruthy();
    expect(screen.getByText('Produk yang sedang diskon')).toBeTruthy();
  });
});
