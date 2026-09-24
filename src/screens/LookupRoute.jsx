import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';

import { sendLookupCode, verifyLookupCode } from '@sepetakhq/storefront-kit/api/endpoints';
import { useConfig } from '@sepetakhq/storefront-kit/config/ConfigProvider';
import { courierName } from '../lib/copy.js';
import { contactField, normalizeContact, validateContact } from '@sepetakhq/storefront-kit/lib/contact';
import { extractToken, forgetOrder, listOrders } from '@sepetakhq/storefront-kit/checkout/orderTokens';
import { deviceRows, tokensOf } from '@sepetakhq/storefront-kit/lib/deviceOrders';
import { useOrdersByToken } from '@sepetakhq/storefront-kit/hooks/queries';
import { recordRetryAfter, recordSend, cooldown } from '@sepetakhq/storefront-kit/checkout/otpCooldown';
import { CountdownWords } from '../ui/Countdown.jsx';
import { fmt, fmtDateTime } from '@sepetakhq/storefront-kit/shared/format';

const card = { background: 'var(--pc-white)', border: '1px solid var(--pc-line)', borderRadius: 12, padding: 28, boxShadow: '0 18px 40px var(--pc-shadow-sm)' };
const field = {
  border: '1px solid var(--pc-line)',
  borderRadius: 12,
  padding: '12px 14px',
  fontSize: 14.5,
  background: 'var(--pc-white)',
  width: '100%',
};

/**
 * Finding an order again.
 *
 * The prototype offered "enter your order number". No endpoint supports that,
 * and building one would be an unauthenticated lookup over a guessable
 * identifier — its absence is a security property, not a gap. So there are
 * three honest routes back in, in descending order of how well they work.
 */
