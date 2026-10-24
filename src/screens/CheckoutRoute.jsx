import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Img, SIZES } from '../ui/Img.jsx';
import { Tile } from '../components/Tile.jsx';
import OtpModal from '../components/OtpModal.jsx';
import DestinationPicker from '../components/DestinationPicker.jsx';
import ShippingRates from '../components/ShippingRates.jsx';
import { orderNote } from '@sepetakhq/storefront-kit/lib/preorder';
import { MAX_VOUCHER_LEN, normalizeVoucherInput, voucherLabel, voucherNotes } from '@sepetakhq/storefront-kit/lib/voucher';
import { destinationSummary } from '@sepetakhq/storefront-kit/lib/shipping';
import { useCart } from '@sepetakhq/storefront-kit/cart/CartProvider';
import { useCartLines } from '@sepetakhq/storefront-kit/cart/useCartLines';
import { useConfig } from '@sepetakhq/storefront-kit/config/ConfigProvider';
import { createDraft, sendCheckoutCode, verifyCheckoutCode } from '@sepetakhq/storefront-kit/api/endpoints';
import { qk } from '@sepetakhq/storefront-kit/api/queryKeys';
import { lineKey } from '@sepetakhq/storefront-kit/lib/variants';
import { fmt, formatQty } from '@sepetakhq/storefront-kit/shared/format';
import { confirmStep, estimatePaymentFee, estimateShipping, methodFits, storeNotReady } from '@sepetakhq/storefront-kit/lib/checkout';
import {
  CHANNEL_WHATSAPP,
  contactField,
  normalizeContact,
  normalizePhone,
  validateContact,
  validatePhone,
} from '@sepetakhq/storefront-kit/lib/contact';
import { clearCheckout, keyForAttempt, resetKeyForAttempt, saveCheckout } from '@sepetakhq/storefront-kit/checkout/checkoutStorage';
import { recordRetryAfter, recordSend, clearCooldown } from '@sepetakhq/storefront-kit/checkout/otpCooldown';
import { rememberOrder } from '@sepetakhq/storefront-kit/checkout/orderTokens';
import { CountdownClock } from '../ui/Countdown.jsx';

const card = { background: 'var(--pc-white)', border: '1px solid var(--pc-line)', borderRadius: 12, padding: 'clamp(16px, 3vw, 22px)' };
const field = {
  border: '1px solid var(--pc-line-2)',
  borderRadius: 8,
  minHeight: 46,
  padding: '0 14px',
  fontSize: 15,
  fontWeight: 400,
  background: 'var(--pc-white)',
  color: 'var(--pc-ink)',
  width: '100%',
};

// Server-side caps, counted in runes. Enforced here so the buyer is told
// before a round-trip, not after.
const LIMITS = { customer_name: 120, address: 500, city: 80, contact: 254, phone: 20 };

export default function CheckoutRoute() {
  const cart = useCart();
  // Placing an order empties the cart, which would otherwise trip this guard
  // and bounce the buyer to an empty cart instead of their new order — with
  // the order created and the tracking link only in localStorage.
  const [placed, setPlaced] = useState(false);
  if (cart.isEmpty && !placed) return <Navigate to="/keranjang" replace />;
  return <Checkout onPlaced={() => setPlaced(true)} />;
}

