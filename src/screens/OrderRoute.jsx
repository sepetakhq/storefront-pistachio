import { Suspense, lazy, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';

import { Img, SIZES } from '../ui/Img.jsx';
import QrImage from '../ui/QrImage.jsx';
import { CountdownClock } from '../ui/Countdown.jsx';
import { EmptyState, ErrorState, Skeleton } from '../ui/states.jsx';
import { useOrder } from '@sepetakhq/storefront-kit/hooks/queries';
import { useConfig } from '@sepetakhq/storefront-kit/config/ConfigProvider';
import { Tile } from '../components/Tile.jsx';
import { courierName } from '../lib/copy.js';
import { serverNow } from '@sepetakhq/storefront-kit/api/client';
import { fmt, fmtDate, fmtDateTime } from '@sepetakhq/storefront-kit/shared/format';
import { claimPayment, reopenPayment } from '@sepetakhq/storefront-kit/api/endpoints';
import { qk } from '@sepetakhq/storefront-kit/api/queryKeys';
import {
  PAY_DEAD,
  canClaimPayment,
  isDisplayableImageURL,
  isManualPayment,
  isQrImageURL,
  isQrisPayload,
  isUsableRedirect,
  paymentState,
  splitUniqueCode,
} from '@sepetakhq/storefront-kit/lib/payment';
import { useToast } from '@sepetakhq/storefront-kit/ui/ToastProvider';
import { orderMessage, waLink } from '@sepetakhq/storefront-kit/lib/whatsapp';

// QrCode is lazy because it pulls in an encoder; QrImage is not, because it
// has nothing to pull in and deferring it would only delay the image request.
const QrCode = lazy(() => import('../ui/QrCode.jsx'));

const card = { background: 'var(--pc-white)', border: '1px solid var(--pc-line)', borderRadius: 12, padding: 22 };

// Six statuses, not the prototype's four.
const STATUS_TONE = {
  awaiting_payment: { bg: 'var(--pc-tint)', fg: 'var(--pc-note)' },
  processing: { bg: 'var(--pc-mist)', fg: 'var(--pc-green)' },
  shipped: { bg: 'var(--pc-mist)', fg: 'var(--pc-green)' },
  completed: { bg: 'var(--pc-mist)', fg: 'var(--pc-green)' },
  cancelled: { bg: 'var(--pc-soft)', fg: 'var(--pc-body)' },
  expired: { bg: 'var(--pc-soft)', fg: 'var(--pc-body)' },
};

export default function OrderRoute() {
  const { token } = useParams();
  const location = useLocation();
  const justPlaced = Boolean(location.state?.justPlaced);
  const tokenAtRisk = Boolean(location.state?.tokenAtRisk);

  const { data, isPending, isError, error, refetch } = useOrder(token, { poll: true });
  const { couriers } = useConfig();

  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => reopenPayment(token),
    // Not optimistic. There is no plausible placeholder for a QR code, and a
    // rollback would flicker the panel between two failure messages.
    onSuccess: (payment) => {
      queryClient.setQueryData(qk.track(token), (prev) => (prev ? { ...prev, payment } : prev));
    },
    // Every refusal the server can give means the page is looking at stale
    // state — already paid, already expired, order moved on. Re-read rather
    // than guess which.
    onError: (err) => {
      if (err?.status === 409) refetch();
    },
  });

  // The claim writes the whole pair back, not half of it: what changes is the
  // order — its claim time and its deadline — and patching only the payment
  // would leave the panel still offering the button it just consumed.
  const claim = useMutation({
    mutationFn: () => claimPayment(token),
    onSuccess: (next) => {
      if (next?.order) queryClient.setQueryData(qk.track(token), next);
    },
    // Every refusal means this page is looking at stale state: already paid,
    // already expired, or moved on by the shop. Re-read rather than guess.
    onError: (err) => {
      if (err?.status === 409) refetch();
    },
  });

  if (isPending) return <OrderSkeleton />;

  if (isError) {
    // An unknown, malformed or wrong-case token is an ordinary 404 — the API
    // deliberately makes a nonexistent order indistinguishable from a bad token.
    if (error?.status === 404) {
      return (
        <main style={{ flex: 1, padding: '60px 20px' }}>
          <EmptyState
            title="Pesanan tidak ditemukan"
            body="Tautan lacak ini tidak cocok dengan pesanan mana pun. Periksa kembali tautan di email konfirmasimu."
            action={
              <Link to="/lacak" className="hv-dark" style={darkButton}>
                Cari pesanan
              </Link>
            }
          />
        </main>
      );
    }
    return (
      <main style={{ flex: 1, padding: '60px 20px' }}>
        <ErrorState error={error} onRetry={refetch} title="Pesanan gagal dimuat" />
      </main>
    );
  }

  const { order, payment } = data;
  const courier = courierName(couriers, order.courier_code);
  const awaiting = order.status === 'awaiting_payment';

  return (
    <main
      aria-label="Pesanan"
      style={{ flex: 1, maxWidth: 720, margin: '0 auto', padding: '36px 20px 60px', width: '100%' }}
    >
      {justPlaced ? <PlacedBanner order={order} tokenAtRisk={tokenAtRisk} token={token} /> : null}

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'var(--pc-display)', fontSize: 'clamp(28px, 3.2vw, 38px)', fontWeight: 700, margin: 0 }}>
          {order.number}
        </h1>
        <StatusPill status={order.status} label={order.status_label} />
      </div>
      <p style={{ color: 'var(--pc-body)', fontSize: 13.5, margin: '6px 0 0' }}>
        Dipesan {fmtDateTime(order.placed_at)} · {order.customer_name} · {order.city}
      </p>
      {/* The one place a real date appears, because it is the one place the
          server has frozen one. Before payment there is only a duration: the
          clock starts when the money lands. */}
      {order.preorder_lead_days > 0 ? (
        <p style={{ color: 'var(--pc-note)', fontSize: 13.5, fontWeight: 600, margin: '6px 0 0' }}>
          {order.preorder_ship_estimate
            ? `Perkiraan siap kirim: ${fmtDate(order.preorder_ship_estimate)}`
            : `Pesanan pre-order · perkiraan siap kirim ±${order.preorder_lead_days} hari setelah pembayaran diterima`}
        </p>
      ) : null}
      <div style={{ height: 24 }} />

      {awaiting ? (
        <PaymentPanel
          order={order}
          payment={payment}
          onRefresh={refetch}
          onRetry={retry.mutate}
          retrying={retry.isPending}
          retryError={retry.error}
          onClaim={claim.mutate}
          claiming={claim.isPending}
          claimError={claim.error}
        />
      ) : null}

      <Timeline order={order} />

      <section style={{ ...card, marginTop: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Rincian</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {order.lines.map((l, i) => (
            <div key={`${l.name}-${i}`} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 44, flexShrink: 0 }}>
                <Img
                  src={l.image}
                  srcSet={l.image_srcset}
                  sizes={SIZES.summaryLine}
                  alt={l.name}
                  ratio="1/1"
                  radius={8}
                  fallback={<Tile label={l.name} size={14} />}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                <div style={{ fontWeight: 600 }}>{l.name}</div>
                {l.variant_label ? (
                  <div style={{ color: 'var(--pc-ink)', fontSize: 13 }}>{l.variant_label}</div>
                ) : null}
                <div style={{ color: 'var(--pc-body)', fontSize: 13 }}>
                  {fmt(l.unit_price)} × {l.qty}
                </div>
              </div>
              <strong style={{ fontSize: 14 }}>{fmt(l.line_total)}</strong>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--pc-line)', marginTop: 16, paddingTop: 14, display: 'grid', gap: 8 }}>
          <Row label="Subtotal" value={fmt(order.subtotal)} />
          {/*
            The footer has to add up, so an order placed with a cart promotion
            shows what came off. Both rows appear only when there is something
            to say, which for most orders is neither.
          */}
          {order.discount_total > 0 ? (
            <Row
              // The code wins the label when there was one. It is the part of
              // the discount the buyer chose and typed, and the only part they
              // would recognise weeks later on a paid order.
              label={
                order.voucher_code
                  ? `Kode ${order.voucher_code}`
                  : order.promotion_name
                    ? `Diskon · ${order.promotion_name}`
                    : 'Diskon'
              }
              value={`−${fmt(order.discount_total)}`}
            />
          ) : null}
          <Row
            label={
              order.shipping_promotion_name
                ? `Ongkir · ${courier} · ${order.shipping_promotion_name}`
                : `Ongkir · ${courier}`
            }
            // Net, on one row: the buyer does not care what the courier
            // charges us, and free-by-threshold and free-by-promotion are the
            // same thing to them. The promotion's name on the label is what
            // keeps the "why".
            value={
              order.shipping_cost - order.shipping_discount === 0
                ? 'Gratis'
                : fmt(order.shipping_cost - order.shipping_discount)
            }
          />
          {/*
            The same row the confirmation screen showed, from the order's own
            frozen copy — so a buyer comparing the two sees the same number
            even if the rate has moved since. Absent when the shop absorbed it.
          */}
          {order.payment_fee > 0 ? (
            <Row label="Biaya admin" value={fmt(order.payment_fee)} />
          ) : null}
          {/*
            Its own row, because without it the parts do not reach the total
            and the footer reads as an arithmetic error. Named rather than
            folded into the price: these three rupiah are what tell the shop
            which transfer was yours, and a buyer who understands that is a
            buyer who does not round them off.
          */}
          {order.unique_code > 0 ? (
            <Row label="Kode unik" value={fmt(order.unique_code)} />
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 700 }}>
            <span>Total</span>
            <span style={{ color: 'var(--pc-green)' }}>{fmt(order.total)}</span>
          </div>
        </div>
        {order.awb ? (
          <div style={{ marginTop: 16, fontSize: 14 }}>
            Nomor resi <strong>{order.awb}</strong> · {courier}
          </div>
        ) : null}
      </section>
    </main>
  );
}

