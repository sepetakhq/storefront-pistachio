import { useState } from 'react';

/**
 * Renders a QR the payment provider drew for us, from a URL to the image.
 *
 * The twin of QrCode, and deliberately identical from the frame outwards: a
 * buyer must not be able to tell which gateway served their order. What
 * differs is where the picture comes from, so this one is not lazily imported
 * — there is no encoder to withhold, and a `lazy()` here would only add a
 * network round trip before the image request could even start.
 *
 * The provider stops serving the image once the transaction ends, so a failure
 * is a normal event on an expired order rather than an exception. It is
 * reported in place, because the amount and the deadline above it are still
 * worth reading.
 */
export default function QrImage({ url, size = 220 }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (failed) {
    return (
      <p style={{ fontSize: 13, color: 'var(--pc-ink)', maxWidth: 220, lineHeight: 1.7 }}>
        Kode QR tidak bisa dimuat. Muat ulang halaman ini, atau hubungi kami untuk menyelesaikan
        pesanan.
      </p>
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        background: 'var(--pc-white)',
        borderRadius: 16,
        border: '1px solid var(--pc-line)',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Both children occupy the same cell, so the shimmer gives way to the
          code without the panel resizing under the buyer's thumb. */}
      <img
        src={url}
        alt="Kode QRIS untuk pembayaran"
        width={size}
        height={size}
        // The storefront's own address is not the provider's business.
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={{ gridArea: '1 / 1', display: loaded ? 'block' : 'none' }}
      />
      {loaded ? null : (
        <span className="la-shimmer" style={{ gridArea: '1 / 1', width: '100%', height: '100%' }} />
      )}
    </div>
  );
}
