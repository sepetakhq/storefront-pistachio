import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getShippingRates } from '@sepetakhq/storefront-kit/api/endpoints';
import { qk } from '@sepetakhq/storefront-kit/api/queryKeys';
import { useConfig } from '@sepetakhq/storefront-kit/config/ConfigProvider';
import { fmt } from '@sepetakhq/storefront-kit/shared/format';
import { defaultOption, destinationLines, isStillOffered, splitEtd, weightInKg } from '@sepetakhq/storefront-kit/lib/shipping';

// The live rate list.
//
// The header is the point of the whole screen. A flat rate never showed the
// buyer anything about *why* it cost what it cost; a real quote is a route and
// a weight, so the route and the weight are what this leads with. Everything
// below it is a consequence of that line.

const rule = { border: 0, borderTop: '1px solid var(--pc-line)', margin: '14px 0' };

const serif = { fontFamily: 'var(--pc-display)' };

export default function ShippingRates({ destination, items, selected, onSelect, onRetry }) {
  const { brand, freeShippingMin } = useConfig();

  // Keyed on the destination and the cart together. Both change the answer,
  // and serving a stale list would show a price the draft step then refuses.
  const cartKey = items.map((i) => `${i.product_id}:${i.variant_id ?? ''}:${i.qty}`).sort().join('|');

  const rates = useQuery({
    queryKey: qk.rates(destination?.ref ?? '', cartKey),
    queryFn: ({ signal }) =>
      getShippingRates(
        {
          destination_ref: destination.ref,
          destination_label: destination.label,
          items,
        },
        signal,
      ),
    enabled: Boolean(destination?.ref) && items.length > 0,
    // Quoting spends the merchant's daily budget, so a remount must not
    // re-ask. The server's own cache would answer anyway; this avoids the
    // round trip entirely.
    staleTime: 10 * 60_000,
    retry: false,
  });

  const options = rates.data?.options ?? [];

  // Land on the cheapest once the list arrives, and re-pick when a choice
  // stops being offered — a quote from the previous cart would be refused at
  // the draft step, and finding that out one screen later is the worst place.
  useEffect(() => {
    if (options.length === 0) return;
    if (isStillOffered(options, selected)) return;
    onSelect(defaultOption(options));
  }, [options, selected, onSelect]);

  if (!destination) {
    return (
      <p style={{ fontSize: 13.5, color: 'var(--pc-body)', margin: 0 }}>
        Pilih tujuan pengiriman di atas untuk melihat ongkir.
      </p>
    );
  }

  const { primary } = destinationLines(destination);
  const kg = weightInKg(rates.data?.weight_grams);
  const free = Boolean(rates.data?.free_shipping) || false;

  return (
    <div>
      {/* The signature line: origin, destination, and the weight they are
          billed at. This is the information a flat rate hid. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ ...serif, fontSize: 21, color: 'var(--pc-ink)', lineHeight: 1.25 }}>
          {brand.origin_city || 'Toko'}
          <span style={{ color: 'var(--pc-green)', padding: '0 6px' }}>→</span>
          {primary}
        </span>
        {kg ? (
          <span style={{ fontSize: 12.5, color: 'var(--pc-muted-2)', letterSpacing: 0.3 }}>
            ditagih {kg} kg
          </span>
        ) : null}
      </div>
      <hr style={rule} />

      {rates.isPending ? (
        <RateSkeleton />
      ) : rates.isError ? (
        <RateProblem error={rates.error} onRetry={() => rates.refetch()} onEdit={onRetry} />
      ) : options.length === 0 ? (
        <RateProblem error={null} onRetry={() => rates.refetch()} onEdit={onRetry} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {options.map((o) => (
            <RateTile
              key={o.quote_id}
              option={o}
              free={free}
              selected={selected === o.quote_id}
              onClick={() => onSelect(o)}
            />
          ))}
          {free ? (
            <p style={{ fontSize: 12.5, color: 'var(--pc-body)', margin: '2px 0 0' }}>
              Belanjaanmu sudah melewati {fmt(freeShippingMin)}, jadi ongkirnya gratis. Pilih
              layanan yang kamu mau.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * One service.
 *
 * The estimate leads, as a numeral in the display face, because speed is what
 * a buyer is actually choosing between here — the prices differ by a few
 * thousand rupiah and the delivery times differ by days. The cost is
 * right-aligned in the body face, where a number is read rather than compared.
 */
// Exported for the same reason RateProblem is: the row can be rendered on its
// own, and how a courier is named is worth asserting without a live endpoint.
export function RateTile({ option, free, selected, onClick }) {
  const { value, unit } = splitEtd(option.etd);

  return (
    <button
      type="button"
      className="hv-card"
      aria-pressed={selected}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        textAlign: 'left',
        border: `${selected ? 2 : 1}px solid ${selected ? 'var(--pc-green)' : 'var(--pc-line)'}`,
        borderRadius: 12,
        padding: selected ? '13px 15px' : '14px 16px',
        background: selected ? 'var(--pc-mist)' : 'var(--pc-white)',
        cursor: 'pointer',
      }}
    >
      <span style={{ minWidth: 54, textAlign: 'center' }}>
        {value ? (
          <>
            <span style={{ ...serif, display: 'block', fontSize: 26, lineHeight: 1, color: 'var(--pc-ink)' }}>
              {value}
            </span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--pc-muted)', letterSpacing: 0.4 }}>
              {unit || 'hari'}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--pc-muted)' }}>{unit || '—'}</span>
        )}
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: 'var(--pc-ink)' }}>
          {option.name}
        </span>
        {/* The server names the courier from its own catalogue; the code is
            the fallback for one it does not carry, which under flat pricing is
            a label the merchant typed. Rendering the code alone is how buyers
            came to read "JNTCARGO" while the backoffice said "J&T Cargo". */}
        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--pc-body)' }}>
          {option.courier_name || (option.courier_code ?? '').toUpperCase()} ·{' '}
          {option.courier_service}
        </span>
      </span>

      <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {free ? (
          <>
            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: 'var(--pc-ink)' }}>
              Gratis
            </span>
            <span
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--pc-muted)',
                textDecoration: 'line-through',
              }}
            >
              {fmt(option.cost)}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--pc-ink)' }}>{fmt(option.cost)}</span>
        )}
      </span>
    </button>
  );
}