export default function LookupRoute() {
  const { contactChannel } = useConfig();
  const meta = contactField(contactChannel);
  const navigate = useNavigate();

  // Read once, then held in state so removing a dead row re-renders. This list
  // is the buyer's own copy of tokens no endpoint can reissue.
  const [deviceOrders, setDeviceOrders] = useState(listOrders);
  const deviceChecks = useOrdersByToken(tokensOf(deviceOrders));
  const rows = deviceRows(deviceOrders, deviceChecks);

  const dropRow = (token) => {
    forgetOrder(token);
    setDeviceOrders((list) => list.filter((o) => o.token !== token));
  };
  const [link, setLink] = useState('');
  const [linkErr, setLinkErr] = useState('');
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(null);
  const [err, setErr] = useState('');
  const [orders, setOrders] = useState(null);

  const scope = normalizeContact(contactChannel, contact);
  const cool = sent ? cooldown(scope) : null;
  const cooling = Boolean(cool?.nextAllowedAt) && Date.parse(cool.nextAllowedAt) > Date.now();

  const sendMutation = useMutation({
    mutationFn: () => sendLookupCode(scope),
    onSuccess: (res) => {
      recordSend(scope);
      setErr('');
      setSent(res);
    },
    onError: (e) => {
      if (e?.status === 429 && e.retryAfter) recordRetryAfter(scope, e.retryAfter);
      setErr(e?.message || 'Gagal mengirim kode.');
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => verifyLookupCode(scope, code),
    onSuccess: (list) => {
      setErr('');
      setOrders(list);
    },
    onError: (e) => setErr(e?.message || 'Verifikasi gagal.'),
  });

  const openLink = (e) => {
    e.preventDefault();
    const token = extractToken(link);
    if (!token) return setLinkErr('Tautan atau kode pesanan tidak dikenali.');
    setLinkErr('');
    navigate(`/pesanan/${token}`);
  };

  const startLookup = (e) => {
    e.preventDefault();
    const invalid = validateContact(contactChannel, contact);
    if (invalid) return setErr(invalid);
    setErr('');
    sendMutation.mutate();
  };

  return (
    <main aria-label="Lacak pesanan">
      <section className="pc-pagehead" style={{ paddingTop: 40, paddingBottom: 72 }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <nav aria-label="Breadcrumb" className="pc-crumbs">
            <Link to="/">Beranda</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Lacak pesanan</span>
          </nav>
          <h1 style={{ margin: 0, fontSize: 'clamp(32px, 4vw, 44px)', lineHeight: 1.1, fontWeight: 700 }}>Lacak pesanan</h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: 'var(--pc-body)', textWrap: 'pretty' }}>
            Buka pesananmu lewat tautan yang kami kirim, atau cari dengan {meta.noun} yang kamu pakai saat belanja.
          </p>
        </div>
      </section>
      <div style={{ maxWidth: 760, margin: '-40px auto 0', padding: '0 var(--pc-gutter)', display: 'flex', flexDirection: 'column' }}>

      {rows.length > 0 ? (
        <section style={{ ...card, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Pesanan dari perangkat ini</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((o) =>
              o.state === 'gone' ? (
                // Not a link. It points at nothing, and letting the buyer
                // click through to "Pesanan tidak ditemukan" with no way back
                // is how this row stayed in the list for good.
                <div key={o.token} style={{ ...deviceRow, ...deviceRowGone }}>
                  <span>
                    <strong style={{ textDecoration: 'line-through' }}>{o.number}</strong>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--pc-body)' }}>
                      Pesanan ini sudah tidak ada.
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => dropRow(o.token)}
                    style={{
                      background: 'none',
                      border: 0,
                      cursor: 'pointer',
                      color: 'var(--pc-green)',
                      fontWeight: 700,
                      fontSize: 13,
                      padding: 0,
                    }}
                  >
                    Hapus
                  </button>
                </div>
              ) : (
                <Link key={o.token} to={`/pesanan/${o.token}`} className="hv-bd-pink" style={deviceRow}>
                  <span>
                    <strong>{o.number}</strong>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--pc-body)' }}>
                      {fmtDateTime(o.placedAt)}
                      {o.statusLabel ? ` · ${o.statusLabel}` : ''}
                    </span>
                  </span>
                  <strong style={{ fontSize: 14 }}>{o.total ? fmt(o.total) : ''}</strong>
                </Link>
              ),
            )}
          </div>
        </section>
      ) : null}

      <section style={{ ...card, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Punya tautan pesanan?</div>
        <p style={{ fontSize: 13.5, color: 'var(--pc-body)', margin: '0 0 12px', lineHeight: 1.6 }}>
          Tempel tautan dari email konfirmasimu.
        </p>
        <form onSubmit={openLink} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Tempel tautan atau kode pesanan"
            aria-label="Tautan pesanan"
            style={{ ...field, flex: '1 1 240px', width: 'auto' }}
          />
          <button type="submit" className="hv-dark" style={{ ...darkButton, marginTop: 0 }}>
            Buka
          </button>
        </form>
        {linkErr ? (
          <div role="alert" style={{ color: 'var(--pc-ink)', fontSize: 13, marginTop: 10 }}>
            {linkErr}
          </div>
        ) : null}
      </section>

      <section style={card}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Cari dengan {meta.noun}</div>
        <p style={{ fontSize: 13.5, color: 'var(--pc-body)', margin: '0 0 14px', lineHeight: 1.6 }}>
          Kami kirim kode verifikasi, lalu tampilkan pesanan yang terhubung ke {meta.noun} itu.
        </p>

        {orders ? (
          <LookupResults orders={orders} />
        ) : !sent ? (
          <form onSubmit={startLookup} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={meta.placeholder}
              aria-label={meta.label}
              type={meta.type}
              inputMode={meta.inputMode}
              autoComplete={meta.autoComplete}
              style={{ ...field, flex: '1 1 240px', width: 'auto' }}
            />
            <button
              type="submit"
              className="hv-primary"
              disabled={sendMutation.isPending}
              style={{ ...primaryButton, width: 'auto', opacity: sendMutation.isPending ? 0.6 : 1 }}
            >
              {sendMutation.isPending ? 'Mengirim…' : 'Kirim kode'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verifyMutation.mutate();
            }}
            style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Kode 6 digit"
              aria-label="Kode verifikasi"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              style={{ ...field, flex: '1 1 160px', width: 'auto', letterSpacing: '0.3em', fontWeight: 700 }}
            />
            <button
              type="submit"
              className="hv-primary"
              disabled={code.length !== 6 || verifyMutation.isPending}
              style={{
                ...primaryButton,
                width: 'auto',
                opacity: code.length !== 6 || verifyMutation.isPending ? 0.6 : 1,
              }}
            >
              {verifyMutation.isPending ? 'Memeriksa…' : 'Lihat pesanan'}
            </button>
            <div style={{ flexBasis: '100%', fontSize: 13, color: 'var(--pc-body)' }}>
              Kode dikirim ke {sent.masked}.{' '}
              <button
                type="button"
                disabled={cooling || sendMutation.isPending}
                onClick={() => sendMutation.mutate()}
                style={{ color: cooling ? 'var(--pc-muted)' : 'var(--pc-green)', fontWeight: 600 }}
              >
                {cooling ? (
                  <>
                    Kirim ulang dalam <CountdownWords until={cool.nextAllowedAt} />
                  </>
                ) : (
                  'Kirim ulang'
                )}
              </button>
            </div>
          </form>
        )}

        {err ? (
          <div role="alert" style={{ color: 'var(--pc-ink)', fontSize: 13, marginTop: 12, lineHeight: 1.6 }}>
            {err}
          </div>
        ) : null}
      </section>
      </div>
    </main>
  );
}

