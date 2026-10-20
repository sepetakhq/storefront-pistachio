import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

const state = { order: null };
vi.mock('@sepetakhq/storefront-kit/hooks/queries', () => ({
  useOrder: () => ({ data: { order: state.order, payment: null }, isPending: false, isError: false }),
}));
vi.mock('@sepetakhq/storefront-kit/config/ConfigProvider', () => ({
  useConfig: () => ({ couriers: [], brand: {}, payment: {} }),
}));
vi.mock('@sepetakhq/storefront-kit/ui/ToastProvider', () => ({ useToast: () => () => {} }));

const { default: OrderRoute } = await import('./OrderRoute.jsx');

const POINTS_USED = 'Poin (20)';
const EARNED = '+18 poin';

const base = {
  id: 'o1', number: 'MB-261020-0001', status: 'completed', status_label: 'Selesai', timeline: [],
  customer_name: 'Rani', contact_masked: 'r***@x', city: 'Bandung', courier_code: 'jne',
  payment_method: 'QRIS', subtotal: 20000, shipping_cost: 0, shipping_discount: 0,
  discount_total: 0, payment_fee: 0, unique_code: 0, total: 20000,
  placed_at: '2026-10-20T00:00:00Z', preorder_lead_days: 0, lines: [],
};

function draw(order) {
  state.order = { ...base, ...order };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/t/abc']}>
        <Routes>
          <Route path="/t/:token" element={<OrderRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// The footer still adds up when points paid part of it, and the buyer reads
// what the order earned.
describe('OrderRoute: loyalty points', () => {
  it('shows points apart from the promotion, and what the order earned', () => {
    draw({ discount_total: 5000, points_used: 20, points_discount: 2000, points_earned: 18, total: 15000 });
    expect(screen.getByText('−Rp 3.000')).toBeTruthy();
    expect(screen.getByText(POINTS_USED)).toBeTruthy();
    expect(screen.getByText('−Rp 2.000')).toBeTruthy();
    expect(screen.getByText(EARNED)).toBeTruthy();
  });

  it('says nothing about points on an order without any', () => {
    draw({});
    expect(screen.queryByText(/Poin|Points/)).toBeNull();
  });
});
