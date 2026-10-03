import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Testing Library only registers its own cleanup when vitest runs with
// globals, which this project does not.
afterEach(cleanup);

// The rate list itself needs a QueryClient and a live endpoint; the failure
// panel needs neither, and the failure panel is what has been getting this
// wrong. Imported through the module under test so the export stays honest.
const { RateProblem, RateTile } = await import('./ShippingRates.jsx');

import { ApiError } from '@sepetakhq/storefront-kit/api/client';

const option = (extra) => ({
  quote_id: 'q1',
  courier_code: 'jntcargo',
  courier_service: 'REG',
  name: 'Reguler',
  cost: 12000,
  etd: '2-3 hari',
  ...extra,
});

// The storefront keeps no courier catalogue, so whatever the server sends is
// what the buyer reads. Before courier_name existed this printed the raw code,
// and a merchant saw "JNTCARGO" at checkout beside "J&T Cargo" in their own
// backoffice.
describe('RateTile', () => {
  it('names the courier the way the server does', () => {
    render(<RateTile option={option({ courier_name: 'J&T Cargo' })} onClick={() => {}} />);
    expect(screen.getByText(/J&T Cargo/)).toBeTruthy();
  });

  // A code outside the catalogue is a label the merchant typed under flat
  // pricing, so the row still has to render rather than go blank.
  it('falls back to the code when the server names no courier', () => {
    render(<RateTile option={option({ courier_name: '' })} onClick={() => {}} />);
    expect(screen.getByText(/JNTCARGO/)).toBeTruthy();
  });

  // The old code called .toUpperCase() unguarded, so a row missing its code
  // threw while rendering the whole rate list.
  it('does not throw when the option carries no courier code at all', () => {
    expect(() =>
      render(<RateTile option={option({ courier_code: undefined })} onClick={() => {}} />),
    ).not.toThrow();
  });
});

describe('RateProblem', () => {
  // The regression this file exists for.
  //
  // isNetwork is a getter returning a boolean, and the panel called it as
  // error?.isNetwork?.(). Optional call only short-circuits on null and
  // undefined, so on a real network failure this evaluated true?.() and threw
  // a TypeError while rendering -- the one screen whose job is to explain a
  // failure crashed exactly when a failure happened.
  it('renders a network failure instead of throwing', () => {
    const err = new ApiError(0, 'network', 'Koneksi bermasalah.');
    expect(err.isNetwork).toBe(true);

    render(<RateProblem error={err} onRetry={() => {}} onEdit={() => {}} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Ongkir belum bisa dihitung sekarang.')).toBeTruthy();
  });

  it('offers a retry for a provider outage', () => {
    const err = new ApiError(503, 'rates_unavailable', 'Ongkir belum bisa dihitung sekarang.');
    render(<RateProblem error={err} onRetry={() => {}} onEdit={() => {}} />);
    expect(screen.getByText('Hitung ulang')).toBeTruthy();
  });

  // A destination nobody serves cannot be fixed by waiting, so the panel has
  // to send the buyer back to the picker rather than offer a retry.
  it('sends the buyer back to the picker when no courier serves the place', () => {
    const err = new ApiError(409, 'no_routes', 'Belum ada kurir yang melayani tujuan ini.');
    render(<RateProblem error={err} onRetry={() => {}} onEdit={() => {}} />);
    expect(screen.getByText('Ganti tujuan')).toBeTruthy();
  });

  it('names the merchant when the product data is incomplete', () => {
    const err = new ApiError(409, 'shipping_unavailable', 'Ongkir belum bisa dihitung.');
    render(<RateProblem error={err} onRetry={() => {}} onEdit={() => {}} />);
    expect(screen.getByText('Ongkir untuk produk ini belum bisa dihitung.')).toBeTruthy();
  });

  // A shop that spent its monthly live rate checks: no retry, and the
  // server's own message, which tells the buyer to contact the seller.
  it('says the rate checks are used up without offering a retry', () => {
    const msg = 'Ongkir otomatis toko ini sedang tidak tersedia. Hubungi penjual untuk melanjutkan pesanan.';
    const err = new ApiError(409, 'rate_checks_exhausted', msg);
    render(<RateProblem error={err} onRetry={() => {}} onEdit={() => {}} />);
    expect(screen.getByText('Ongkir otomatis sedang tidak tersedia.')).toBeTruthy();
    expect(screen.getByText(msg)).toBeTruthy();
    expect(screen.queryByText('Hitung ulang')).toBeNull();
  });

  it('treats an empty courier list as retryable', () => {
    // options.length === 0 renders this panel with error=null.
    render(<RateProblem error={null} onRetry={() => {}} onEdit={() => {}} />);
    expect(screen.getByText('Hitung ulang')).toBeTruthy();
  });
});