/**
 * The lookup response carries no track token and no payment block — tokens are
 * stored hashed and are genuinely unrecoverable. So these render in full here
 * and deliberately do not link anywhere: there is nowhere to link to.
 */
function LookupResults({ orders }) {
  const { couriers } = useConfig();
  if (orders.length === 0) {
    return (
      <p style={{ fontSize: 14, color: 'var(--pc-body)', lineHeight: 1.7, margin: 0 }}>
        Tidak ada pesanan yang terhubung ke kontak ini.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 15 }}>
        <strong>{orders.length} pesanan</strong> untuk kontak ini
      </div>
      {orders.map((o) => (
        <article key={o.id} style={{ border: '1px solid var(--pc-line)', borderRadius: 12, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong style={{ fontSize: 16, fontWeight: 700 }}>{o.number}</strong>
              <span style={{ fontSize: 13, color: 'var(--pc-muted)' }}>{fmtDateTime(o.placed_at)}</span>
            </div>
            {/* The server's label, never a local table: a webhook can move
                the status before this page learns the new words. */}
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--pc-deep)', background: 'var(--pc-mist)', padding: '6px 12px', borderRadius: 999 }}>{o.status_label}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(o.lines ?? []).map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                <span style={{ minWidth: 0 }}>
                  {l.name}
                  {l.variant_label ? ` · ${l.variant_label}` : ''} <span style={{ color: 'var(--pc-muted)' }}>× {l.qty}</span>
                </span>
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(l.line_total)}</span>
              </div>
            ))}
          </div>
          {o.timeline?.length > 0 && (
            <ol aria-label="Status pesanan" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
              {o.timeline.map((t) => (
                <li key={t.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span aria-hidden="true" style={{ height: 4, borderRadius: 999, background: t.done ? 'var(--pc-green)' : 'var(--pc-line)' }} />
                  <span style={{ fontSize: 12, fontWeight: t.done ? 600 : 500, color: t.done ? 'var(--pc-ink)' : 'var(--pc-muted)' }}>
                    {t.label}
                    <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{t.done ? ' (selesai)' : ''}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 14, borderTop: '1px solid var(--pc-line)' }}>
            {o.awb ? (
              <span style={{ font: '500 12px ui-monospace, Menlo, monospace', color: 'var(--pc-body)' }}>
                {[courierName(couriers, o.courier_code), o.awb].filter(Boolean).join(' · ')}
              </span>
            ) : null}
            <span style={{ fontSize: 16, fontWeight: 700, marginLeft: 'auto' }}>Total {fmt(o.total)}</span>
          </div>
          {o.status === 'awaiting_payment' ? (
            <p style={{ fontSize: 13, color: 'var(--pc-note)', background: 'var(--pc-tint)', borderRadius: 10, padding: '10px 12px', margin: '12px 0 0', lineHeight: 1.6 }}>
              Instruksi pembayaran ada di email konfirmasimu — buka tautan di sana untuk
              menyelesaikannya.
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

const primaryButton = {
  background: 'var(--pc-green)',
  color: 'var(--pc-white)',
  borderRadius: 12,
  padding: '13px 26px',
  fontWeight: 700,
  fontSize: 15,
};

const darkButton = {
  display: 'inline-block',
  background: 'var(--pc-ink)',
  color: 'var(--pc-white)',
  borderRadius: 12,
  padding: '13px 24px',
  fontWeight: 700,
  fontSize: 14.5,
};

const deviceRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  border: '1px solid var(--pc-line)',
  borderRadius: 14,
  padding: '12px 14px',
  color: 'var(--pc-ink)',
};

// A dead row stays visible rather than vanishing: a buyer who watches an order
// disappear from their own history has no idea whether they imagined it.
const deviceRowGone = {
  color: 'var(--pc-body)',
  background: 'var(--pc-soft)',
  borderStyle: 'dashed',
};
