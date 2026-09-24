import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import ProductCard from '../components/ProductCard.jsx';
import { Tile } from '../components/Tile.jsx';
import { Img, SIZES } from '../ui/Img.jsx';
import { EmptyState, ErrorState, Skeleton } from '../ui/states.jsx';
import { useProduct } from '@sepetakhq/storefront-kit/hooks/queries';
import { useCart } from '@sepetakhq/storefront-kit/cart/CartProvider';
import { isSoldOut, leadDays, maxQty } from '@sepetakhq/storefront-kit/lib/preorder';
import { buyLabel, isImminent, isScheduled, msUntilOpen, windowNote } from '@sepetakhq/storefront-kit/lib/availability';
import {
  availableValues,
  galleryFor,
  initialSelection,
  isPriceRange,
  matchVariant,
  select,
  withVariant,
} from '@sepetakhq/storefront-kit/lib/variants';
import { useConfig } from '@sepetakhq/storefront-kit/config/ConfigProvider';
import { useToast } from '@sepetakhq/storefront-kit/ui/ToastProvider';
import { fmt, fmtClock, paragraphs } from '@sepetakhq/storefront-kit/shared/format';

import Icon from '../ui/Icon.jsx';
import { useDrawer } from '../components/CartDrawer.jsx';
import { askLink, askMessage, detailNote, discountPct, pickPrompt, sectionText } from '../lib/copy.js';

const detailsRow = { borderBottom: '1px solid var(--pc-line)', padding: '14px 0' };
const summary = { fontFamily: 'var(--pc-display)', fontWeight: 600, fontSize: 17, color: 'var(--pc-deep)' };
const detailsText = { color: 'var(--pc-body)', fontSize: 15, lineHeight: 1.7, margin: '10px 0 0', textWrap: 'pretty', whiteSpace: 'pre-line' };

export default function ProductRoute() {
  const { slug } = useParams();
  const { data: product, isPending, isError, error, refetch } = useProduct(slug);

  if (isPending) return <ProductSkeleton />;

  if (isError) {
    // A 404 means unpublished or removed — not a failure to explain away.
    if (error?.status === 404) {
      return (
        <main style={{ flex: 1, padding: '60px 20px' }}>
          <EmptyState
            title="Produk tidak ditemukan"
            body="Produk ini sudah tidak tersedia. Produk lainnya masih ada di katalog."
            action={
              <Link to="/katalog" className="pc-btn pc-btn-primary">
                Lihat katalog
              </Link>
            }
          />
        </main>
      );
    }
    return (
      <main style={{ flex: 1, padding: '60px 20px' }}>
        <ErrorState error={error} onRetry={refetch} title="Produk gagal dimuat" />
      </main>
    );
  }

  // `key` resets the gallery index when navigating between products.
  return <ProductView key={slug} product={product} onOpen={refetch} />;
}

/**
 * Ticks a countdown to the opening, and asks the server when it runs out.
 *
 * The tick is cosmetic. Reaching zero never enables the buy button on its own
 * — it refetches the product and lets the server's next answer decide, because
 * the only clock that may open a sale is the one checkout enforces. A browser
 * running a few minutes fast would otherwise offer a drop early and hand the
 * buyer a 409 at the end of a form they had already filled in.
 *
 * Nothing is scheduled for a drop that is days away: a page re-rendering every
 * second for a week costs a phone its battery to say what one line of text
 * already said. See isImminent.
 */
