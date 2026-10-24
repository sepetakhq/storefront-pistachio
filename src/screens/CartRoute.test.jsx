import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { qtyLimits } from '@sepetakhq/storefront-kit/shared/qty';

afterEach(cleanup);

const calls = [];
let lines = [];
vi.mock('@sepetakhq/storefront-kit/config/ConfigProvider', () => ({
  useConfig: () => ({ freeShipping: false, freeShippingMin: 0 }),
}));
vi.mock('@sepetakhq/storefront-kit/cart/CartProvider', () => ({
  useCart: () => ({ isEmpty: false, setQty: (...a) => calls.push(['setQty', ...a]), remove: (k) => calls.push(['remove', k]) }),
}));
vi.mock('@sepetakhq/storefront-kit/cart/useCartLines', () => ({
  useCartLines: () => ({ lines, statuses: {}, subtotal: 0, isLoading: false, hasBlockers: false, preorderLeadDays: 0 }),
}));

const CartRoute = (await import('./CartRoute.jsx')).default;

function lineOf(product, qty) {
  return { key: product.id, item: { qty }, product, status: 'ok', available: 99000, limits: qtyLimits(product) };
}

function show(line) {
  lines = [line];
  calls.length = 0;
  render(
    <MemoryRouter>
      <CartRoute />
    </MemoryRouter>,
  );
}

const tomat = { id: 't', slug: 'tomat', name: 'Tomat', price: 20000, unit: 'kg', qty_step: 250, qty_min: 500 };
const apel = { id: 'a', slug: 'apel', name: 'Apel', price: 5000 };

describe('CartRoute quantity', () => {
  it('prints a weighed line in kg and steps it by qty_step', () => {
    show(lineOf(tomat, 1250));
    expect(screen.getByText('1,25 kg')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tambah jumlah' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kurangi jumlah' }));
    expect(calls).toEqual([['setQty', 't', 1500], ['setQty', 't', 1000]]);
  });

  it('removes a weighed line when minus goes below its minimum', () => {
    show(lineOf(tomat, 500));
    fireEvent.click(screen.getByRole('button', { name: 'Kurangi jumlah' }));
    expect(calls).toEqual([['remove', 't']]);
  });

  it('keeps pieces a bare number, one at a time', () => {
    show(lineOf(apel, 2));
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByText(/pcs/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tambah jumlah' }));
    expect(calls).toEqual([['setQty', 'a', 3]]);
  });
});
