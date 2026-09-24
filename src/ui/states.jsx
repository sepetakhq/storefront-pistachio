// The states the prototype never had: loading, empty, and failure.
//
// These are utility moments, so they stay quiet — the storefront spends its
// boldness on product photography and the campaign strip. What they must not
// be is generic: a grey shimmer and a shrugging "something went wrong" would
// read as a different, colder product than the one around them. So the
// skeletons are woven from the same cream-to-blush the photography sits on,
// and every failure says what happened and what to do next.

const INK = 'var(--pc-ink)';
const MUTED = 'var(--pc-body)';
const PINK = 'var(--pc-ink)';
const CREAM = 'var(--pc-tint)';
const SERIF = 'var(--pc-display)';

/**
 * A shape that stands in for content while it loads.
 * `ratio` for images, `height` for text lines.
 */
export function Skeleton({ ratio, height, width = '100%', radius = 8, style }) {
  return (
    <div
      aria-hidden="true"
      className="la-shimmer"
      style={{
        aspectRatio: ratio,
        height: ratio ? undefined : height || 14,
        width,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

/** A product card placeholder, matching ProductCard's 4/5 frame. */
export function ProductCardSkeleton() {
  return (
    <div>
      <Skeleton ratio="4/5" radius={14} />
      <Skeleton height={13} width="70%" style={{ marginTop: 12 }} />
      <Skeleton height={13} width="40%" style={{ marginTop: 8 }} />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }) {
  return (
    <div className="product-grid">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * An empty screen is an invitation to act, so it always carries one.
 */
export function EmptyState({ title, body, action }) {
  return (
    <div style={panel}>
      <Rule />
      <h2 style={headline}>{title}</h2>
      {body ? <p style={bodyText}>{body}</p> : null}
      {action ? <div style={{ marginTop: 22 }}>{action}</div> : null}
    </div>
  );
}

/**
 * Failures explain themselves and offer the next move. They do not apologise
 * and they are never vague about what happened.
 *
 * `error` is an ApiError whose message is the server's own Indonesian copy,
 * written for buyers — so it is rendered as-is rather than replaced.
 */
export function ErrorState({ error, onRetry, title, action }) {
  const message = error?.message || 'Halaman ini gagal dimuat.';
  return (
    <div style={panel}>
      <Rule tone={PINK} />
      <h2 style={headline}>{title || 'Gagal memuat'}</h2>
      <p style={bodyText}>{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} style={primaryButton} className="hv-dark">
          Coba lagi
        </button>
      ) : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
      {error?.requestId ? (
        // Turns "it broke" into a log query, without shouting at the buyer.
        <p style={{ ...bodyText, fontSize: 11, color: 'var(--pc-muted-2)', marginTop: 18 }}>
          Kode kesalahan: {error.requestId.slice(0, 8)}
        </p>
      ) : null}
    </div>
  );
}

/** An inline failure that must not take over the page. */
export function InlineError({ error, onRetry }) {
  return (
    <div
      role="alert"
      style={{
        background: 'var(--pc-mist)',
        border: '1px solid var(--pc-mist)',
        borderRadius: 12,
        padding: '12px 14px',
        fontSize: 13,
        color: INK,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <span>{error?.message || 'Gagal memuat.'}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{ color: PINK, fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}
          className="hv-pink"
        >
          Coba lagi
        </button>
      ) : null}
    </div>
  );
}

/** A short rule, the one structural mark these panels carry. */
function Rule({ tone = 'var(--pc-line)' }) {
  return <div style={{ width: 36, height: 2, background: tone, margin: '0 auto 22px' }} />;
}

const panel = {
  textAlign: 'center',
  padding: '56px 24px',
  maxWidth: 420,
  margin: '0 auto',
};

const headline = {
  fontFamily: SERIF,
  fontWeight: 600,
  fontSize: 26,
  color: INK,
  margin: 0,
  letterSpacing: '0.01em',
};

const bodyText = {
  fontSize: 14,
  lineHeight: 1.65,
  color: MUTED,
  margin: '10px 0 0',
};

const primaryButton = {
  marginTop: 22,
  background: INK,
  color: CREAM,
  borderRadius: 8,
  padding: '11px 26px',
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '0.02em',
};