/**
 * What to say when there is no list.
 *
 * The distinction that matters is whether waiting helps. An exhausted daily
 * quota or a provider outage clears on its own, and this platform blocks
 * rather than charging a rate the buyer was never shown — so the retry is the
 * whole interaction. A route nobody serves, or a product with no weight, will
 * read the same tomorrow, and offering a button there would leave the buyer
 * pressing it forever.
 */
export function RateProblem({ error, onRetry, onEdit }) {
  const status = error?.status;
  const code = error?.code;

  // isNetwork is a getter, not a method. Called as error?.isNetwork?.() it
  // evaluated `true?.()` on an actual network failure and threw a TypeError
  // while rendering the error panel -- so the one path that exists to explain
  // a failure crashed exactly when it was needed.
  const retryable = !error || status === 503 || status >= 500 || error?.isNetwork;
  const heading = retryable
    ? 'Ongkir belum bisa dihitung sekarang.'
    : code === 'shipping_unavailable'
      ? 'Ongkir untuk produk ini belum bisa dihitung.'
      : 'Belum ada kurir yang melayani tujuan ini.';
  const body = retryable
    ? 'Coba lagi sebentar lagi.'
    : code === 'shipping_unavailable'
      ? 'Hubungi penjual ya — datanya belum lengkap.'
      : 'Coba pilih kecamatan lain yang berdekatan.';

  return (
    <div
      role="alert"
      style={{
        border: '1px solid var(--pc-mist)',
        background: 'var(--pc-mist)',
        borderRadius: 12,
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        flexWrap: 'wrap',
      }}
    >
      <span>
        <span style={{ display: 'block', fontSize: 14.5, color: 'var(--pc-ink)', fontWeight: 700 }}>
          {heading}
        </span>
        <span style={{ display: 'block', fontSize: 13, color: 'var(--pc-body)', marginTop: 2 }}>
          {body}
        </span>
      </span>
      <button
        type="button"
        className="hv-pink"
        onClick={retryable ? onRetry : onEdit}
        style={{
          border: '1px solid var(--pc-green)',
          background: 'var(--pc-green)',
          color: 'var(--pc-white)',
          borderRadius: 8,
          padding: '9px 18px',
          fontSize: 13.5,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {retryable ? 'Hitung ulang' : 'Ganti tujuan'}
      </button>
    </div>
  );
}

function RateSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 10 }} aria-busy="true">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="la-shimmer"
          style={{ height: 68, borderRadius: 12, background: 'var(--pc-tint)' }}
        />
      ))}
    </div>
  );
}
