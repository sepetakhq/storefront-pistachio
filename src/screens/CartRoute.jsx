import { Link } from 'react-router-dom';

import { Img, SIZES } from '../ui/Img.jsx';
import { Tile } from '../components/Tile.jsx';
import { EmptyState, InlineError, Skeleton } from '../ui/states.jsx';
import { useCart } from '@sepetakhq/storefront-kit/cart/CartProvider';
import { stepQty } from '@sepetakhq/storefront-kit/shared/qty';
import { useCartLines } from '@sepetakhq/storefront-kit/cart/useCartLines';
import { useConfig } from '@sepetakhq/storefront-kit/config/ConfigProvider';
import { orderNote, shortNote } from '@sepetakhq/storefront-kit/lib/preorder';
import { blockerNotice, windowNote } from '@sepetakhq/storefront-kit/lib/availability';
import { didPurgeLegacy } from '@sepetakhq/storefront-kit/lib/storage';
import { fmt, formatQty } from '@sepetakhq/storefront-kit/shared/format';

import { freeShippingProgress } from '../lib/copy.js';

export default function CartRoute() {
  return (
    <main aria-label="Keranjang" style={{ flex: 1, width: '100%' }}>
      <div className="pc-pagehead">
        <div className="pc-inner" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <nav className="pc-crumbs" aria-label="Lokasi">
            <Link to="/">Beranda</Link>
            <span>/</span>
            <span aria-current="page">Keranjang</span>
          </nav>
          <h1>Keranjang</h1>
        </div>
      </div>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px var(--pc-gutter) 0' }}>
        <CartBody />
      </div>
    </main>
  );
}

/**
 * The cart itself: free-shipping progress, one row per line, the estimate
 * and the way to checkout. The /keranjang page and the header's drawer both
 * render this, so the two can never disagree about a line.
 *
 * @param {() => void} [onNavigate] called when a link leaves the cart (the
 *   drawer closes itself with it)
 */