function useOpeningCountdown(product, onOpen) {
  const [now, setNow] = useState(() => Date.now());
  const ticking = isScheduled(product) && isImminent(product, now);

  useEffect(() => {
    if (!ticking) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  const remaining = msUntilOpen(product, now);
  useEffect(() => {
    if (remaining === 0) onOpen?.();
  }, [remaining, onOpen]);

  if (!ticking || remaining === null) return null;
  return fmtClock(remaining);
}

function ProductView({ product, onOpen }) {
  const { brand, freeShipping, freeShippingMinLabel, copy } = useConfig();
  // The headings live on brand, where the provider shapes section_copy.
  // Reading them off the top level rendered a crash for every product page.
  const sections = brand.sections ?? {};
  const cart = useCart();
  const showToast = useToast();
  const drawer = useDrawer();

  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);
  const [broken, setBroken] = useState(() => new Set());

  // Which value is picked on each axis. Nothing is guessed beyond what
  // initialSelection allows, so a hurried buyer cannot be sold the wrong
  // colour by a default. `variant` is the one combination the picks name, or
  // null while a pick is missing or names nothing.
  const [selected, setSelected] = useState(() => initialSelection(product));
  const variant = matchVariant(product.variants, selected);
  // The product as judged for that variant -- its price, its stock -- so
  // every helper below reads the right number. Unchanged without variants.
  const sellable = withVariant(product, variant);
  const needsChoice = Boolean(product.has_variants) && !variant;
  const pick = (axis, value) => {
    setSelected((cur) => select(product, cur, axis, value));
    // A pick can change the photo and the stock ceiling, so the gallery and
    // the quantity restart from the top.
    setActive(0);
    setQty(1);
  };

  // The panel's three sections, resolved and then substituted, before anything
  // is gated on them.
  //
  // The server picked each line from the most specific tier that said anything
  // -- this product, then its category, then the shop -- so there is no
  // fallback left to apply here. What remains is substitution, which stays on
  // this side because the API deliberately does not own Rupiah formatting.
  //
  // The gates below read these and not the raw strings, because interpolation
  // is what decides whether a section has anything to say: a care copy whose
  // only sentence promises free shipping is withheld whole once the offer is
  // off, and "" is what is left. It does not then fall back to the category's
  // -- resolution happened on the stored text, and putting somebody else's
  // words where this merchant deliberately wrote their own would be worse than
  // saying nothing.
  const care = paragraphs(copy(product.care_copy));
  // Not run through copy(), and never was: routing a size line through the
  // free-shipping withholding rule would make it vanish with the offer.
  const spec = paragraphs(product.material_spec);
  const description = paragraphs(product.description);
  const hasPanel =
    description.length > 0 ||
    spec.length > 0 ||
    care.length > 0 ||
    Boolean(brand.productShippingCopy) ||
    freeShipping ||
    product.preorder;

  const all = product.images?.length
    ? product.images
    : [{ url: product.image, srcset: product.image_srcset, alt: product.name }];

  // An image whose bytes do not decode is dropped from the gallery rather than
  // left as a thumbnail that opens onto a blank frame. This is not theoretical:
  // a truncated upload is served as a 200 with content-type image/jpeg, and the
  // media worker marks the asset failed while the product still references it.
  const images = galleryFor(all, variant).filter((im) => !broken.has(im.url));
  const gallery = images.length ? images : all.slice(0, 1);
  const main = gallery[Math.min(active, gallery.length - 1)];

  // Stock is the variant's once one is picked; until then a variant product
  // says nothing about stock -- the picker is where that answer lives.
  const note = needsChoice ? '' : detailNote(sellable);
  const saleWindow = windowNote(product);
  // The server already accounts for pre-order in sold_out, and re-deriving it
  // from stock here is what used to refuse a made-to-order product.
  //
  // `blocked` is what the controls are gated on: sold out, closed, or not open
  // yet. `label` is the server's reason, rendered rather than guessed.
  const label = buyLabel(sellable);
  const blocked = isSoldOut(sellable) || Boolean(label);
  const max = maxQty(sellable);
  const countdown = useOpeningCountdown(product, onOpen);
  const disabled = blocked || needsChoice;

  // The design opens the cart beside the page on add, so the buyer sees the
  // line land and the way to checkout in one move.
  const add = () => {
    cart.add(product, qty, variant?.id ?? null);
    showToast(`${product.name} masuk keranjang`);
    drawer.show();
  };

  const off = discountPct(sellable);
  const unit = sellable.price;
  const cta = `${product.preorder ? 'Pre-order' : 'Tambah ke keranjang'} · ${fmt(unit * qty)}`;
  const ask = askLink(brand.whatsapp_url, askMessage(sectionText(sections, 'product_ask_message'), product.name));

  return (
    <main aria-label="Detail produk" style={{ padding: '28px var(--pc-gutter) 0' }}>
      <div className="pc-inner" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <nav aria-label="Breadcrumb" className="pc-crumbs">
          <Link to="/">Beranda</Link>
          <span aria-hidden="true">/</span>
          {product.category_key && (
            <>
              <Link to={`/katalog?cat=${encodeURIComponent(product.category_key)}`}>{product.category_label || 'Katalog'}</Link>
              <span aria-hidden="true">/</span>
            </>
          )}
          <span aria-current="page">{product.name}</span>
        </nav>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 'clamp(24px, 5vw, 48px)', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <div style={{ position: 'relative' }}>
              <Img
                src={main.url}
                srcSet={main.srcset}
                sizes={SIZES.productMain}
                alt={main.alt || product.name}
                ratio="1/1"
                radius={14}
                width={main.width}
                height={main.height}
                priority
                style={{ background: 'var(--pc-tint)' }}
                onError={() => setBroken((b) => new Set(b).add(main.url))}
                fallback={<Tile label={product.name} tintKey={product.category_key} size={56} />}
              />
              {(off > 0 || sellable.badge) && (
                <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 8 }}>
                  {off > 0 && <span className="pc-tag pc-tag-sale" style={{ fontSize: 12, padding: '5px 12px' }}>-{off}%</span>}
                  {sellable.badge && <span className="pc-tag" style={{ fontSize: 12, padding: '5px 12px' }}>{sellable.badge}</span>}
                </div>
              )}
            </div>
            {gallery.length > 1 ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {gallery.map((im, i) => (
                  <button
                    key={im.url || i}
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`Foto ${i + 1} dari ${gallery.length}`}
                    aria-current={i === active}
                    style={{ width: 72, borderRadius: 8, overflow: 'hidden', border: `2px solid ${i === active ? 'var(--pc-green)' : 'transparent'}`, padding: 0, lineHeight: 0, background: 'var(--pc-tint)' }}
                  >
                    <Img src={im.url} srcSet={im.srcset} sizes={SIZES.thumb} alt="" ratio="1/1" onError={() => setBroken((b) => new Set(b).add(im.url))} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {product.category_label && (
                <Link to={`/katalog?cat=${encodeURIComponent(product.category_key ?? '')}`} className="pc-eyebrow" style={{ fontSize: 12 }}>
                  {product.category_label}
                </Link>
              )}
              <h1 style={{ margin: 0, fontWeight: 700, fontSize: 'clamp(28px, 3vw, 38px)', lineHeight: 1.15, textWrap: 'balance', overflowWrap: 'anywhere' }}>
                {product.name}
              </h1>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                {/* "mulai" until a variant is picked, when there is a range to
                    speak of; the exact price the moment one is. */}
                {needsChoice && isPriceRange(product) && <span style={{ fontSize: 14, color: 'var(--pc-muted)' }}>mulai</span>}
                <span style={{ fontSize: 26, fontWeight: 700, color: off > 0 ? 'var(--pc-sale)' : 'var(--pc-ink)' }}>{fmt(needsChoice ? product.price : sellable.price)}</span>
                {off > 0 && <s style={{ fontSize: 16, color: 'var(--pc-muted-2)' }}>{fmt(sellable.compare_at_price)}</s>}
              </div>
              {note && (
                <span style={{ alignSelf: 'flex-start', fontSize: 13, fontWeight: 600, color: 'var(--pc-note-ink)', background: 'var(--pc-note-bg)', padding: '6px 10px', borderRadius: 6 }}>{note}</span>
              )}
              {saleWindow ? (
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--pc-note)' }}>
                  {saleWindow.text}
                  {countdown ? <span style={{ color: 'var(--pc-green)' }}> · {countdown}</span> : null}
                </div>
              ) : null}
            </div>

            {product.has_variants ? <VariantPicker product={product} selected={selected} onPick={pick} /> : null}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', height: 50, border: '1px solid var(--pc-line-2)', borderRadius: 8, background: 'var(--pc-white)' }}>
                <button type="button" className="hv-cream" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={disabled || qty <= 1} aria-label="Kurangi jumlah" style={stepper}>
                  −
                </button>
                <output aria-live="polite" style={{ minWidth: 32, textAlign: 'center', fontSize: 16, fontWeight: 700 }}>
                  {qty}
                </output>
                <button type="button" className="hv-cream" onClick={() => setQty((q) => Math.min(max, q + 1))} disabled={disabled || qty >= max} aria-label="Tambah jumlah" style={stepper}>
                  +
                </button>
              </div>
              <button
                type="button"
                className="pc-btn pc-btn-primary"
                onClick={() => add()}
                disabled={disabled}
                style={{ flex: 1, minWidth: 200, minHeight: 50, borderRadius: 8, fontWeight: 700 }}
              >
                {blocked ? (label ?? 'Stok habis') : needsChoice ? pickPrompt(product.options, selected) : cta}
              </button>
            </div>

            {ask && (
              <a href={ask} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
                <Icon name="chat" size={18} />
                <span>{sectionText(sections, 'product_ask_label')}</span>
              </a>
            )}

          {/* The rule is gated too, not only the sections under it: a product
              with nothing to say in any of them used to draw a bare 1px line
              under the buy button and stop there. */}
          {hasPanel && (
            <div style={{ borderTop: '1px solid var(--pc-line)' }}>
              {description.length > 0 ? (
                <details style={detailsRow} open>
                  <summary style={summary}>{sectionText(sections, 'product_details_heading')}</summary>
                  {description.map((t, i) => (
                    <p key={i} style={detailsText}>
                      {t}
                    </p>
                  ))}
                </details>
              ) : null}
              {/* The category's own name for this row ("Komposisi", "Isi"),
                  as the API sends it; the template's word when there is none. */}
              {spec.length > 0 ? (
                <details style={detailsRow}>
                  <summary style={summary}>{product.spec_label || 'Spesifikasi'}</summary>
                  {spec.map((t, i) => (
                    <p key={i} style={detailsText}>
                      {t}
                    </p>
                  ))}
                </details>
              ) : null}
              {/* Gated, where it used to render unconditionally: a shop that had
                  never written care copy got a panel opening onto nothing. */}
              {care.length > 0 ? (
                <details style={detailsRow}>
                  <summary style={summary}>{sectionText(sections, 'product_care_heading')}</summary>
                  {care.map((t, i) => (
                    <p key={i} style={detailsText}>
                      {t}
                    </p>
                  ))}
                </details>
              ) : null}
              {/* Both lines can be withheld at once -- a merchant whose shipping
                  copy says nothing but "gratis ongkir di atas ..." -- and a panel
                  that opens onto nothing is worse than no panel. */}
              {(brand.productShippingCopy || freeShipping || product.preorder) && (
                <details style={detailsRow}>
                  <summary style={summary}>{sectionText(sections, 'product_shipping_heading')}</summary>
                  {/* First, because it changes what every line below it means:
                      the courier only starts counting once the item exists. */}
                  {product.preorder && (
                    <p style={{ ...detailsText, color: 'var(--pc-note)', fontWeight: 600 }}>
                      {leadDays(product)
                        ? `Produk ini dibuat setelah pesanan dibayar. Perkiraan siap kirim ±${leadDays(product)} hari sejak pembayaran diterima, lalu dikirim seperti biasa.`
                        : 'Produk ini dibuat setelah pesanan dibayar, lalu dikirim seperti biasa.'}
                    </p>
                  )}
                  {brand.productShippingCopy && (
                    <p style={detailsText}>{brand.productShippingCopy}</p>
                  )}
                  {/* Hardcoded rather than brand copy, so it needs its own gate:
                      promising a threshold the checkout ignores is worse than
                      saying nothing about shipping at all. */}
                  {freeShipping && (
                    <p style={{ ...detailsText, marginTop: 6 }}>
                      Gratis ongkir untuk belanja di atas {freeShippingMinLabel}.
                    </p>
                  )}
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {product.related?.length > 0 ? (
        <section style={{ paddingTop: 56, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h2 style={{ margin: 0, fontWeight: 700, fontSize: 28 }}>{sectionText(sections, 'related_heading')}</h2>
          <div className="pc-grid">
            {product.related.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        </section>
      ) : null}
      </div>
    </main>
  );
}

const stepper = { width: 44, height: 48, fontSize: 18, borderRadius: 8 };

function ProductSkeleton() {
  return (
    <main
      aria-busy="true"
      style={{ flex: 1, maxWidth: 1200, margin: '0 auto', padding: '28px 20px 60px', width: '100%' }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40, marginTop: 34 }}>
        <div style={{ flex: '1 1 400px', minWidth: 300 }}>
          <Skeleton ratio="4/5" radius={22} />
        </div>
        <div style={{ flex: '1 1 380px', minWidth: 300 }}>
          <Skeleton height={14} width={140} />
          <Skeleton height={40} style={{ marginTop: 14 }} />
          <Skeleton height={26} width={160} style={{ marginTop: 16 }} />
          <Skeleton height={14} style={{ marginTop: 22 }} />
          <Skeleton height={14} width="80%" style={{ marginTop: 8 }} />
          <Skeleton height={46} radius={999} style={{ marginTop: 26 }} />
        </div>
      </div>
    </main>
  );
}

/**
 * One row of pills per axis. A pill the shop does not sell in combination
 * with what is already picked is greyed out; one that is sold out is struck
 * through as well, so the two reasons read differently. Both are disabled:
 * the server would refuse either, and a buyer should not learn that at
 * checkout.
 */
function VariantPicker({ product, selected, onPick }) {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {product.options.map((axis) => {
        const picked = selected[axis.name];
        return (
          <div key={axis.name} role="group" aria-label={`Pilih ${axis.name}`}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--pc-ink)', marginBottom: 10 }}>
              {axis.name}: <span style={{ fontWeight: 500, color: 'var(--pc-body)' }}>{picked || 'pilih salah satu'}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {availableValues(product, axis.name, selected).map(({ value, exists, soldOut }) => {
                const on = picked === value;
                const off = !exists || soldOut;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onPick(axis.name, value)}
                    disabled={off}
                    aria-pressed={on}
                    aria-label={`${value}${soldOut ? ' (stok habis)' : !exists ? ' (tidak tersedia)' : ''}`}
                    className={off || on ? undefined : 'hv-bd-pink'}
                    style={{
                      minHeight: 44,
                      borderRadius: 8,
                      padding: '0 18px',
                      fontSize: 14,
                      fontWeight: 600,
                      border: `1.5px ${!exists ? 'dashed' : 'solid'} ${on ? 'var(--pc-green)' : 'var(--pc-line-2)'}`,
                      background: on ? 'var(--pc-mist)' : 'var(--pc-white)',
                      color: off ? 'var(--pc-muted-2)' : 'var(--pc-ink)',
                      textDecoration: soldOut ? 'line-through' : 'none',
                      cursor: off ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