function Checkout({ onPlaced }) {
  const { couriers, paymentMethods, contactChannel, freeShipping, freeShippingMin, liveShipping } =
    useConfig();
  const cart = useCart();
  const { lines, subtotal, isLoading, hasBlockers, preorderLeadDays } = useCartLines();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({ customer_name: '', contact: '', phone: '', address: '', city: '' });
  const [courier, setCourier] = useState(() => couriers[0]?.code ?? '');
  const [method, setMethod] = useState(() => paymentMethods[0]?.code ?? '');
  const [formErr, setFormErr] = useState('');

  // Live rates only. `destination` is the resolved location the provider
  // quotes to, and `quote` is the option the buyer picked — checkout submits
  // its id, never a price, because the server charges what it stored.
  const [destination, setDestination] = useState(null);
  const [quote, setQuote] = useState(null);

  // The draft is the first server-priced view of this cart, and the review
  // step exists so the buyer approves it before a code is spent.
  const [draft, setDraft] = useState(null);
  // Kept on the checkout screen, not in the cart: a code belongs to this
  // attempt at paying, and one left in localStorage would come back weeks
  // later as a discount the buyer never asked for again. It survives "Ubah
  // pesanan" because that only clears the draft, not this.
  const [voucherCode, setVoucherCode] = useState('');
  const [otp, setOtp] = useState(null);
  // Closing the modal must not discard the challenge. The buyer still has a
  // live code in their inbox, and re-sending would spend one of five per hour
  // and push them onto the 60s -> 5m -> 30m ladder for no reason.
  const [otpOpen, setOtpOpen] = useState(false);

  const contactMeta = contactField(contactChannel);
  // Whether the courier's number needs its own field. Under a WhatsApp tenant
  // the contact already is it, and the server derives one from the other.
  const phoneAsked = contactChannel !== CHANNEL_WHATSAPP;
  const setField = (e) => {
    // Clear the banner as soon as the buyer starts fixing it — leaving it up
    // while they type reads as though the correction did not register.
    setFormErr('');
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  // Prices the cart last saw, for the change notice on the review panel.
  const cartPrices = useMemo(() => {
    const m = new Map();
    for (const l of lines) if (l.product) m.set(l.key, l.product.price);
    return m;
  }, [lines]);

  // variant_id rides along only when the line names one, so a cart of plain
  // products sends exactly the body it always did.
  const cartItems = useMemo(
    () =>
      cart.items.map((it) => ({
        product_id: it.productId,
        qty: it.qty,
        ...(it.variantId ? { variant_id: it.variantId } : {}),
      })),
    [cart.items],
  );

  const draftMutation = useMutation({
    mutationFn: () =>
      createDraft({
        items: cartItems,
        // Under live rates the quote carries the courier and the price, so
        // courier_code is not read; under flat pricing there is no quote and
        // the code is the whole answer. Sending both is harmless and keeps
        // one call site.
        courier_code: courier,
        shipping_quote_id: quote?.quote_id ?? '',
        payment_method: method,
        contact: normalizeContact(contactChannel, form.contact),
        customer_name: form.customer_name.trim(),
        // Normalised here as well as on the server, so what the buyer sees
        // echoed anywhere is the one shape the order will carry. Empty under a
        // WhatsApp tenant, where the server takes the contact instead.
        phone: phoneAsked ? normalizePhone(form.phone) : '',
        address: form.address.trim(),
        // The city the order is filed under. Under live rates it comes from
        // the resolved destination, so an operator reads the same place the
        // parcel was quoted to rather than whatever the buyer typed.
        city: liveShipping ? destinationSummary(destination) : form.city.trim(),
        // Empty when they typed nothing, which is the ordinary case. The
        // server answers on the draft rather than refusing it, so a bad code
        // never costs the buyer the order.
        voucher_code: voucherCode,
      }),
    onSuccess: (d) => {
      setFormErr('');
      setDraft(d);
      // The review replaces the form; start it at the top, not wherever the
      // buyer's submit click left the page.
      window.scrollTo(0, 0);
      saveCheckout({ draftId: d.draft_id, expiresAt: d.expires_at });
      clearCooldown(d.draft_id);
    },
    onError: (err) => handleDraftError(err),
  });

  const sendMutation = useMutation({
    mutationFn: () => sendCheckoutCode(draft.draft_id),
    onSuccess: (res) => {
      const state = recordSend(draft.draft_id);
      setOtpOpen(true);
      setOtp({
        channel: res.channel,
        masked: res.masked,
        expiresAt: new Date(Date.now() + res.expires_in_seconds * 1000).toISOString(),
        nextAllowedAt: state.nextAllowedAt,
        attempts: 0,
        error: '',
      });
    },
    onError: (err) => handleSendError(err),
  });

  const verifyMutation = useMutation({
    mutationFn: async (code) => {
      const key = keyForAttempt(draft.draft_id, code);
      try {
        return await verifyCheckoutCode(draft.draft_id, code, key);
      } catch (err) {
        // A reused key with a different body is our bug, not the buyer's.
        // Mint a fresh one and try once more, transparently.
        if (err?.status === 422) {
          return verifyCheckoutCode(draft.draft_id, code, resetKeyForAttempt(draft.draft_id, code));
        }
        throw err;
      }
    },
    onSuccess: ({ data }) => {
      // Before navigating, before setState, before anything that can throw:
      // the track token is returned exactly once and no endpoint can give it
      // back — not tracking, not the OTP lookup.
      const saved = rememberOrder({
        token: data.track_token,
        number: data.order.number,
        total: data.order.total,
        placedAt: data.order.placed_at,
      });

      queryClient.setQueryData(qk.track(data.track_token), {
        order: data.order,
        payment: data.payment ?? null,
      });

      // Order matters: release the empty-cart guard before emptying the cart,
      // then navigate. All three are batched into one render.
      onPlaced();
      clearCheckout();
      clearCooldown(draft.draft_id);
      cart.clear();
      setOtp(null);
      setOtpOpen(false);

      navigate(`/pesanan/${data.track_token}`, {
        replace: true,
        state: { justPlaced: true, tokenAtRisk: !saved },
      });
    },
    onError: (err) => handleVerifyError(err),
  });

  function handleDraftError(err) {
    if (err?.status === 409 && err.code === 'unavailable') {
      // The API drops the per-item detail, so the cart refetches and lets the
      // per-line hydration surface which product is the problem.
      queryClient.invalidateQueries({ queryKey: ['product'] });
      navigate('/keranjang', { state: { stockChanged: true } });
      return;
    }
    setFormErr(err?.message || 'Checkout gagal. Coba lagi.');
  }

  function handleSendError(err) {
    if (err?.code === 'draft_expired') return resetDraft('Checkout kedaluwarsa. Ulangi ya.');
    if (err?.code === 'draft_consumed' || err?.code === 'order_exists') {
      return setFormErr('Pesanan ini sudah dibuat. Cek email konfirmasimu atau buka Lacak Pesanan.');
    }
    if (err?.status === 409 && err.code === 'unavailable') return handleDraftError(err);
    if (err?.status === 429) {
      if (err.retryAfter) recordRetryAfter(draft.draft_id, err.retryAfter);
      setFormErr(err.message);
      return;
    }
    setFormErr(err?.message || 'Gagal mengirim kode.');
  }

  function handleVerifyError(err) {
    // The one verification failure that names itself: the browser was trusted
    // when the draft was priced and is not any more. Nothing was guessed and
    // nothing leaks, so the buyer is sent to the ordinary code flow rather than
    // told a code they never typed was wrong.
    if (err?.code === 'otp_required') {
      setFormErr('');
      sendMutation.mutate();
      return;
    }
    if (err?.status === 429) {
      setFormErr(err.message);
      return;
    }
    // Wrong code, expired code, too many attempts and a code bound to another
    // draft are one indistinguishable 400 by design — so the UI must not
    // promise a reason.
    if (err?.status === 400) {
      setOtp((o) => o && { ...o, error: err.message, attempts: o.attempts + 1 });
      return;
    }
    if (err?.status === 409 && err.code === 'unavailable') {
      // The OTP was consumed before the stock check, so a retry is useless —
      // this needs a new draft and a new code.
      setOtp(null);
      setOtpOpen(false);
      queryClient.invalidateQueries({ queryKey: ['product'] });
      navigate('/keranjang', { state: { stockChanged: true, afterVerify: true } });
      return;
    }
    if (err?.code === 'order_exists' || err?.code === 'draft_consumed') {
      setOtp(null);
      setOtpOpen(false);
      setFormErr('Pesanan ini sudah dibuat. Cek email konfirmasimu atau buka Lacak Pesanan.');
      return;
    }
    setOtp((o) => o && { ...o, error: err?.message || 'Verifikasi gagal. Coba lagi.' });
  }

  function resetDraft(message) {
    setDraft(null);
    setOtp(null);
    setOtpOpen(false);
    clearCheckout();
    setFormErr(message);
  }

  function submitForm(e) {
    e.preventDefault();
    for (const [key, max] of Object.entries(LIMITS)) {
      if ([...(form[key] || '')].length > max) {
        return setFormErr(`${LABELS[key]} terlalu panjang (maksimal ${max} karakter).`);
      }
    }
    // Every empty required field named at once, contact included. It used to
    // be left out of this check and validated three lines further down, so a
    // buyer filling an empty form was told to complete three fields, did, and
    // only then discovered a fourth.
    const missing = missingFields({
      form,
      liveShipping,
      destination,
      contactLabel: contactField(contactChannel).label,
      phoneAsked,
    });
    if (missing.length > 0) {
      return setFormErr(`Lengkapi ${listPhrase(missing)} dulu ya.`);
    }
    // No fallback to a flat rate: charging one the buyer was never shown is
    // worse than asking them to pick again.
    if (liveShipping && !quote) {
      return setFormErr('Pilih ongkir dulu ya.');
    }
    // Reached only once contact holds something, so this is about the shape of
    // what was typed rather than its absence.
    const contactErr = validateContact(contactChannel, form.contact);
    if (contactErr) return setFormErr(contactErr);
    if (phoneAsked) {
      const phoneErr = validatePhone(form.phone);
      if (phoneErr) return setFormErr(phoneErr);
    }

    setFormErr('');
    draftMutation.mutate();
  }

  if (draft) {
    return (
      <Review
        draft={draft}
        cartPrices={cartPrices}
        // Under live rates the chosen quote names the service; the config's
        // courier list only carries the allow-list, not the price.
        courier={liveShipping ? quote : couriers.find((c) => c.code === courier)}
        method={paymentMethods.find((m) => m.code === method)}
        error={formErr}
        otp={otp}
        otpOpen={otpOpen}
        sending={sendMutation.isPending}
        verifying={verifyMutation.isPending}
        onSend={() => {
          setFormErr('');
          sendMutation.mutate();
        }}
        onReopenOtp={() => {
          setFormErr('');
          setOtpOpen(true);
        }}
        onVerify={(code) => verifyMutation.mutate(code)}
        // No code to send: the trust cookie stands in for one, and the server
        // decides again whether it still does.
        onPlace={() => {
          setFormErr('');
          verifyMutation.mutate('');
        }}
        onCancelOtp={() => setOtpOpen(false)}
        onEdit={() => resetDraft('')}
        onExpire={() => resetDraft('Checkout kedaluwarsa. Ulangi ya.')}
      />
    );
  }

  // Under live rates the chosen quote is the estimate, and it is a real
  // quoted price rather than a mirror of a server rule — so the summary can
  // say so instead of hedging.
  const free = { enabled: freeShipping, min: freeShippingMin };
  const estShipping = liveShipping
    ? estimateShipping(subtotal, quote ? { cost: quote.cost } : null, free)
    : estimateShipping(subtotal, couriers.find((c) => c.code === courier), free);

  // The order value a fee and a channel's bounds apply to: goods plus ongkir,
  // before the fee itself. Advisory, like everything on this side of the
  // draft, and it is what the tiles are measured against.
  const estBase = subtotal + estShipping;
  const notReady = storeNotReady({ couriers, paymentMethods, liveShipping });
  const blocked = notReady.shipping || notReady.payment;
  const estFee = estimatePaymentFee(estBase, paymentMethods.find((p) => p.code === method));

  return (
    <main
      aria-label="Checkout"
      style={{ flex: 1, maxWidth: 'var(--pc-max)', margin: '0 auto', padding: '36px var(--pc-gutter) 0', width: '100%' }}
    >
      <nav aria-label="Breadcrumb" className="pc-crumbs" style={{ marginBottom: 12 }}>
        <Link to="/">Beranda</Link>
        <span aria-hidden="true">/</span>
        <Link to="/keranjang">Keranjang</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Checkout</span>
      </nav>
      <h1 style={pageTitle}>Checkout</h1>

      {/* noValidate, deliberately: the browser's own constraint bubble fires
          before onSubmit and speaks the browser's language, so an Indonesian
          storefront was showing "Please include an '@' in the email address".
          type="email" is kept for the mobile keyboard; the message now comes
          from validateContact, which mirrors the server's wording exactly. */}
      <form
        noValidate
        onSubmit={submitForm}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}
      >
        <div style={{ flex: '1 1 480px', minWidth: 300, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <section style={card}>
            <StepTitle n={1}>Penerima</StepTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
              <Field label="Nama lengkap">
                <input
                  name="customer_name"
                  value={form.customer_name}
                  onChange={setField}
                  placeholder="Nama penerima"
                  autoComplete="name"
                  maxLength={LIMITS.customer_name}
                  style={field}
                />
              </Field>
              {/* Hidden under a WhatsApp tenant, where the contact field
                  already is the buyer's number: two inputs that must agree and
                  nothing making them agree. The server collapses the same way
                  -- see draftPhone. */}
              {!phoneAsked ? null : (
                <Field label="Nomor HP">
                  <input
                    name="phone"
                    value={form.phone}
                    onChange={setField}
                    placeholder="08xx xxxx xxxx"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={LIMITS.phone}
                    style={field}
                  />
                </Field>
              )}
            </div>
            <Field label={contactMeta.label} style={{ marginTop: 14 }}>
              <input
                name="contact"
                value={form.contact}
                onChange={setField}
                placeholder={contactMeta.placeholder}
                type={contactMeta.type}
                inputMode={contactMeta.inputMode}
                autoComplete={contactMeta.autoComplete}
                maxLength={LIMITS.contact}
                style={field}
              />
            </Field>
            <Field label="Alamat lengkap" style={{ marginTop: 14 }}>
              <textarea
                name="address"
                value={form.address}
                onChange={setField}
                placeholder="Nama jalan, nomor rumah, RT/RW, patokan"
                autoComplete="street-address"
                maxLength={LIMITS.address}
                rows={2}
                style={{ ...field, padding: '12px 14px', resize: 'vertical' }}
              />
            </Field>
            {liveShipping ? (
              // The provider quotes from a location id, not from an address,
              // so a free-text city cannot reach it. Picking here is what
              // makes a price exist at all.
              <DestinationPicker
                value={destination}
                onChange={(d) => {
                  setFormErr('');
                  setDestination(d);
                  // The old quote priced a different route. Dropping it means
                  // the buyer re-picks while looking at the new list, rather
                  // than being refused one screen later.
                  setQuote(null);
                }}
              />
            ) : (
              <Field label="Kota" style={{ marginTop: 14 }}>
                <input
                  name="city"
                  value={form.city}
                  onChange={setField}
                  placeholder="Kota atau kabupaten"
                  autoComplete="address-level2"
                  maxLength={LIMITS.city}
                  style={field}
                />
              </Field>
            )}
            <p style={{ fontSize: 13, color: 'var(--pc-muted)', margin: '10px 0 0' }}>
              Kode verifikasi dikirim ke {contactMeta.noun} ini.
            </p>
          </section>

          <section style={card}>
            <StepTitle n={2}>Pengiriman</StepTitle>
            {liveShipping ? (
              <ShippingRates
                destination={destination}
                items={cartItems}
                selected={quote?.quote_id ?? ''}
                onSelect={setQuote}
                onRetry={() => {
                  setDestination(null);
                  setQuote(null);
                }}
              />
            ) : notReady.shipping ? (
              <div style={notReadyBox}>
                Toko ini belum mengatur pengiriman. Hubungi penjual sebelum memesan.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {couriers.map((c) => (
                  <OptionTile key={c.code} selected={courier === c.code} onClick={() => setCourier(c.code)} logo={c.logo_url} aside={<strong>{fmt(c.cost)}</strong>}>
                    <strong style={{ fontSize: 15 }}>{c.name}</strong>
                    {c.eta ? <span style={{ color: 'var(--pc-muted)', fontSize: 13 }}>Estimasi {c.eta}</span> : null}
                  </OptionTile>
                ))}
              </div>
            )}
          </section>

          <section style={card}>
            <StepTitle n={3}>Pembayaran</StepTitle>
            {notReady.payment ? (
              <div style={notReadyBox}>
                Toko ini belum mengatur metode pembayaran. Hubungi penjual sebelum memesan.
              </div>
            ) : null}
            <div style={{ display: 'grid', gap: 10 }}>
              {paymentMethods.map((p) => {
                const fits = methodFits(p, estBase);
                const fee = estimatePaymentFee(estBase, p);
                return (
                  <OptionTile
                    key={p.code}
                    selected={method === p.code}
                    disabled={!fits}
                    onClick={() => fits && setMethod(p.code)}
                    logo={p.logo_url}
                    aside={<span style={{ color: 'var(--pc-muted)', fontSize: 13 }}>{fee > 0 ? `+${fmt(fee)}` : 'Tanpa biaya'}</span>}
                  >
                    <strong style={{ fontSize: 15 }}>{p.name}</strong>
                    {p.sub ? <span style={{ color: 'var(--pc-muted)', fontSize: 13 }}>{p.sub}</span> : null}
                    {/*
                      Said here rather than after the draft is built: the
                      server refuses an out-of-range total too, but by then the
                      buyer has spent a verification code to find out.
                    */}
                    {!fits ? (
                      <div style={{ color: 'var(--pc-error)', fontSize: 12.5, marginTop: 2 }}>
                        {outOfRangeReason(p, estBase)}
                      </div>
                    ) : null}
                  </OptionTile>
                );
              })}
            </div>

            {/*
              Optional, and last: a code is something a buyer either has or
              does not. Whether it works is answered on the next screen,
              beside the total it changes: the server prices the code against
              the finished cart, so anything this field could say on its own
              would be a guess the summary might then contradict.
            */}
            <Field label="Kode voucher (opsional)" style={{ marginTop: 16 }}>
              <input
                value={voucherCode}
                onChange={(e) => setVoucherCode(normalizeVoucherInput(e.target.value))}
                maxLength={MAX_VOUCHER_LEN}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Masukkan kode"
                style={{ ...field, textTransform: 'uppercase', letterSpacing: 0.5 }}
              />
            </Field>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--pc-muted)', lineHeight: 1.6 }}>
              Potongannya muncul di ringkasan sebelum kamu bayar.
            </p>
          </section>
        </div>

        <aside className="pc-checkout-aside" style={{ ...card, flex: '1 1 340px', minWidth: 0 }}>
          <StepTitle>Ringkasan</StepTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            {lines
              .filter((l) => l.product)
              .map((l) => (
                <div key={l.key} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 44, flexShrink: 0 }}>
                    <Img
                      src={l.product.image}
                      srcSet={l.product.image_srcset}
                      sizes={SIZES.summaryLine}
                      alt={l.product.name}
                      ratio="1/1"
                      radius={8}
                      fallback={<Tile label={l.product.name} tintKey={l.product.category_key} size={14} />}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                    <div style={{ fontWeight: 600, color: 'var(--pc-deep)' }}>{l.product.name}</div>
                    <div style={{ color: 'var(--pc-muted)', fontSize: 13 }}>
                      {formatQty(l.item.qty, l.limits?.unit)} × {fmt(l.product.price)}
                      {l.label ? ` · ${l.label}` : ''}
                    </div>
                  </div>
                  <strong style={{ fontSize: 13.5 }}>{fmt(l.lineTotal)}</strong>
                </div>
              ))}
          </div>

          <SummaryRow label="Subtotal" value={fmt(subtotal)} />
          <SummaryRow
            label="Ongkir"
            value={
              (liveShipping ? !quote : !courier)
                ? 'Belum dipilih'
                : estShipping === 0
                  ? 'Gratis'
                  : fmt(estShipping)
            }
          />
          {estFee > 0 ? <SummaryRow label="Biaya admin" value={fmt(estFee)} /> : null}
          <p style={{ fontSize: 12, color: 'var(--pc-muted)', margin: '10px 0 0' }}>
            Perkiraan, termasuk biaya admin. Total pastinya muncul di langkah
            berikutnya.
          </p>

          {/* The wait, before the buyer commits to anything. Stated as a
              duration because no money has moved yet -- the clock starts at
              payment, so there is no date to give. */}
          {preorderLeadDays ? (
            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--pc-note)', margin: '10px 0 0' }}>
              {orderNote(preorderLeadDays)}.
            </p>
          ) : null}

          {/* Below the button, not above it. A message above pushed "Buat
              pesanan" down by its own height the instant it appeared — out
              from under the cursor that had just clicked it, so an impatient
              second click landed on nothing. role="alert" is what carries it
              to a screen reader, and that does not depend on being first. */}
          <button
            type="submit"
            className="hv-primary"
            disabled={draftMutation.isPending || isLoading || hasBlockers || blocked}
            style={{
              ...primaryButton,
              marginTop: 16,
              opacity: draftMutation.isPending || isLoading || hasBlockers || blocked ? 0.6 : 1,
            }}
          >
            {draftMutation.isPending ? 'Menghitung…' : 'Buat pesanan'}
          </button>

          {formErr ? (
            <div role="alert" style={errorBox}>
              {formErr}
            </div>
          ) : null}
        </aside>
      </form>
    </main>
  );
}

