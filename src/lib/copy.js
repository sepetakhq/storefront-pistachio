// The decisions behind this template's chrome, kept pure so they can be
// tested without a DOM. The kit owns the platform rules (stock, sale
// windows, variants); this file owns what this template does with them.

import { saleState, overlayLabel, AVAILABLE } from '@sepetakhq/storefront-kit/lib/availability';
import { countsStock, isSoldOut, leadDays, maxQty, shortNote } from '@sepetakhq/storefront-kit/lib/preorder';
import { MAX_QTY } from '@sepetakhq/storefront-kit/lib/constants';
import { fmt } from '@sepetakhq/storefront-kit/shared/format';

/**
 * Percent off, or 0 when there is nothing honest to say: no compare price,
 * a compare price at or under the sale price, or a product not on sale.
 * Never divides by zero.
 */
export function discountPct(p) {
  const price = Number(p?.price ?? 0);
  const compare = Number(p?.compare_at_price ?? 0);
  if (!p?.on_sale || !(compare > 0) || !(compare > price)) return 0;
  return Math.round((1 - price / compare) * 100);
}

/** Two letters for a tile with no picture: "Serum Vitamin" → "SV", "Makeup" → "MA". */
export function initials(label) {
  const words = String(label ?? '')
    .split(/[\s&/·-]+/)
    .filter(Boolean);
  if (words.length === 0) return '·';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Green washes from the design, keyed by a stable hash so the same category
// always gets the same one without the merchant choosing.
const TINTS = ['var(--pc-tint)', 'var(--pc-mist)', 'var(--pc-soft)', 'var(--pc-hover)'];

export function tintFor(key) {
  const s = String(key ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

/**
 * What the card's action area shows for this product:
 *   variants  — a link to the page, never a variant-less line
 *   disabled  — sold out, scheduled or ended; the label is the kit's buyLabel
 *   stepper   — already in the cart; −/+ against `max`
 *   add       — one tap adds one
 */
export function quickAddState(p, lineQty = 0) {
  if (!p) return { kind: 'disabled', max: 0 };
  if (p.has_variants && !isSoldOut(p)) return { kind: 'variants', max: 0 };
  if (saleState(p) !== AVAILABLE || isSoldOut(p)) return { kind: 'disabled', max: 0 };
  const max = Math.min(maxQty(p), MAX_QTY);
  return lineQty > 0 ? { kind: 'stepper', max } : { kind: 'add', max };
}

/**
 * The orange line under a card's name: the pre-order wait, or "only N left"
 * when a counted stock is nearly gone. Nothing otherwise.
 */
export const LOW_STOCK = 5;
export function cardNote(p) {
  if (!p) return '';
  if (p.preorder) return shortNote(p) || 'Pre-order';
  if (!countsStock(p) || isSoldOut(p) || saleState(p) !== AVAILABLE) return '';
  const n = Number(p.stock ?? 0);
  return n > 0 && n <= LOW_STOCK ? `Sisa ${n} lagi` : '';
}

/**
 * The product page's orange line, for the product as judged for the picked
 * variant: the pre-order wait, or a nearly-gone counted stock.
 */
export function detailNote(p) {
  if (!p) return '';
  if (p.preorder) {
    const days = leadDays(p);
    return days ? `Pre-order · dikirim ±${days} hari setelah pembayaran` : 'Pre-order · dibuat setelah pembayaran';
  }
  if (!countsStock(p) || isSoldOut(p)) return '';
  const n = Number(p.stock ?? 0);
  return n > 0 && n <= LOW_STOCK ? `Sisa ${n} lagi — segera checkout` : '';
}

/** "Pilih warna dulu" / "Pilih ukuran & warna dulu", for the axes still open. */
export function pickPrompt(options, selected) {
  const open = (options ?? []).map((o) => o.name).filter((n) => !selected?.[n]);
  return open.length ? `Pilih ${open.map((n) => n.toLowerCase()).join(' & ')} dulu` : 'Pilih varian dulu';
}

/**
 * The veil over a card's picture when it cannot be bought now, in the
 * design's sentence case: sold out, opening later, or closed.
 */
export function cardVeil(p) {
  const o = overlayLabel(p);
  if (!o) return isSoldOut(p) ? 'Stok habis' : '';
  if (o.title === 'SEGERA') return o.detail ? `Buka ${o.detail}` : 'Segera hadir';
  if (o.title === 'SUDAH DITUTUP') return 'Penjualan ditutup';
  return 'Stok habis';
}

/** "stok 24" only when a number means something. */
export function stockLine(p) {
  if (!p || !countsStock(p) || isSoldOut(p)) return '';
  const n = Number(p.stock ?? 0);
  return n > 0 ? `stok ${n}` : '';
}

/**
 * A running campaign's countdown is worth drawing for a week out; beyond
 * that "43 HARI" is noise, not urgency.
 */
export const COUNTDOWN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export function showCountdown(endsAt, now = Date.now()) {
  if (!endsAt) return false;
  const t = new Date(endsAt).getTime();
  if (Number.isNaN(t)) return false;
  const left = t - now;
  return left > 0 && left <= COUNTDOWN_WINDOW_MS;
}

/**
 * The campaign's big line: what the promotion takes off, in the design's
 * words, or the merchant's title for a kind this template cannot phrase.
 */
export function campaignHeadline(c) {
  const own = String(c?.headline ?? '').trim();
  if (own) return own;
  const v = Number(c?.discount_value ?? 0);
  if (v > 0 && c?.discount_type === 'percentage') return `Diskon hingga ${v}%`;
  if (v > 0 && c?.discount_type === 'fixed') return `Hemat ${fmt(v)}`;
  return c?.title ?? '';
}

/**
 * The API's two banner tones (`butter`, `pink`: names, not colours) in this
 * template's palette: `pink`, the loud one, is the design's deep-green band;
 * `butter` and anything this bundle predates is the quiet mist band.
 */
export function bannerTheme(name) {
  return name === 'pink'
    ? { className: 'pc-banner is-deep', button: 'pc-btn pc-btn-light', leaf: true }
    : { className: 'pc-banner is-mist', button: 'pc-btn pc-btn-primary', leaf: false };
}

/**
 * How a feature item's mark is drawn: exactly as the merchant typed it
 * (`{ text }`), and the leaf when there is none. No table turns a mark into
 * something else: what the merchant typed in the editor is what the shop shows.
 */
export function featureMark(mark) {
  const m = String(mark ?? '').trim();
  return m ? { text: m } : { icon: 'leaf' };
}

/**
 * The reassurances under the hero buttons. The words are the merchant's
 * section_copy labels (the template's own when blank); what they sit beside
 * is the shop's configuration, so a chip can never claim what the shop does
 * not do: free shipping only while the offer is on, and only the payment
 * methods and couriers it has switched on. Empty parts are left out.
 *
 * @param {object} config useConfig(): brand.sections, copy, freeShipping,
 *   paymentMethods, couriers
 */
export function heroChips({ brand, copy, freeShipping, paymentMethods = [], couriers = [] } = {}) {
  const sections = brand?.sections;
  const chips = [];
  if (freeShipping && copy) {
    // Through the config's substitution, so {free_shipping_min} is the
    // shop's threshold; a note it withholds takes the chip with it.
    const note = copy(sectionText(sections, 'hero_chip_shipping_note'));
    if (note) chips.push({ icon: 'truck', title: sectionText(sections, 'hero_chip_shipping'), sub: note });
  }
  const pays = paymentMethods.filter((p) => p?.enabled && p?.name);
  if (pays.length) {
    chips.push({ icon: 'shield', title: sectionText(sections, 'hero_chip_payment'), sub: pays.slice(0, 2).map((p) => p.name).join(' · ') });
  }
  const ships = couriers.filter((c) => c?.enabled && c?.name);
  if (ships.length) {
    // The template's own wording counts them; the merchant's replaces it.
    const own = String(sections?.hero_chip_couriers ?? '').trim();
    chips.push({ icon: 'box', title: own || `${ships.length} kurir`, sub: ships.slice(0, 3).map((c) => c.name).join(' · ') });
  }
  return chips;
}

/**
 * The fact rows beside the story: where the shop ships from, its hours, and
 * a WhatsApp chat. The data is brand fields and each row is left out when
 * its field is empty; the words around it are section_copy labels.
 */
export function storyFacts(brand = {}) {
  const sections = brand.sections;
  const facts = [];
  if (brand.origin_city) {
    facts.push({
      icon: 'pin',
      title: `${sectionText(sections, 'origin_prefix')} ${brand.origin_city}`,
      sub: sectionText(sections, 'origin_note'),
      to: '/tentang',
    });
  }
  if (brand.opening_hours) {
    facts.push({ icon: 'clock', title: sectionText(sections, 'about_hours_heading'), sub: brand.opening_hours, to: '/tentang' });
  }
  if (brand.whatsapp_url && /^https?:\/\//i.test(brand.whatsapp_url)) {
    facts.push({
      icon: 'chat',
      title: String(brand.whatsapp_text ?? '').trim() || sectionText(sections, 'about_contact_heading'),
      sub: brand.phone || '',
      href: brand.whatsapp_url,
    });
  }
  return facts;
}

/**
 * The cart's progress towards free shipping. The caller only asks while the
 * offer is on; a zero threshold means every order qualifies.
 */
export function freeShippingProgress(subtotal, min) {
  const need = Math.max(0, Number(min ?? 0) - Number(subtotal ?? 0));
  const pct = min > 0 ? Math.min(100, Math.round((subtotal / min) * 100)) : 100;
  return { pct, text: need > 0 ? `Tambah ${fmt(need)} lagi untuk gratis ongkir` : 'Kamu dapat gratis ongkir!' };
}

/**
 * The template's own wording for every section_copy label it draws. The
 * merchant's text from the backoffice replaces each one; blank keeps these.
 */
export const DEFAULT_LABELS = {
  cats_heading: 'Kategori',
  grid_see_all: 'Lihat semua',
  story_eyebrow: 'Cerita kami',
  story_cta: 'Tentang kami',
  product_details_heading: 'Detail produk',
  product_care_heading: 'Penyimpanan',
  product_shipping_heading: 'Pengiriman',
  hero_secondary_cta: 'Lihat kategori',
  campaign_cta: 'Lihat semua promo',
  related_heading: 'Mungkin kamu suka',
  product_ask_label: 'Tanya produk ini via WhatsApp',
  product_ask_message: 'Halo, saya mau tanya tentang {product}',
  promo_title: 'Promo',
  promo_subtitle: 'Produk yang sedang diskon',
  about_address_heading: 'Alamat toko',
  about_hours_heading: 'Jam operasional',
  about_contact_heading: 'Hubungi kami',
  footer_shop_heading: 'Menu',
  footer_contact_heading: 'Kontak',
  footer_payment_heading: 'Pembayaran',
  footer_shipping_heading: 'Pengiriman',
  footer_categories_heading: 'Kategori',
  origin_prefix: 'Dikirim dari',
  origin_note: 'Info toko & pengiriman',
  hero_chip_shipping: 'Gratis ongkir',
  hero_chip_shipping_note: 'min. {free_shipping_min}',
  hero_chip_payment: 'Bayar aman',
  countdown_label: 'Berakhir dalam',
};

/**
 * One label: the merchant's section_copy text, trimmed, else the template's.
 * `copy` is the config's substitution, for labels that may carry
 * {free_shipping_min}; a sentence it withholds falls back too, rather than
 * leaving the slot blank.
 */
export function sectionText(sections, key, copy) {
  const raw = String(sections?.[key] ?? '').trim();
  const text = raw && copy ? String(copy(raw) ?? '').trim() : raw;
  return text || DEFAULT_LABELS[key] || '';
}

/** The WhatsApp question with {product} filled in; other braces stay as typed. */
export function askMessage(template, productName) {
  return String(template ?? '').replaceAll('{product}', String(productName ?? ''));
}

/**
 * The "ask about this product" link: the shop's WhatsApp URL with the
 * message set through URL, so a merchant URL that already carries a query
 * keeps it. Anything that is not an http(s) URL gives no link at all.
 */
export function askLink(whatsappUrl, message) {
  if (!whatsappUrl) return '';
  let url;
  try {
    url = new URL(whatsappUrl);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  if (message) url.searchParams.set('text', message);
  return url.toString();
}

/**
 * The footer's link column: the merchant's own nav, plus order tracking when
 * the nav leaves it out -- a buyer looking for a parcel scrolls to the footer.
 */
export function footerLinks(nav = []) {
  const links = (nav ?? []).filter((n) => n?.path && n?.label);
  return links.some((n) => n.path === '/lacak') ? links : [...links, { path: '/lacak', label: 'Lacak pesanan' }];
}

/**
 * A courier by the name the shop gave it. An order carries only the code;
 * one the shop has since removed shows as the code, upper-cased, rather than
 * as nothing.
 */
export function courierName(couriers, code) {
  if (!code) return '';
  const hit = (couriers ?? []).find((c) => c?.code === code && c?.name);
  return hit ? hit.name : String(code).toUpperCase();
}

const SOCIAL_ABBR ={ instagram: 'IG', whatsapp: 'WA', tiktok: 'TT', facebook: 'FB' };
/** The two letters in a social link's round button. */
export function socialAbbr(kind) {
  const k = String(kind ?? '');
  return SOCIAL_ABBR[k] ?? (k.slice(0, 2).toUpperCase() || '·');
}

const SOCIAL_NAMES = { instagram: 'Instagram', whatsapp: 'WhatsApp', tiktok: 'TikTok', facebook: 'Facebook' };
/** A social kind as a word; one this bundle predates is capitalised as-is. */
export function socialLabel(kind) {
  const k = String(kind ?? '');
  return SOCIAL_NAMES[k] ?? (k ? k[0].toUpperCase() + k.slice(1) : '');
}

/** The catalogue heading for the active filters. */
export function catalogTitle({ cat, sale, q } = {}, categories = [], promoTitle = DEFAULT_LABELS.promo_title) {
  if (q) return `Hasil untuk “${q}”`;
  if (sale) return promoTitle;
  if (cat && cat !== 'Semua') {
    const found = categories.find((c) => c.key === cat);
    return found?.label ?? cat;
  }
  return 'Semua produk';
}

/**
 * The chip row under the catalogue heading: all, each category, promo. A
 * chip is a link to that one filter; the sort the buyer chose rides along.
 */
export function catalogChips(categories = [], { cat, sale, q } = {}, sort = 'featured', promoTitle = DEFAULT_LABELS.promo_title) {
  const href = (params) => {
    const qs = new URLSearchParams(params);
    if (sort && sort !== 'featured') qs.set('sort', sort);
    const s = qs.toString();
    return s ? `/katalog?${s}` : '/katalog';
  };
  const active = sale ? '__sale' : cat && cat !== 'Semua' ? cat : q ? '__q' : '__all';
  return [
    { key: '__all', label: 'Semua', to: href({}) },
    ...categories.map((c) => ({ key: c.key, label: c.label, to: href({ cat: c.key }) })),
    { key: '__sale', label: promoTitle, to: href({ sale: '1' }) },
  ].map((c) => ({ ...c, current: c.key === active }));
}

export const SORTS = [
  { value: 'featured', label: 'Paling relevan' },
  { value: 'priceAsc', label: 'Harga terendah' },
  { value: 'priceDesc', label: 'Harga tertinggi' },
  { value: 'nameAsc', label: 'Nama A–Z' },
];

export function sortOrDefault(value) {
  return SORTS.some((s) => s.value === value) ? value : 'featured';
}
