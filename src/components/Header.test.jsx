import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const config = { brand: { nav: [] } };
vi.mock('@sepetakhq/storefront-kit/config/ConfigProvider', () => ({ useConfig: () => config }));
const cart = { count: 0 };
vi.mock('@sepetakhq/storefront-kit/cart/CartProvider', () => ({ useCart: () => cart }));

const { DrawerProvider, useDrawer } = await import('./CartDrawer.jsx');
const Header = (await import('./Header.jsx')).default;

afterEach(() => {
  cleanup();
  document.body.removeAttribute('data-menu');
});

const NAV = [
  { route: 'home', path: '/', label: 'Beranda' },
  { route: 'catalog', path: '/katalog', label: 'Belanja' },
];

function Where() {
  const { pathname, search } = useLocation();
  const { open } = useDrawer();
  return <output data-testid="where">{pathname + search + (open ? ' drawer' : '')}</output>;
}

function setup({ nav = NAV, count = 0, at = '/' } = {}) {
  config.brand = { nav, wordmark_primary: 'Toko', wordmark_accent: 'Contoh' };
  config.tenant = { name: 'Toko Contoh' };
  cart.count = count;
  return render(
    <MemoryRouter initialEntries={[at]}>
      <DrawerProvider>
        <Header />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </DrawerProvider>
    </MemoryRouter>,
  );
}

const menuButton = () => screen.getByRole('button', { name: /menu/i });
const cartButton = () => screen.getByRole('button', { name: /^Keranjang/ });

describe('Header', () => {
  it('shows the wordmark, the merchant nav and the cart count', () => {
    setup({ count: 3 });
    expect(screen.getByText('Toko')).toBeTruthy();
    expect(screen.getByText('Contoh')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Belanja' }).getAttribute('href')).toBe('/katalog');
    expect(cartButton().getAttribute('aria-label')).toBe('Keranjang, 3 barang');
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('draws no count bubble on an empty cart and caps a big one', () => {
    setup({ count: 0 });
    expect(cartButton().textContent).toBe('');
    cleanup();
    setup({ count: 120 });
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('opens the cart drawer from the cart button', () => {
    setup({ count: 1 });
    fireEvent.click(cartButton());
    expect(screen.getByTestId('where').textContent).toBe('/ drawer');
  });

  it('opens the menu panel, reports it, and locks the page behind it', () => {
    setup();
    expect(menuButton().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(menuButton());
    expect(menuButton().getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('pc-menu')).toBeTruthy();
    expect(document.body.getAttribute('data-menu')).toBe('1');
  });

  it('closes on Escape and on a tap outside the header', () => {
    setup();
    fireEvent.click(menuButton());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.getElementById('pc-menu')).toBeNull();
    expect(document.body.getAttribute('data-menu')).toBeNull();

    fireEvent.click(menuButton());
    fireEvent.mouseDown(screen.getByTestId('where'));
    expect(document.getElementById('pc-menu')).toBeNull();
  });

  it('always offers order tracking in the menu, once', () => {
    setup();
    fireEvent.click(menuButton());
    const panel = document.getElementById('pc-menu');
    expect([...panel.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '/lacak')).toHaveLength(1);

    cleanup();
    setup({ nav: [...NAV, { route: 'track', path: '/lacak', label: 'Lacak Pesanan' }] });
    fireEvent.click(menuButton());
    const again = document.getElementById('pc-menu');
    expect([...again.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '/lacak')).toHaveLength(1);
  });

  it('searches the catalogue, trimmed, and closes the bar on the way', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cari produk' }));
    const input = document.querySelector('#pc-search input');
    fireEvent.change(input, { target: { value: '  almond  ' } });
    fireEvent.submit(input.closest('form'));
    expect(screen.getByTestId('where').textContent).toBe('/katalog?q=almond');
    expect(document.getElementById('pc-search')).toBeNull();
  });
});