/**
 * The review step. Not optional: the draft is the first time the server prices
 * this cart, and it re-prices silently — there is no "price changed" field on
 * the wire. The buyer approves the real total here, before an OTP is spent,
 * and codes are capped at five per contact per hour.
 */
function Review({
  draft,
  cartPrices,
  courier,
  method,
  error,
  otp,
  otpOpen,
  sending,
  verifying,
  onSend,
  onReopenOtp,
  onVerify,
  onPlace,
  onCancelOtp,
  onEdit,
  onExpire,
}) {
  // A code already sent and still inside its five-minute window is the one the
  // buyer should be typing, not a reason to request another.
  const step = confirmStep({ otpRequired: draft.otp_required, otp });
  const liveCode = step === 'reopen';
  const skipsCode = step === 'place';
  const changed = draft.lines.filter((l) => {
    const before = cartPrices.get(lineKey(l));
    return before !== undefined && before !== l.unit_price;
  });

  return (
    <main
      aria-label="Konfirmasi pesanan"
      style={{ flex: 1, maxWidth: 640, margin: '0 auto', padding: '36px var(--pc-gutter) 0', width: '100%' }}
    >
      <h1 style={pageTitle}>Konfirmasi pesanan</h1>

      {changed.length > 0 ? (
        <div
          role="status"
          style={{
            background: 'var(--pc-tint)',
            border: '1px solid var(--pc-amber)',
            borderRadius: 16,
            padding: '14px 18px',
            marginBottom: 20,
          }}
        >
          <strong style={{ fontSize: 14.5 }}>Harga diperbarui</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13.5, color: 'var(--pc-body)' }}>
            {changed.map((l) => (
              <li key={lineKey(l)}>
                {l.name}: {fmt(cartPrices.get(lineKey(l)))} → <strong>{fmt(l.unit_price)}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section style={card}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
          {draft.lines.map((l) => (
            <div key={lineKey(l)} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
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
                  {fmt(l.unit_price)} × {formatQty(l.qty, l.unit)}
                  {l.promotion_name ? (
                    <span style={{ color: 'var(--pc-green)' }}> · {l.promotion_name}</span>
                  ) : null}
                </div>
              </div>
              <strong style={{ fontSize: 14 }}>{fmt(l.line_total)}</strong>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--pc-line)', paddingTop: 14, display: 'grid', gap: 8 }}>
          <SummaryRow label="Subtotal" value={fmt(draft.subtotal)} />
          {/*
            Cart-scope promotions. The draft is the authority on all of this —
            the cart screen's own estimate does not know about them and will
            over-state, which is the safe direction for a surprise.
          */}
          {draft.discount_total > 0 ? (
            <SummaryRow
              label={voucherLabel(
                draft,
                draft.promotion_name ? `Diskon · ${draft.promotion_name}` : 'Diskon',
              )}
              value={`−${fmt(draft.discount_total)}`}
            />
          ) : null}
          <SummaryRow
            label={
              draft.shipping_promotion_name
                ? `Ongkir · ${courier?.name ?? ''} · ${draft.shipping_promotion_name}`
                : `Ongkir · ${courier?.name ?? ''}`
            }
            // Net, on one row: free-by-threshold and free-by-promotion are one
            // thing to the buyer.
            value={
              draft.shipping_cost - draft.shipping_discount === 0
                ? 'Gratis'
                : fmt(draft.shipping_cost - draft.shipping_discount)
            }
          />
          {/*
            One row, never the split between what the gateway takes and what
            the platform keeps — the buyer is paying one fee and has no use for
            its parts. Absent entirely when the shop absorbs the cost.
          */}
          {draft.payment_fee > 0 ? (
            <SummaryRow label="Biaya admin" value={fmt(draft.payment_fee)} />
          ) : null}
          {/*
            Shown here as well as on the order page, and for a reason beyond
            the footer adding up: this is the screen where the buyer decides
            the number is right. Meeting it for the first time in their banking
            app is how it gets rounded off.
          */}
          {draft.unique_code > 0 ? (
            <SummaryRow label="Kode unik" value={fmt(draft.unique_code)} />
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, marginTop: 4 }}>
            <span>Total</span>
            <span style={{ color: 'var(--pc-green)' }}>{fmt(draft.total)}</span>
          </div>
          {/* From the draft, not the cart: this is the number the buyer is
              about to spend a verification code approving, and every other row
              in this block comes from the same place. */}
          {draft.preorder_lead_days > 0 ? (
            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--pc-note)', margin: '12px 0 0' }}>
              {orderNote(draft.preorder_lead_days)}.
            </p>
          ) : null}
          {/*
            What happened to the code they typed. Under the total rather than
            beside the field: a refused code and a code that cost them money
            both matter at the moment they decide this number is right, and
            neither has a rupiah value that belongs in a row.
          */}
          {voucherNotes(draft).map((n, i) => (
            <p
              key={`v${i}`}
              style={{
                margin: i === 0 ? '10px 0 0' : 0,
                fontSize: 12.5,
                lineHeight: 1.6,
                fontWeight: n.tone === 'warn' ? 600 : 400,
                color: n.tone === 'warn' ? 'var(--pc-note)' : 'var(--pc-muted)',
              }}
            >
              {n.text}
            </p>
          ))}
        </div>

        <div style={{ marginTop: 16, fontSize: 13.5, color: 'var(--pc-body)', lineHeight: 1.7 }}>
          Bayar dengan <strong style={{ color: 'var(--pc-ink)' }}>{method?.name}</strong>
          <br />
          {/* Promising a code that is never sent is worse than saying nothing:
              the buyer would sit waiting for an email while their order is
              already placed. */}
          {skipsCode ? (
            <>
              Konfirmasi dikirim ke <strong style={{ color: 'var(--pc-ink)' }}>{draft.contact.masked}</strong>
            </>
          ) : (
            <>
              Kode verifikasi dikirim ke <strong style={{ color: 'var(--pc-ink)' }}>{draft.contact.masked}</strong>
            </>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--pc-muted)' }}>
          Berlaku <CountdownClock until={draft.expires_at} onExpire={onExpire} /> lagi
        </div>

        {error ? (
          <div role="alert" style={errorBox}>
            {error}
          </div>
        ) : null}

        <button
          type="button"
          className="hv-primary"
          onClick={skipsCode ? onPlace : liveCode ? onReopenOtp : onSend}
          disabled={sending || verifying}
          style={{ ...primaryButton, marginTop: 18, opacity: sending || verifying ? 0.6 : 1 }}
        >
          {skipsCode
            ? verifying
              ? 'Membuat pesanan…'
              : 'Buat pesanan'
            : sending
              ? 'Mengirim…'
              : liveCode
                ? 'Masukkan kode'
                : 'Kirim kode verifikasi'}
        </button>
        <button
          type="button"
          onClick={onEdit}
          style={{ width: '100%', marginTop: 10, fontSize: 14, fontWeight: 600, color: 'var(--pc-body)' }}
        >
          Ubah pesanan
        </button>
      </section>

      {otp && otpOpen ? (
        <OtpModal
          otp={otp}
          draftId={draft.draft_id}
          verifying={verifying}
          onVerify={onVerify}
          onResend={onSend}
          resending={sending}
          onCancel={onCancelOtp}
        />
      ) : null}
    </main>
  );
}

/**
 * The design's radio card. Dimmed rather than hidden when disabled: a buyer
 * whose cart is too large for a virtual account needs to see that the method
 * exists and why it is unavailable, or they will conclude the shop is broken.
 */
function OptionTile({ selected, onClick, disabled, aside, logo, children }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick} disabled={disabled} className="pc-choice">
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span className="pc-radio" aria-hidden="true" />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>{children}</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 'none' }}>
        {/* Decorative: the name beside it already says what it is. */}
        {logo ? <img className="pc-choice-logo" src={logo} alt="" /> : null}
        {aside}
      </span>
    </button>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14.5 }}>
      <span style={{ color: 'var(--pc-body)' }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

// The arithmetic lives in src/lib/checkout.js, shared with every storefront
// bundle; re-exported here so this screen's test keeps its seam.
export { confirmStep, estimatePaymentFee, estimateShipping, methodFits };

/** Why this cart cannot use this method, in the buyer's terms. */
export function outOfRangeReason(method, base) {
  const min = method?.min_order_total ?? 0;
  const max = method?.max_order_total ?? 0;
  if (min > 0 && base < min) return `Minimal ${fmt(min)} untuk metode ini.`;
  if (max > 0 && base > max) return `Maksimal ${fmt(max)} untuk metode ini.`;
  return '';
}

const LABELS = {
  customer_name: 'Nama',
  address: 'Alamat',
  city: 'Kota',
  contact: 'Kontak',
  phone: 'Nomor HP',
};

/**
 * Which required fields are still empty, in the order they appear on screen.
 *
 * Exported for its own test: it is the part that decides what the buyer is
 * told, and it was wrong for as long as it was inline.
 *
 * The destination is a picked object under live rates and free text under flat
 * ones, so the two modes disagree on the label as well as the check.
 *
 * phoneAsked is false under a WhatsApp tenant, where the contact field already
 * holds the number and no second input is rendered to leave empty.
 */
export function missingFields({ form, liveShipping, destination, contactLabel, phoneAsked = true }) {
  const out = [];
  if (!form.customer_name.trim()) out.push(LABELS.customer_name.toLowerCase());
  if (!String(form.contact ?? '').trim()) out.push(contactLabel.toLowerCase());
  if (phoneAsked && !String(form.phone ?? '').trim()) out.push(LABELS.phone.toLowerCase());
  if (!form.address.trim()) out.push(LABELS.address.toLowerCase());
  if (liveShipping) {
    if (!destination) out.push('tujuan pengiriman');
  } else if (!form.city.trim()) {
    out.push(LABELS.city.toLowerCase());
  }
  return out;
}

/** "nama, alamat, dan kota" — an Indonesian list, serial "dan", no comma. */
export function listPhrase(items) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} dan ${items[items.length - 1]}`;
}

const pageTitle = {
  fontFamily: 'var(--pc-display)',
  fontSize: 'clamp(30px, 3.4vw, 40px)',
  fontWeight: 700,
  margin: '0 0 24px',
};

const primaryButton = {
  width: '100%',
  minHeight: 50,
  background: 'var(--pc-green)',
  color: 'var(--pc-white)',
  borderRadius: 8,
  padding: '0 26px',
  fontWeight: 700,
  fontSize: 15,
};

/** The design's card heading: the step's number in a green circle. */
function StepTitle({ n, children }) {
  return (
    <h2 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 19 }}>
      {n ? <span className="pc-step">{n}</span> : null}
      {children}
    </h2>
  );
}

/** A labelled field, the design's label-above-input. */
function Field({ label, children, style }) {
  return (
    <label className="pc-label" style={style}>
      {label}
      {children}
    </label>
  );
}

// The merchant's gap, not the buyer's mistake: said inside the section it
// concerns, in the section's own muted tone rather than the error red.
const notReadyBox = { color: 'var(--pc-body)', fontSize: 13.5, lineHeight: 1.6 };

const errorBox = {
  background: 'var(--pc-error-bg)',
  color: 'var(--pc-error-ink)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
  marginTop: 14,
  lineHeight: 1.6,
};
