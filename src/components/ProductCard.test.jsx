import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The cart and the toast are mocked so the card's decisions are what is
// asserted, not the provider plumbing the kit already tests.
const cart = { items: [], add: vi.fn(), setQty: vi.fn(), remove: vi.fn() };
vi.mock('@sepetakhq/storefront-kit/cart/CartProvider', () => ({ useCart: () => cart }));
// The kit's useToast returns the show function itself; mocking it as an
// object is how a card that threw on every quick-add once passed here.
const toast = { showToast: vi.fn() };
vi.mock('@sepetakhq/storefront-kit/ui/ToastProvider', () => ({ useToast: () => toast.showToast }));

const ProductCard = (await import('./ProductCard.jsx')).default;

afterEach(cleanup);
beforeEach(() => {
  cart.items = [];
  cart.add.mockClear();
  cart.setQty.mockClear();
  cart.remove.mockClear();
});

function product(over) {
  return {
    id: 'p1',
    slug: 'almond-panggang',
    name: 'Almond Panggang',
    category_key: 'kacang',
    category_label: 'Kacang & Biji',
    image: '',
    image_srcset: '',
    price: 132300,
    compare_at_price: 189000,
    on_sale: true,
    stock: 24,
    availability: 'available',
    ...over,
  };
}

function card(p) {
  return render(
    <MemoryRouter>
      <ProductCard p={p} />
    </MemoryRouter>,
  );
}

describe('ProductCard', () => {
  it('shows the discount, the strike-through, the category and initials when there is no photo', () => {
    card(product());
    expect(screen.getByText('-30%')).toBeTruthy();
    expect(screen.getByText('Rp 189.000').tagName).toBe('S');
    expect(screen.getByText('Kacang & Biji')).toBeTruthy();
    expect(screen.getByText('AP')).toBeTruthy();
    // A healthy stock says nothing.
    expect(screen.queryByText(/Sisa/)).toBeNull();
  });

  it('shows the merchant badge beside the discount', () => {
    card(product({ badge: 'Terlaris' }));
    expect(screen.getByText('Terlaris')).toBeTruthy();
  });

  it('says nothing about a discount it cannot compute', () => {
    card(product({ compare_at_price: 0 }));
    expect(screen.queryByText(/^-\d+%$/)).toBeNull();
    expect(screen.queryByText('Rp 0')).toBeNull();
  });

  it('warns on a low counted stock', () => {
    card(product({ stock: 4 }));
    expect(screen.getByText('Sisa 4 lagi')).toBeTruthy();
  });

  it('adds one and confirms, then becomes a stepper', () => {
    const p = product();
    card(p);
    fireEvent.click(screen.getByRole('button', { name: /^Tambah .+ ke keranjang$/ }));
    expect(cart.add).toHaveBeenCalledWith(p, 1, null);
    expect(toast.showToast).toHaveBeenCalled();

    cleanup();
    cart.items = [{ productId: 'p1', variantId: null, qty: 2 }];
    card(p);
    expect(screen.getByRole('group', { name: /Jumlah/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    expect(cart.setQty).toHaveBeenCalledWith('p1:', 3);
    fireEvent.click(screen.getByRole('button', { name: 'Kurangi' }));
    expect(cart.setQty).toHaveBeenCalledWith('p1:', 1);
  });

  it('removes the line when stepping down from one, and caps + at the stock', () => {
    cart.items = [{ productId: 'p1', variantId: null, qty: 1 }];
    card(product({ stock: 1 }));
    expect(screen.getByRole('button', { name: 'Tambah' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Kurangi' }));
    expect(cart.remove).toHaveBeenCalledWith('p1:');
  });

  it('steps a weighed line by qty_step and prints it in kg', () => {
    cart.items = [{ productId: 'p1', variantId: null, qty: 500 }];
    card(product({ unit: 'kg', qty_step: 250, qty_min: 500, stock: 5000 }));
    expect(screen.getByText('0,5 kg')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));
    expect(cart.setQty).toHaveBeenCalledWith('p1:', 750);
    fireEvent.click(screen.getByRole('button', { name: 'Kurangi' }));
    expect(cart.remove).toHaveBeenCalledWith('p1:');
  });

  it('sends a variant product to its page instead of adding', () => {
    card(product({ has_variants: true, price_max: 249000 }));
    const link = screen.getByRole('link', { name: 'Pilih varian' });
    expect(link.getAttribute('href')).toBe('/produk/almond-panggang');
    expect(screen.getByText('mulai')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Tambah/ })).toBeNull();
  });

  it('disables with the reason, and veils the picture, for sold out, scheduled and ended', () => {
    card(product({ sold_out: true, availability: 'sold_out' }));
    expect(screen.getByRole('button', { name: 'Stok habis' }).disabled).toBe(true);
    expect(screen.getAllByText('Stok habis').length).toBe(2);
    cleanup();
    card(product({ availability: 'ended' }));
    expect(screen.getByRole('button', { name: 'Penjualan ditutup' }).disabled).toBe(true);
    cleanup();
    card(product({ availability: 'scheduled', sell_from: '2030-01-01T00:00:00Z' }));
    expect(screen.getByRole('button', { name: /Dibuka/ }).disabled).toBe(true);
    expect(screen.getByText(/^Buka /)).toBeTruthy();
  });

  it('a variant product with every variant gone cannot be picked either', () => {
    card(product({ has_variants: true, sold_out: true, availability: 'sold_out' }));
    expect(screen.queryByRole('link', { name: 'Pilih varian' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Stok habis' }).disabled).toBe(true);
  });

  it('marks a pre-order in the note and on the button', () => {
    card(product({ preorder: true, preorder_lead_days: 5 }));
    expect(screen.getByText('Pre-order · ±5 hari setelah pembayaran')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Pre-order .+ ke keranjang$/ })).toBeTruthy();
    cleanup();
    card(product({ unlimited_stock: true, stock: 0 }));
    expect(screen.getByRole('button', { name: /^Tambah .+ ke keranjang$/ }).disabled).toBe(false);
  });

  it('never shows a variant line quantity on a variant-less card', () => {
    cart.items = [{ productId: 'p1', variantId: 'v9', qty: 4 }];
    card(product());
    expect(screen.getByRole('button', { name: /^Tambah .+ ke keranjang$/ })).toBeTruthy();
  });
});
