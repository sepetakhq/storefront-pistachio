import { useEffect, useState } from 'react';

/**
 * Renders a real, scannable QR from a payment payload.
 *
 * Lazily imported by the payment screen so the encoder is only downloaded by
 * a buyer who actually has a QR to scan — which, on the stub gateway, is
 * nobody. See PaymentPanel for why a stub payload never reaches here.
 */
export default function QrCode({ payload, size = 220 }) {
  const [dataUrl, setDataUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import('qrcode')
      .then((QR) =>
        QR.toDataURL(payload, {
          width: size * 2,
          margin: 1,
          // Literal on purpose: the encoder paints a canvas, which cannot read
          // CSS variables, and a scanner wants plain black on white anyway.
          color: { dark: '#000000', light: '#ffffff' },
        }),
      )
      .then((url) => !cancelled && setDataUrl(url))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [payload, size]);

  if (failed) {
    return (
      <p style={{ fontSize: 13, color: 'var(--pc-ink)' }}>
        Kode QR gagal dibuat. Gunakan metode pembayaran lain atau hubungi kami.
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
      {dataUrl ? (
        <img src={dataUrl} alt="Kode QRIS untuk pembayaran" width={size} height={size} />
      ) : (
        <span className="la-shimmer" style={{ width: '100%', height: '100%' }} />
      )}
    </div>
  );
}