export function CartBody({ onNavigate }) {
  const { freeShipping, freeShippingMin } = useConfig();
  const cart = useCart();
  const { lines, statuses, subtotal, isLoading, hasBlockers, preorderLeadDays } = useCartLines();

  if (cart.isEmpty) {
    return (
      <EmptyState
        title="Keranjangmu masih kosong"
        body={
          didPurgeLegacy()
            ? 'Keranjang lama direset karena katalognya sudah diperbarui. Pilih lagi produk favoritmu.'
            : 'Belum ada yang dipilih. Tambahkan produk favoritmu dulu.'
        }
        action={
          <Link to="/katalog" className="pc-btn pc-btn-primary" onClick={onNavigate}>
            Mulai belanja
          </Link>
        }
      />
    );
  }

  const progress = freeShipping ? freeShippingProgress(subtotal, freeShippingMin) : null;
  const blocked = hasBlockers || isLoading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Nothing to make progress towards once the offer is switched off. */}
      {progress && (
        <div style={{ background: 'var(--pc-tint)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--pc-deep)' }}>{progress.text}</span>
          <div className="pc-progress" aria-hidden="true">
            <div style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {lines.map((line) => (
          <CartLine key={line.key} line={line} onQty={cart.setQty} onRemove={cart.remove} onNavigate={onNavigate} />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Row label="Perkiraan subtotal" value={isLoading ? '…' : fmt(subtotal)} />
        {/* The authoritative price appears once, at the draft. Saying so here
            is more honest than a total that can change at the next step. */}
        <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--pc-muted)', margin: 0 }}>
          Harga final, ongkir, diskon, dan kode unik dihitung saat checkout.
        </p>

        {/* Before the checkout button: the wait is part of what the buyer
            agrees to, and one order ships once so the slowest line sets it. */}
        {preorderLeadDays ? (
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--pc-note)', margin: 0 }}>{orderNote(preorderLeadDays)}.</p>
        ) : null}

        {hasBlockers ? (
          <div role="alert" style={{ background: 'var(--pc-note-bg)', color: 'var(--pc-note-ink)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
            {blockerNotice(statuses)}
          </div>
        ) : null}

        <Link
          to="/checkout"
          className="pc-btn pc-btn-primary"
          aria-disabled={blocked}
          onClick={(e) => {
            if (blocked) e.preventDefault();
            else onNavigate?.();
          }}
          style={blocked ? { background: 'var(--pc-disabled)', color: 'var(--pc-muted)', cursor: 'not-allowed' } : undefined}
        >
          Checkout
        </Link>
      </div>
    </div>
  );
}

function CartLine({ line, onQty, onRemove, onNavigate }) {
  const { item, key, product, label, status, error, refetch, available, preorder } = line;
  const remove = () => onRemove(key);

  if (status === 'loading') {
    return (
      <div style={row}>
        <Skeleton ratio="1/1" radius={8} style={{ width: 64, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <Skeleton height={15} width="60%" />
          <Skeleton height={13} width="30%" style={{ marginTop: 10 }} />
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={row}>
        <div style={{ flex: 1 }}>
          <InlineError error={error} onRetry={refetch} />
        </div>
      </div>
    );
  }

  // A 404 means the product was unpublished or deleted -- or the variant this
  // line named no longer exists. The only useful action left is removing it.
  if (status === 'gone') {
    return (
      <div style={row}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--pc-body)' }}>
            {product ? 'Varian sudah tidak tersedia' : 'Produk sudah tidak tersedia'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--pc-muted)', marginTop: 4 }}>{product?.name ?? item.slug}</div>
        </div>
        <button type="button" onClick={remove} style={removeButton}>
          Hapus
        </button>
      </div>
    );
  }

  // The product grew variants after this line was added, so it names none.
  if (status === 'variant_required') {
    return (
      <div style={row}>
        <Thumb product={product} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link to={`/produk/${product.slug}`} onClick={onNavigate} style={nameLink}>
            {product.name}
          </Link>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--pc-note)', marginTop: 6 }}>
            Produk ini sekarang punya varian.{' '}
            <Link to={`/produk/${product.slug}`} onClick={onNavigate}>
              Pilih varian
            </Link>
            , lalu hapus baris ini.
          </div>
        </div>
        <button type="button" onClick={remove} style={removeButton}>
          Hapus
        </button>
      </div>
    );
  }

  // Sold out, scheduled and ended share one presentation: the line stays,
  // priced and pictured, and the stepper goes away because there is no
  // quantity to choose. The sentence underneath says which.
  const blocked = status === 'soldout' || status === 'scheduled' || status === 'ended';
  const note = windowNote(product);

  return (
    <div style={row}>
      <Thumb product={product} dim={blocked} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Link to={`/produk/${product.slug}`} onClick={onNavigate} style={nameLink}>
          {product.name}
        </Link>
        <span style={{ fontSize: 13, color: 'var(--pc-muted)' }}>
          {label ? `${label} · ` : ''}
          {fmt(product.price)}
        </span>

        {status === 'soldout' ? (
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--pc-sale)' }}>Stok habis</span>
        ) : note ? (
          // A scheduled line is the one blocker the buyer can act on -- come
          // back when it opens -- so it says when.
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--pc-note)' }}>{note.text}</span>
        ) : status === 'overstock' ? (
          <span style={{ fontSize: 13, color: 'var(--pc-note)' }}>
            Tersisa {formatQty(available, line.limits.unit)}.{' '}
            <button type="button" onClick={() => onQty(key, available)} style={{ color: 'var(--pc-green)', fontWeight: 700 }}>
              Sesuaikan
            </button>
          </span>
        ) : preorder ? (
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--pc-note)' }}>{shortNote(product)}</span>
        ) : null}

        {!blocked && (
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--pc-line-2)', borderRadius: 6, alignSelf: 'flex-start', marginTop: 2 }}>
            <button type="button" aria-label="Kurangi jumlah" onClick={() => { const n = stepQty(item.qty, -1, line.limits); return n === 0 ? onRemove(key) : onQty(key, n); }} style={qtyButton}>
              −
            </button>
            <span style={{ minWidth: 26, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{formatQty(item.qty, line.limits.unit)}</span>
            <button
              type="button"
              aria-label="Tambah jumlah"
              disabled={stepQty(item.qty, 1, line.limits) > Math.min(line.limits.max, available)}
              onClick={() => onQty(key, stepQty(item.qty, 1, line.limits))}
              style={qtyButton}
            >
              +
            </button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{fmt(line.lineTotal)}</span>
        <button type="button" onClick={remove} style={removeButton}>
          Hapus
        </button>
      </div>
    </div>
  );
}

function Thumb({ product, dim }) {
  return (
    <div style={{ width: 64, flexShrink: 0 }}>
      <Img
        src={product.image}
        srcSet={product.image_srcset}
        sizes={SIZES.cartLine}
        alt={product.name}
        ratio="1/1"
        radius={8}
        style={dim ? { opacity: 0.55 } : undefined}
        fallback={<Tile label={product.name} tintKey={product.category_key} size={16} />}
      />
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
      <span style={{ color: 'var(--pc-body)' }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const row = { display: 'flex', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--pc-hover)', alignItems: 'flex-start' };
const nameLink = { fontWeight: 600, fontSize: 14, color: 'var(--pc-deep)' };
const qtyButton = { width: 34, height: 32, fontSize: 16 };
const removeButton = { color: 'var(--pc-muted)', fontSize: 13, fontWeight: 600 };