/**
 * Payment instructions.
 *
 * There is no push and no public payment-status endpoint, so this screen
 * learns about a successful payment only by polling the order. `useOrder`
 * owns that; this component owns what the buyer does in the meantime.
 */
// Exported for PaymentPanel.test.jsx, which holds it to the contract that
// every kind the backend can emit renders something a buyer can act on. That
// seam is where a URL stored as a QR payload went unnoticed: both sides were
// correct on their own terms and only disagreed when rendered.
export function PaymentPanel({
  order,
  payment,
  onRefresh,
  onRetry,
  retrying,
  retryError,
  onClaim,
  claiming,
  claimError,
}) {
  const { brand, payment: payConfig } = useConfig();
  const showToast = useToast();
  const [pastDeadline, setPastDeadline] = useState(
    () => Boolean(order.expires_at) && serverNow() > Date.parse(order.expires_at),
  );

  // Past the deadline the worker sweeps once a minute, so the order still
  // reads awaiting_payment for up to a minute. Saying "expired" here would be
  // a lie to anyone whose payment landed seconds before the deadline.
  if (pastDeadline) {
    return (
      <section style={{ ...card, marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Waktu pembayaran habis</div>
        <p style={{ fontSize: 14, color: 'var(--pc-body)', lineHeight: 1.7, margin: '8px 0 0' }}>
          Sedang memeriksa status terakhir pesananmu…
        </p>
        <span className="la-shimmer" style={{ display: 'block', height: 4, borderRadius: 999, marginTop: 16 }} />
      </section>
    );
  }

  // One panel for what used to be two.
  //
  // A charge that dies at checkout returns no payment object at all; one that
  // dies later returns a row with every payload column empty. Same failure,
  // and it used to produce two different sentences — the second of which told
  // the buyer the method was switched off, on a live method, on an order they
  // could still pay.
  //
  // Below pastDeadline on purpose: past the deadline "waktu habis" is the true
  // answer, and the server refuses a retry there anyway.
  if (paymentState(payment) === PAY_DEAD) {
    return (
      <PaymentUnavailable
        order={order}
        brand={brand}
        onRetry={onRetry}
        retrying={retrying}
        retryError={retryError}
      />
    );
  }

  const copy = (value, label) => {
    navigator.clipboard?.writeText(value).then(
      () => showToast(`${label} disalin ✓`),
      () => showToast('Gagal menyalin'),
    );
  };

  return (
    <section style={{ ...card, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Selesaikan pembayaran</div>
        {order.expires_at ? (
          <div style={{ fontSize: 13, color: 'var(--pc-ink)', fontWeight: 600 }}>
            Sisa <CountdownClock until={order.expires_at} onExpire={() => setPastDeadline(true)} />
          </div>
        ) : null}
      </div>

      <PayableAmount amount={payment.amount} uniqueCode={order.unique_code} onCopy={copy} />

      {/* Branch on `kind`, never on `method`: the gateway decides which fields
          it populates, and a method can change kind under us. */}
      {payment.kind === 'va' ? (
        <div>
          <div style={{ fontSize: 13, color: 'var(--pc-body)' }}>Transfer ke Virtual Account {payment.va_bank}</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              background: 'var(--pc-tint)',
              border: '1px solid var(--pc-line)',
              borderRadius: 14,
              padding: '14px 16px',
              marginTop: 8,
            }}
          >
            <strong style={{ fontSize: 19, letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums' }}>
              {payment.va_number}
            </strong>
            <button
              type="button"
              onClick={() => copy(payment.va_number, 'Nomor VA')}
              style={{ color: 'var(--pc-green)', fontWeight: 700, fontSize: 13.5 }}
            >
              Salin
            </button>
          </div>
          {/* Rendered verbatim: the tenant writes this line in full, prefix
              included, so adding our own "a.n." doubles it. */}
          {payConfig.account_holder ? (
            <div style={{ fontSize: 13, color: 'var(--pc-body)', marginTop: 10 }}>
              {payConfig.account_holder}
            </div>
          ) : null}
        </div>
      ) : payment.kind === 'qr' ? (
        <QrisBlock payload={payment.qr_payload} config={payConfig} brand={brand} />
      ) : payment.kind === 'qr_image' ? (
        <QrImageBlock url={payment.qr_image_url} config={payConfig} brand={brand} />
      ) : payment.kind === 'redirect' ? (
        <RedirectBlock url={payment.redirect_url} order={order} brand={brand} />
      ) : payment.kind === 'manual_transfer' ? (
        <ManualTransferBlock payment={payment} brand={brand} onCopy={copy} />
      ) : payment.kind === 'manual_qris' ? (
        <ManualQrisBlock payment={payment} brand={brand} />
      ) : payment.kind === 'manual_whatsapp' ? (
        <WhatsAppBlock payment={payment} order={order} brand={brand} />
      ) : null}

      {isManualPayment(payment) ? (
        <ManualClaim
          order={order}
          kind={payment.kind}
          onClaim={onClaim}
          claiming={claiming}
          claimError={claimError}
          canClaim={canClaimPayment(order, payment)}
        />
      ) : null}

      <div style={{ borderTop: '1px solid var(--pc-line)', marginTop: 18, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--pc-muted)' }}>
          Halaman ini memperbarui sendiri setelah pembayaranmu masuk.
        </span>
        <button type="button" onClick={onRefresh} style={{ fontSize: 13, fontWeight: 600, color: 'var(--pc-green)' }}>
          Cek sekarang
        </button>
      </div>
    </section>
  );
}

/**
 * The order is fine; the instructions for paying it are not.
 *
 * Deliberately not shaped like the payment card above it. No countdown, no
 * amount in display pink, no "cek sekarang" — every one of those said help was
 * on its way, and none of it was. Blush on blush is the storefront's alert
 * tone (see InlineError), so a buyer can tell at a glance this is not a
 * payment instruction.
 *
 * "Coba lagi" is the whole point and gets the weight. WhatsApp stays, demoted
 * to a link: it is the escape, not the action.
 */
function PaymentUnavailable({ order, brand, onRetry, retrying, retryError }) {
  return (
    <section
      role="alert"
      style={{
        ...card,
        borderColor: 'var(--pc-mist)',
        background: 'var(--pc-mist)',
        marginBottom: 20,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
        Pembayaran belum bisa dibuka
      </div>
      <p style={{ fontSize: 14, color: 'var(--pc-body)', lineHeight: 1.7, margin: 0 }}>
        Pesananmu tersimpan dengan nomor <strong>{order.number}</strong> dan masih bisa dibayar
        — yang gagal cuma pembuatan instruksi pembayarannya.
      </p>

      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className={retrying ? undefined : 'hv-dark'}
          style={{
            ...darkButton,
            opacity: retrying ? 0.6 : 1,
            cursor: retrying ? 'wait' : 'pointer',
          }}
        >
          {retrying ? 'Membuat ulang…' : 'Coba lagi'}
        </button>
      ) : null}

      {/* Rendered verbatim: every message the API returns is Indonesian copy
          written for a buyer, so the server owns the wording and there is no
          table here to drift from it. */}
      {retryError ? (
        <p style={{ fontSize: 13.5, color: 'var(--pc-ink)', lineHeight: 1.7, margin: '12px 0 0' }}>
          {retryError.message}
        </p>
      ) : null}

      {/* Stated, not counted down. The deadline is real and the buyer needs
          it; a ticking clock implied something was going to resolve itself. */}
      {order.expires_at ? (
        <p style={{ fontSize: 12.5, color: 'var(--pc-muted)', margin: '14px 0 0' }}>
          Batas pembayaran {fmtDateTime(order.expires_at)}.
        </p>
      ) : null}

      {brand.whatsapp_url ? (
        <p style={{ fontSize: 13.5, color: 'var(--pc-body)', margin: '10px 0 0' }}>
          Masih gagal?{' '}
          <a
            href={brand.whatsapp_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--pc-green)', fontWeight: 700 }}
          >
            {brand.whatsapp_text || 'Hubungi kami'}
          </a>
        </p>
      ) : null}
    </section>
  );
}

/**
 * E-wallet and retail methods are completed on the provider's own page.
 *
 * The buyer leaves the site here, so this is also the last thing they see
 * before returning: the order number is spelled out so they can find the order
 * again from /lacak, which is where the provider sends them back to. It is
 * deliberately not a link carrying the tracking token — that token is issued
 * once, kept only as a hash, and must never travel to a third party.
 *
 * The stub's redirect points at a route that does not exist, so it is shown as
 * an inert test panel rather than a button that goes nowhere.
 */
function RedirectBlock({ url, order, brand }) {
  if (!isUsableRedirect(url)) {
    return (
      <div style={{ background: 'var(--pc-tint)', border: '1px dashed var(--pc-amber)', borderRadius: 12, padding: '18px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Mode uji</div>
        <p style={{ fontSize: 13.5, color: 'var(--pc-body)', lineHeight: 1.7, margin: '8px 0 0' }}>
          Metode ini belum terhubung ke penyedia pembayaran, jadi belum ada halaman yang bisa
          dibuka. Hubungi kami untuk menyelesaikan pesanan <strong>{order.number}</strong>.
        </p>
        {brand.whatsapp_url ? (
          <a
            href={brand.whatsapp_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', marginTop: 12, color: 'var(--pc-green)', fontWeight: 700, fontSize: 13.5 }}
          >
            {brand.whatsapp_text || 'Hubungi kami'}
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <a href={url} rel="noopener noreferrer" className="hv-dark" style={{ ...darkButton, textAlign: 'center' }}>
        Lanjut ke halaman pembayaran
      </a>
      <p style={{ fontSize: 13, color: 'var(--pc-body)', lineHeight: 1.7, margin: '12px 0 0' }}>
        Kamu akan diarahkan ke halaman penyedia pembayaran. Setelah selesai, kembali ke sini —
        halaman ini memperbarui sendiri begitu pembayaranmu masuk. Nomor pesananmu{' '}
        <strong style={{ color: 'var(--pc-ink)' }}>{order.number}</strong>.
      </p>
    </div>
  );
}

function QrisBlock({ payload, config, brand }) {
  if (!isQrisPayload(payload)) {
    return (
      <div
        style={{
          background: 'var(--pc-tint)',
          border: '1px dashed var(--pc-amber)',
          borderRadius: 12,
          padding: '18px 20px',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14 }}>QRIS mode uji</div>
        <p style={{ fontSize: 13.5, color: 'var(--pc-body)', lineHeight: 1.7, margin: '8px 0 0' }}>
          Pembayaran QRIS belum aktif di toko ini, jadi belum ada kode yang bisa dipindai. Hubungi
          kami untuk menyelesaikan pesanan.
        </p>
        {brand.whatsapp_url ? (
          <a
            href={brand.whatsapp_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', marginTop: 12, color: 'var(--pc-green)', fontWeight: 700, fontSize: 13.5 }}
          >
            {brand.whatsapp_text || 'Hubungi kami'}
          </a>
        ) : null}
        <code style={{ display: 'block', marginTop: 14, fontSize: 11, color: 'var(--pc-muted)', wordBreak: 'break-all' }}>
          {payload}
        </code>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <Suspense fallback={<Skeleton width={220} height={220} radius={12} />}>
        <QrCode payload={payload} />
      </Suspense>
      <div style={{ fontSize: 13.5, color: 'var(--pc-body)', lineHeight: 1.8 }}>
        Pindai dengan aplikasi bank atau e-wallet apa pun.
        {config.qris_merchant_name ? (
          <>
            <br />
            <strong style={{ color: 'var(--pc-ink)' }}>{config.qris_merchant_name}</strong>
          </>
        ) : null}
        {config.qris_nmid ? (
          <>
            <br />
            NMID {config.qris_nmid}
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The same panel as QrisBlock, for a gateway that draws the code itself.
 *
 * Deliberately indistinguishable to a buyer: which provider serves a method is
 * a routing decision that can change between one order and the next, and a
 * payment page that visibly changed shape with it would read as a fault.
 */
/**
 * The amount, which on a manual order is also the reference.
 *
 * A bank credit carries a name, a time and an amount and nothing else, so the
 * last three digits are the only thing tying one to this order. A buyer who
 * rounds them off leaves the shop a payment matching nothing — which is why
 * they are marked in the number itself rather than only explained underneath,
 * and why the whole amount can be copied: typing it is where the mistake
 * happens.
 *
 * A gateway amount renders exactly as it did before, one unbroken number.
 */
function PayableAmount({ amount, uniqueCode, onCopy }) {
  const text = fmt(amount);
  const split = splitUniqueCode(text, uniqueCode);

  if (!split) {
    return (
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--pc-green)', margin: '10px 0 18px' }}>
        {text}
      </div>
    );
  }

  return (
    <div style={{ margin: '10px 0 18px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          flexWrap: 'wrap',
          fontSize: 26,
          fontWeight: 700,
          color: 'var(--pc-green)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>
          {split.head}
          <span
            style={{
              // Underlined rather than recoloured: the three digits are part
              // of the amount, not a separate charge, and giving them their
              // own colour would read as a second number to be paid.
              borderBottom: '2px solid var(--pc-line-2)',
              paddingBottom: 1,
            }}
          >
            {split.code}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onCopy(String(amount), 'Nominal')}
          style={{ color: 'var(--pc-green)', fontWeight: 700, fontSize: 13.5 }}
        >
          Salin nominal
        </button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--pc-body)', lineHeight: 1.7, margin: '8px 0 0' }}>
        Transfer tepat sampai <strong style={{ color: 'var(--pc-ink)' }}>{split.code}</strong> di
        belakang. Tiga angka itu yang menandai pesananmu — tanpa itu, penjual tidak tahu
        pembayaran ini milik siapa.
      </p>
    </div>
  );
}

/**
 * The shop's own bank account.
 *
 * Deliberately not the VA block with different copy. A Virtual Account is
 * issued for one order and expires with it; this is one fixed account number
 * shared by every order the shop has ever taken, which is why the amount
 * carries a code and why a person has to confirm it. Telling a buyer to
 * "Transfer ke Virtual Account" a number that is nothing of the sort is how
 * they end up asking their bank why the account rejects them.
 */
function ManualTransferBlock({ payment, brand, onCopy }) {
  const number = payment.manual_account_number;
  if (!number) {
    // Reachable only if the shop cleared their account between the charge
    // opening and this render. Nothing to pay to, so say so rather than draw
    // an empty plate.
    return <ManualUnset brand={brand} />;
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--pc-body)' }}>
        Transfer ke rekening {payment.manual_bank}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background: 'var(--pc-tint)',
          border: '1px solid var(--pc-line)',
          borderRadius: 14,
          padding: '14px 16px',
          marginTop: 8,
        }}
      >
        <strong style={{ fontSize: 19, letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums' }}>
          {number}
        </strong>
        <button
          type="button"
          onClick={() => onCopy(number, 'Nomor rekening')}
          style={{ color: 'var(--pc-green)', fontWeight: 700, fontSize: 13.5 }}
        >
          Salin
        </button>
      </div>
      {payment.manual_account_holder ? (
        // "a.n." is added here, unlike the VA block's account_holder, because
        // this is a bare name from the shop's settings rather than a line the
        // merchant wrote in full.
        <div style={{ fontSize: 13, color: 'var(--pc-body)', marginTop: 10 }}>
          a.n. <strong style={{ color: 'var(--pc-ink)' }}>{payment.manual_account_holder}</strong>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The shop's own printed QRIS.
 *
 * The image is the original object, never a rendition: the pipeline writes
 * lossy WebP at three widths, and a downscaled, re-compressed QR is a QR that
 * may not scan. That is the documented exception to the srcset rule.
 *
 * The sidebar says what a gateway QRIS never has to: a static code carries no
 * amount, so the buyer types it, and it has to be exact.
 */
function ManualQrisBlock({ payment, brand }) {
  const url = payment.manual_qr_image_url;
  // isDisplayableImageURL, not isQrImageURL: this URL was composed by our own
  // server from a storage key, so the only thing that can break is mixed
  // content. Judging it by the gateway rule dead-ended every deployment whose
  // media origin is plain http — and told the buyer the shop had set up no
  // account, when the shop had.
  if (!isDisplayableImageURL(url)) {
    return <ManualUnset brand={brand} />;
  }

  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <QrImage url={url} />
      <div style={{ fontSize: 13.5, color: 'var(--pc-body)', lineHeight: 1.8 }}>
        Pindai dengan aplikasi bank atau e-wallet apa pun.
        <br />
        <strong style={{ color: 'var(--pc-ink)' }}>Nominalnya diisi sendiri</strong> — kode ini tidak
        membawa jumlah, jadi ketik persis seperti di atas.
      </div>
    </div>
  );
}

/**
 * The order handed to the merchant as the first message of a chat.
 *
 * The message is shown before the button, in full, because the buyer is about
 * to send it under their own name: nothing in it should be a surprise, and a
 * buyer who can read it will trust the button. The tracking link inside it is
 * this page's own URL, so the merchant lands where the buyer is looking.
 */
function WhatsAppBlock({ payment, order, brand }) {
  const phone = payment.manual_whatsapp_phone;
  if (!phone) {
    return <ManualUnset brand={brand} />;
  }
  const message = orderMessage(order, typeof window === 'undefined' ? '' : window.location.href);
  const href = waLink(phone, message);

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--pc-body)' }}>
        Pesanan ini dikirim ke penjual lewat WhatsApp. Ongkir dan cara bayar disepakati di sana.
      </div>
      <div
        style={{
          background: 'var(--pc-tint)',
          border: '1px solid var(--pc-line)',
          borderRadius: '16px 16px 16px 4px',
          padding: '14px 16px',
          marginTop: 10,
          fontSize: 13,
          lineHeight: 1.65,
          color: 'var(--pc-ink)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message}
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block',
          marginTop: 14,
          padding: '13px 18px',
          borderRadius: 14,
          background: 'var(--pc-green)',
          color: 'var(--pc-white)',
          fontWeight: 700,
          fontSize: 14.5,
          textAlign: 'center',
          textDecoration: 'none',
        }}
      >
        Buka WhatsApp
      </a>
      <p style={{ fontSize: 12.5, color: 'var(--pc-muted)', lineHeight: 1.7, margin: '8px 0 0' }}>
        Pesannya sudah terisi — tinggal kirim.
      </p>
    </div>
  );
}

/**
 * A manual method whose account has gone missing.
 *
 * The same shape as the QRIS dead end above, and for the same reason: the
 * buyer's order is alive and payable, only the instructions are not, so the
 * way out is the shop rather than a retry.
 */
function ManualUnset({ brand }) {
  return (
    <div
      style={{
        background: 'var(--pc-tint)',
        border: '1px dashed var(--pc-amber)',
        borderRadius: 12,
        padding: '18px 20px',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14 }}>Rekening belum tersedia</div>
      <p style={{ fontSize: 13.5, color: 'var(--pc-body)', lineHeight: 1.7, margin: '8px 0 0' }}>
        Toko belum mencantumkan tujuan transfer untuk metode ini. Pesananmu tetap tersimpan —
        hubungi kami untuk menyelesaikannya.
      </p>
      {brand.whatsapp_url ? (
        <a
          href={brand.whatsapp_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-block', marginTop: 12, color: 'var(--pc-green)', fontWeight: 700, fontSize: 13.5 }}
        >
          {brand.whatsapp_text || 'Hubungi kami'}
        </a>
      ) : null}
    </div>
  );
}

/**
 * "Saya sudah bayar", and what it turns into.
 *
 * A manual payment produces no callback, so this is the only way the shop
 * learns that money may be coming. It proves nothing and the copy does not
 * pretend otherwise — what it buys the buyer is time, because the claim moves
 * the order's deadline out once so a transfer made near the end is not expired
 * while it is in flight.
 */
function ManualClaim({ order, kind, onClaim, claiming, claimError, canClaim }) {
  // A chat has no bank statement to check against and no transfer form to
  // send from, so the two sentences that assume one are swapped.
  const chat = kind === 'manual_whatsapp';
  if (order.buyer_claimed_at) {
    return (
      <div
        style={{
          marginTop: 18,
          background: 'var(--pc-tint)',
          border: '1px solid var(--pc-line)',
          borderRadius: 14,
          padding: '14px 16px',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14 }}>Menunggu konfirmasi penjual</div>
        <p style={{ fontSize: 13.5, color: 'var(--pc-body)', lineHeight: 1.7, margin: '6px 0 0' }}>
          {chat
            ? 'Terima kasih — penjual akan mengeceknya di percakapan WhatsApp kalian. Status pesanan ini berubah sendiri begitu dikonfirmasi.'
            : 'Terima kasih — penjual akan mencocokkannya dengan mutasi rekening mereka. Status pesanan ini berubah sendiri begitu dikonfirmasi.'}
        </p>
      </div>
    );
  }

  if (!canClaim) return null;

  return (
    <div style={{ marginTop: 18 }}>
      <button
        type="button"
        onClick={onClaim}
        disabled={claiming}
        style={{
          width: '100%',
          padding: '13px 18px',
          borderRadius: 14,
          // Outlined under a chat, where "Buka WhatsApp" above it is the one
          // thing to press first; filled everywhere else, where it is.
          background: chat ? 'transparent' : claiming ? 'var(--pc-line-2)' : 'var(--pc-green)',
          border: chat ? '1.5px solid var(--pc-green)' : 'none',
          color: chat ? 'var(--pc-green)' : 'var(--pc-white)',
          opacity: chat && claiming ? 0.6 : 1,
          fontWeight: 700,
          fontSize: 14.5,
          cursor: claiming ? 'default' : 'pointer',
        }}
      >
        {claiming ? 'Mengirim…' : 'Saya sudah bayar'}
      </button>
      <p style={{ fontSize: 12.5, color: 'var(--pc-muted)', lineHeight: 1.7, margin: '8px 0 0' }}>
        {chat
          ? 'Tekan setelah pembayaran yang disepakati di WhatsApp sudah dikirim. Penjual mengeceknya sendiri.'
          : 'Tekan setelah transfer terkirim. Penjual mengeceknya sendiri, jadi tidak perlu unggah bukti.'}
      </p>
      {claimError ? (
        <p role="alert" style={{ fontSize: 13, color: 'var(--pc-error)', margin: '8px 0 0' }}>
          {claimError.message}
        </p>
      ) : null}
    </div>
  );
}

function QrImageBlock({ url, config, brand }) {
  if (!isQrImageURL(url)) {
    return (
      <div
        style={{
          background: 'var(--pc-tint)',
          border: '1px dashed var(--pc-amber)',
          borderRadius: 12,
          padding: '18px 20px',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14 }}>QRIS mode uji</div>
        <p style={{ fontSize: 13.5, color: 'var(--pc-body)', lineHeight: 1.7, margin: '8px 0 0' }}>
          Pembayaran QRIS belum aktif di toko ini, jadi belum ada kode yang bisa dipindai. Hubungi
          kami untuk menyelesaikan pesanan.
        </p>
        {brand.whatsapp_url ? (
          <a
            href={brand.whatsapp_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', marginTop: 12, color: 'var(--pc-green)', fontWeight: 700, fontSize: 13.5 }}
          >
            {brand.whatsapp_text || 'Hubungi kami'}
          </a>
        ) : null}
        <code style={{ display: 'block', marginTop: 14, fontSize: 11, color: 'var(--pc-muted)', wordBreak: 'break-all' }}>
          {url}
        </code>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <QrImage url={url} />
      <div style={{ fontSize: 13.5, color: 'var(--pc-body)', lineHeight: 1.8 }}>
        Pindai dengan aplikasi bank atau e-wallet apa pun.
        {config.qris_merchant_name ? (
          <>
            <br />
            <strong style={{ color: 'var(--pc-ink)' }}>{config.qris_merchant_name}</strong>
          </>
        ) : null}
        {config.qris_nmid ? (
          <>
            <br />
            NMID {config.qris_nmid}
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Rendered from `order.timeline`, never recomputed from `status`: a cancelled
 * or expired order legitimately has all four steps undone, and deriving the
 * timeline locally would wrongly show the first one complete.
 */
function Timeline({ order }) {
  const terminal = order.status === 'cancelled' || order.status === 'expired';

  return (
    <section style={card}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 18 }}>Status</div>
      {terminal ? (
        <p style={{ fontSize: 14, color: 'var(--pc-body)', lineHeight: 1.7, margin: '0 0 18px' }}>
          {order.status === 'expired'
            ? // The restock sentence is only true of lines that reserved
              // stock. An order of only pre-order or unlimited lines returned
              // nothing, because it never took anything.
              order.lines?.every((l) => l.preorder || l.unlimited_stock)
              ? 'Pesanan ini kedaluwarsa karena pembayaran tidak masuk tepat waktu.'
              : 'Pesanan ini kedaluwarsa karena pembayaran tidak masuk tepat waktu. Stoknya sudah dikembalikan.'
            : 'Pesanan ini dibatalkan.'}
        </p>
      ) : null}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {order.timeline.map((step, i) => (
          <li key={step.key} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'stretch' }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: step.done ? 'var(--pc-green)' : 'var(--pc-white)',
                  border: `2px solid ${step.done ? 'var(--pc-green)' : 'var(--pc-line)'}`,
                  flexShrink: 0,
                  marginTop: 3,
                }}
              />
              {i < order.timeline.length - 1 ? (
                <span style={{ flex: 1, width: 2, background: step.done ? 'var(--pc-line-2)' : 'var(--pc-line)', minHeight: 26 }} />
              ) : null}
            </div>
            <div style={{ paddingBottom: 18 }}>
              <div style={{ fontWeight: step.done ? 700 : 500, color: step.done ? 'var(--pc-ink)' : 'var(--pc-muted)', fontSize: 14.5 }}>
                {step.label}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {terminal ? (
        <Link to="/katalog" className="hv-dark" style={darkButton}>
          Belanja lagi
        </Link>
      ) : null}
    </section>
  );
}

function PlacedBanner({ order, tokenAtRisk, token }) {
  return (
    <div
      style={{
        background: 'var(--pc-mist)',
        border: '1px solid var(--pc-line-2)',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 22,
      }}
    >
      <strong style={{ fontSize: 15 }}>Pesanan berhasil dibuat ✓</strong>
      <p style={{ fontSize: 13.5, color: 'var(--pc-ink)', lineHeight: 1.7, margin: '6px 0 0' }}>
        Tautan pesanan ini juga kami kirim ke {order.contact_masked}.
      </p>
      {/* Storage refused the write, so this page is the only place the token
          exists. Say so plainly rather than let it vanish on the next tap. */}
      {tokenAtRisk ? (
        <p style={{ fontSize: 13, color: 'var(--pc-body)', lineHeight: 1.7, margin: '10px 0 0' }}>
          Simpan tautan ini — peramban tidak bisa menyimpannya di perangkatmu:
          <br />
          <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{`${window.location.origin}/pesanan/${token}`}</code>
        </p>
      ) : null}
    </div>
  );
}

function StatusPill({ status, label }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.cancelled;
  return (
    <span
      style={{
        background: tone.bg,
        color: tone.fg,
        borderRadius: 999,
        padding: '6px 14px',
        fontSize: 12.5,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14.5 }}>
      <span style={{ color: 'var(--pc-body)' }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const darkButton = {
  display: 'inline-block',
  background: 'var(--pc-green)',
  color: 'var(--pc-white)',
  borderRadius: 8,
  padding: '13px 28px',
  fontWeight: 700,
  fontSize: 14.5,
  marginTop: 16,
};

function OrderSkeleton() {
  return (
    <main aria-busy="true" style={{ flex: 1, maxWidth: 720, margin: '0 auto', padding: '36px 20px 60px', width: '100%' }}>
      <Skeleton height={36} width={220} />
      <Skeleton height={14} width={300} style={{ marginTop: 12 }} />
      <Skeleton height={180} radius={12} style={{ marginTop: 26 }} />
      <Skeleton height={220} radius={12} style={{ marginTop: 20 }} />
    </main>
  );
}
