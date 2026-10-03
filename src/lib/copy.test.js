import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LABELS,
  askLink,
  askMessage,
  bannerTheme,
  campaignHeadline,
  cardNote,
  cardVeil,
  catalogChips,
  catalogTitle,
  courierName,
  detailNote,
  discountPct,
  featureMark,
  footerLinks,
  freeShippingProgress,
  heroChips,
  initials,
  pickPrompt,
  sectionText,
  quickAddState,
  showCountdown,
  socialAbbr,
  socialLabel,
  sortOrDefault,
  stockLine,
  storyFacts,
  tintFor,
} from './copy.js';

describe('discountPct', () => {
  it('rounds the honest cases', () => {
    expect(discountPct({ on_sale: true, price: 132300, compare_at_price: 189000 })).toBe(30);
    expect(discountPct({ on_sale: true, price: 9500, compare_at_price: 12000 })).toBe(21);
  });
  it('says nothing when there is no compare price, or it is not higher, or not on sale', () => {
    expect(discountPct({ on_sale: true, price: 100, compare_at_price: 0 })).toBe(0);
    expect(discountPct({ on_sale: true, price: 100 })).toBe(0);
    expect(discountPct({ on_sale: true, price: 100, compare_at_price: 100 })).toBe(0);
    expect(discountPct({ on_sale: true, price: 100, compare_at_price: 90 })).toBe(0);
    expect(discountPct({ on_sale: false, price: 100, compare_at_price: 200 })).toBe(0);
    expect(discountPct(null)).toBe(0);
  });
});

describe('initials / tintFor', () => {
  it('takes two letters from two words, two from one', () => {
    expect(initials('Serum Vitamin C')).toBe('SV');
    expect(initials('Kulit & Wajah')).toBe('KW');
    expect(initials('Makeup')).toBe('MA');
    expect(initials('')).toBe('·');
  });
  it('gives a category the same tint every time', () => {
    expect(tintFor('wajah')).toBe(tintFor('wajah'));
    expect(tintFor('wajah')).toMatch(/^var\(--pc-[a-z]+\)$/);
  });
});

describe('quickAddState', () => {
  const base = { id: 'p', stock: 5, availability: 'available' };
  it('sends a variant product to its page, unless every variant is gone', () => {
    expect(quickAddState({ ...base, has_variants: true }).kind).toBe('variants');
    expect(quickAddState({ ...base, has_variants: true, sold_out: true }).kind).toBe('disabled');
  });
  it('disables sold out, scheduled and ended', () => {
    expect(quickAddState({ ...base, sold_out: true }).kind).toBe('disabled');
    expect(quickAddState({ ...base, availability: 'scheduled' }).kind).toBe('disabled');
    expect(quickAddState({ ...base, availability: 'ended' }).kind).toBe('disabled');
  });
  it('adds one, then steps, capped by counted stock', () => {
    expect(quickAddState(base, 0)).toEqual({ kind: 'add', max: 5 });
    expect(quickAddState(base, 2)).toEqual({ kind: 'stepper', max: 5 });
  });
  it('caps an uncounted or pre-order product at MAX_QTY only', () => {
    expect(quickAddState({ ...base, stock: 0, unlimited_stock: true }, 1).max).toBe(99);
    expect(quickAddState({ ...base, stock: 0, preorder: true }, 0).max).toBe(99);
  });
  it('trusts the server over a missing availability field', () => {
    expect(quickAddState({ id: 'p', stock: 3 }, 0).kind).toBe('add');
  });
});

describe('cardNote / cardVeil', () => {
  const base = { id: 'p', stock: 24, availability: 'available' };
  it('states the pre-order wait, or a low counted stock, else nothing', () => {
    expect(cardNote({ ...base, preorder: true, preorder_lead_days: 5 })).toBe('Pre-order · ±5 hari setelah pembayaran');
    expect(cardNote({ ...base, preorder: true, preorder_lead_days: 0 })).toBe('Pre-order · dibuat setelah dipesan');
    expect(cardNote({ ...base, stock: 4 })).toBe('Sisa 4 lagi');
    expect(cardNote({ ...base, stock: 24 })).toBe('');
    expect(cardNote({ ...base, stock: 3, unlimited_stock: true })).toBe('');
    expect(cardNote({ ...base, stock: 0, sold_out: true, availability: 'sold_out' })).toBe('');
    expect(cardNote({ ...base, stock: 3, availability: 'scheduled' })).toBe('');
    expect(cardNote(null)).toBe('');
  });
  it('veils only what cannot be bought now', () => {
    expect(cardVeil(base)).toBe('');
    expect(cardVeil({ ...base, sold_out: true, availability: 'sold_out' })).toBe('Stok habis');
    expect(cardVeil({ ...base, availability: 'ended' })).toBe('Penjualan ditutup');
    expect(cardVeil({ ...base, availability: 'scheduled' })).toBe('Segera hadir');
    expect(cardVeil({ ...base, availability: 'scheduled', sell_from: '2026-09-26T03:00:00Z' })).toMatch(/^Buka /);
  });
});

describe('detailNote / pickPrompt', () => {
  const base = { id: 'p', stock: 24, availability: 'available' };
  it('states the wait only when the shop gave one, and a low stock only when counted', () => {
    expect(detailNote({ ...base, preorder: true, preorder_lead_days: 5 })).toBe('Pre-order · dikirim ±5 hari setelah pembayaran');
    expect(detailNote({ ...base, preorder: true, preorder_lead_days: 0 })).toBe('Pre-order · dibuat setelah pembayaran');
    expect(detailNote({ ...base, stock: 3 })).toBe('Sisa 3 lagi — segera checkout');
    expect(detailNote({ ...base, stock: 3, unlimited_stock: true })).toBe('');
    expect(detailNote(base)).toBe('');
  });
  it('names the axes still to pick', () => {
    const opts = [{ name: 'Ukuran' }, { name: 'Warna' }];
    expect(pickPrompt(opts, {})).toBe('Pilih ukuran & warna dulu');
    expect(pickPrompt(opts, { Ukuran: 'S' })).toBe('Pilih warna dulu');
    expect(pickPrompt(opts, { Ukuran: 'S', Warna: 'Rose' })).toBe('Pilih varian dulu');
  });
});

describe('stockLine', () => {
  it('shows a count only when it means something', () => {
    expect(stockLine({ stock: 24 })).toBe('stok 24');
    expect(stockLine({ stock: 0 })).toBe('');
    expect(stockLine({ stock: 24, preorder: true })).toBe('');
    expect(stockLine({ stock: 24, unlimited_stock: true })).toBe('');
    expect(stockLine({ stock: 24, sold_out: true })).toBe('');
  });
});

describe('showCountdown', () => {
  const now = Date.parse('2026-09-21T10:00:00Z');
  it('ticks only inside the one-week window', () => {
    expect(showCountdown('2026-09-23T16:17:00Z', now)).toBe(true);
    expect(showCountdown('2026-09-28T09:59:00Z', now)).toBe(true);
    expect(showCountdown('2026-09-28T10:01:00Z', now)).toBe(false);
    expect(showCountdown('2026-09-21T09:59:00Z', now)).toBe(false);
    expect(showCountdown(null, now)).toBe(false);
    expect(showCountdown('garbage', now)).toBe(false);
  });
});

describe('campaignHeadline', () => {
  it('phrases percentage and fixed, and falls back to the title', () => {
    expect(campaignHeadline({ discount_type: 'percentage', discount_value: 30, title: 'x' })).toBe('Diskon hingga 30%');
    expect(campaignHeadline({ discount_type: 'fixed', discount_value: 25000 })).toBe('Hemat Rp 25.000');
    expect(campaignHeadline({ discount_type: 'bundle', discount_value: 2, title: 'Beli 2 gratis 1' })).toBe('Beli 2 gratis 1');
    expect(campaignHeadline({ discount_type: 'percentage', discount_value: 0, title: 'Promo' })).toBe('Promo');
    expect(campaignHeadline(null)).toBe('');
  });
});

describe('featureMark', () => {
  // What the merchant typed is what shows: no emoji becomes something else.
  it('draws every mark as typed, trimmed, and no mark as the leaf', () => {
    expect(featureMark('🚚')).toEqual({ text: '🚚' });
    expect(featureMark(' 💬 ')).toEqual({ text: '💬' });
    expect(featureMark('24j')).toEqual({ text: '24j' });
    expect(featureMark('🍫')).toEqual({ text: '🍫' });
    expect(featureMark('')).toEqual({ icon: 'leaf' });
    expect(featureMark(undefined)).toEqual({ icon: 'leaf' });
  });
});

describe('heroChips', () => {
  const pays = [
    { code: 'QRIS', name: 'QRIS', enabled: true },
    { code: 'BCA', name: 'BCA VA', enabled: true },
    { code: 'GOPAY', name: 'GoPay', enabled: false },
  ];
  const ships = [
    { code: 'jne', name: 'JNE', enabled: true },
    { code: 'jnt', name: 'J&T', enabled: false },
  ];
  // The config's own substitution, as ConfigProvider wires it: withheld
  // entirely while the offer is off.
  const copyFor = (on) => (s) => (on ? String(s).replaceAll('{free_shipping_min}', 'Rp 150.000') : '');
  const config = (over = {}) => ({ brand: { sections: {} }, copy: copyFor(true), freeShipping: true, paymentMethods: pays, couriers: ships, ...over });

  it('says only what the shop has switched on', () => {
    const chips = heroChips(config());
    expect(chips.map((c) => c.title)).toEqual(['Gratis ongkir', 'Bayar aman', '1 kurir']);
    expect(chips[0].sub).toBe('min. Rp 150.000');
    expect(chips[1].sub).toBe('QRIS · BCA VA');
    expect(chips[2].sub).toBe('JNE');
  });
  it('never promises free shipping the checkout would refuse', () => {
    const chips = heroChips(config({ freeShipping: false, copy: copyFor(false) }));
    expect(chips.map((c) => c.title)).not.toContain('Gratis ongkir');
  });
  it("uses the shop's labels, with the threshold filled into its note", () => {
    const sections = { hero_chip_shipping: 'Ongkir gratis', hero_chip_shipping_note: 'belanja {free_shipping_min}', hero_chip_payment: 'Aman', hero_chip_couriers: 'Kurir andal' };
    const chips = heroChips(config({ brand: { sections } }));
    expect(chips.map((c) => [c.title, c.sub])).toEqual([
      ['Ongkir gratis', 'belanja Rp 150.000'],
      ['Aman', 'QRIS · BCA VA'],
      ['Kurir andal', 'JNE'],
    ]);
  });
  // VA BCA and Transfer BCA are one badge, so the two places go to two marks.
  it('hands over the named items once per badge, so the hero can draw them', () => {
    const bca = 'http://api.test/logos/payment/bca.svg';
    const chips = heroChips(config({
      freeShipping: false,
      copy: copyFor(false),
      paymentMethods: [
        { code: 'BCA', name: 'VA BCA', enabled: true, logo_url: bca },
        { code: 'MANUAL_BCA', name: 'Transfer BCA', enabled: true, logo_url: bca },
        { code: 'QRIS', name: 'QRIS', enabled: true },
      ],
    }));
    expect(chips[0].items.map((p) => p.name)).toEqual(['VA BCA', 'QRIS']);
    expect(chips[0].sub).toBe('VA BCA · QRIS');
    expect(chips[1].items.map((c) => c.name)).toEqual(['JNE']);
  });
  it('leaves out a part with nothing behind it', () => {
    expect(heroChips({})).toEqual([]);
    expect(heroChips({ paymentMethods: [{ enabled: false, name: 'x' }], couriers: [] })).toEqual([]);
  });
});

describe('storyFacts', () => {
  it('lists only the brand fields the shop filled in', () => {
    expect(storyFacts({})).toEqual([]);
    const all = storyFacts({ origin_city: 'Bandung', opening_hours: '08.00–20.00', whatsapp_url: 'https://wa.me/62811', phone: '0811' });
    expect(all.map((f) => f.icon)).toEqual(['pin', 'clock', 'chat']);
    expect(all[0].title).toBe('Dikirim dari Bandung');
    // Every link is a route the contract has, or the shop's own chat.
    expect(all[0].to).toBe('/tentang');
    expect(all[2].href).toBe('https://wa.me/62811');
  });
  it("words each row with the shop's labels", () => {
    const facts = storyFacts({
      origin_city: 'Bandung', opening_hours: '08.00', whatsapp_url: 'https://wa.me/62811',
      sections: { origin_prefix: 'Berangkat dari', origin_note: 'Lihat info', about_hours_heading: 'Buka', about_contact_heading: 'Tanya kami' },
    });
    expect(facts.map((f) => [f.title, f.sub])).toEqual([
      ['Berangkat dari Bandung', 'Lihat info'],
      ['Buka', '08.00'],
      ['Tanya kami', ''],
    ]);
  });
  it('drops a chat link that is not http(s)', () => {
    expect(storyFacts({ whatsapp_url: 'javascript:alert(1)' })).toEqual([]);
  });
});

describe('freeShippingProgress', () => {
  it('counts down to the threshold, then says so', () => {
    expect(freeShippingProgress(50000, 150000)).toEqual({ pct: 33, text: 'Tambah Rp 100.000 lagi untuk gratis ongkir' });
    expect(freeShippingProgress(200000, 150000)).toEqual({ pct: 100, text: 'Kamu dapat gratis ongkir!' });
    expect(freeShippingProgress(0, 0).pct).toBe(100);
  });
});

describe('courierName', () => {
  it("names a courier the shop's way, and falls back to the code", () => {
    const couriers = [{ code: 'jne', name: 'JNE Reguler' }];
    expect(courierName(couriers, 'jne')).toBe('JNE Reguler');
    expect(courierName(couriers, 'sicepat')).toBe('SICEPAT');
    expect(courierName(undefined, 'jne')).toBe('JNE');
    expect(courierName(couriers, '')).toBe('');
  });
});

describe('footerLinks / socialAbbr', () => {
  it('adds order tracking when the merchant nav leaves it out, once', () => {
    expect(footerLinks([{ path: '/', label: 'Beranda' }]).map((n) => n.path)).toEqual(['/', '/lacak']);
    expect(footerLinks([{ path: '/lacak', label: 'Lacak' }])).toEqual([{ path: '/lacak', label: 'Lacak' }]);
    expect(footerLinks(undefined).map((n) => n.path)).toEqual(['/lacak']);
  });
  it('abbreviates the known kinds and any new one', () => {
    expect(socialAbbr('instagram')).toBe('IG');
    expect(socialAbbr('youtube')).toBe('YO');
    expect(socialAbbr('')).toBe('·');
  });
});

describe('askLink', () => {
  it('sets the message without losing the merchant URL', () => {
    expect(askLink('https://wa.me/6281234567890', 'Halo, tanya Serum')).toBe(
      'https://wa.me/6281234567890?text=Halo%2C+tanya+Serum',
    );
    expect(askLink('https://api.whatsapp.com/send?phone=628123', 'Hai')).toBe(
      'https://api.whatsapp.com/send?phone=628123&text=Hai',
    );
  });
  it('replaces a text the URL already had rather than doubling it', () => {
    expect(askLink('https://wa.me/628?text=lama', 'baru')).toBe('https://wa.me/628?text=baru');
  });
  it('gives nothing for a missing or unsafe URL', () => {
    expect(askLink('', 'x')).toBe('');
    expect(askLink('wa.me/628', 'x')).toBe('');
    expect(askLink('javascript:alert(1)', 'x')).toBe('');
  });
});

describe('socialLabel', () => {
  it('names the known kinds and capitalises the rest', () => {
    expect(socialLabel('tiktok')).toBe('TikTok');
    expect(socialLabel('threads')).toBe('Threads');
    expect(socialLabel(undefined)).toBe('');
  });
});

describe('catalogue helpers', () => {
  const cats = [{ key: 'wajah', label: 'Perawatan Wajah' }];
  it('titles by priority: search, then promo, then category', () => {
    expect(catalogTitle({}, cats)).toBe('Semua produk');
    expect(catalogTitle({ cat: 'wajah' }, cats)).toBe('Perawatan Wajah');
    expect(catalogTitle({ cat: 'nope' }, cats)).toBe('nope');
    expect(catalogTitle({ cat: 'wajah', sale: true }, cats)).toBe('Promo');
    expect(catalogTitle({ sale: true, q: 'serum' }, cats)).toBe('Hasil untuk “serum”');
  });
  it('chips link to one filter each, keep the sort, and mark the current one', () => {
    const chips = catalogChips(cats, { cat: 'wajah' }, 'priceAsc');
    expect(chips.map((c) => c.label)).toEqual(['Semua', 'Perawatan Wajah', 'Promo']);
    expect(chips.map((c) => c.to)).toEqual([
      '/katalog?sort=priceAsc',
      '/katalog?cat=wajah&sort=priceAsc',
      '/katalog?sale=1&sort=priceAsc',
    ]);
    expect(chips.filter((c) => c.current).map((c) => c.key)).toEqual(['wajah']);
    expect(catalogChips(cats, {}).find((c) => c.current).key).toBe('__all');
    expect(catalogChips(cats, { sale: true }).find((c) => c.current).key).toBe('__sale');
    // A search is none of the chips.
    expect(catalogChips(cats, { q: 'x' }).some((c) => c.current)).toBe(false);
    expect(catalogChips([], {}).map((c) => c.to)).toEqual(['/katalog', '/katalog?sale=1']);
  });
  it('falls back to the default sort', () => {
    expect(sortOrDefault('priceAsc')).toBe('priceAsc');
    expect(sortOrDefault('diskon')).toBe('featured');
  });
  it('maps the API banner tones to two looks', () => {
    expect(bannerTheme('pink').className).toBe('pc-banner is-deep');
    expect(bannerTheme('butter').className).toBe('pc-banner is-mist');
    // A tone this bundle predates is the quiet one, never a blank band.
    expect(bannerTheme(undefined)).toEqual(bannerTheme('butter'));
    expect(bannerTheme('neon')).toEqual(bannerTheme('butter'));
  });
});

describe('sectionText', () => {
  it('uses the merchant text, trimmed, and falls back on blank or missing', () => {
    expect(sectionText({ campaign_cta: '  Lihat promo ' }, 'campaign_cta')).toBe('Lihat promo');
    expect(sectionText({ campaign_cta: '   ' }, 'campaign_cta')).toBe('Lihat semua promo');
    expect(sectionText({}, 'campaign_cta')).toBe('Lihat semua promo');
    expect(sectionText(undefined, 'campaign_cta')).toBe('Lihat semua promo');
  });
  it('runs substitution when asked, and falls back when it withholds everything', () => {
    const copy = (t) => (t.includes('{free_shipping_min}') ? '' : t.replace('{x}', 'y'));
    expect(sectionText({ promo_subtitle: 'Hemat {x}' }, 'promo_subtitle', copy)).toBe('Hemat y');
    expect(sectionText({ promo_subtitle: 'Ongkir min {free_shipping_min}' }, 'promo_subtitle', copy)).toBe('Produk yang sedang diskon');
  });
  it('keeps markup as text: it only ever returns a string', () => {
    expect(sectionText({ related_heading: '<b>x</b>' }, 'related_heading')).toBe('<b>x</b>');
  });
  it('has a default for every key the backoffice offers', () => {
    for (const key of ['hero_secondary_cta', 'campaign_cta', 'related_heading', 'product_ask_label', 'product_ask_message',
      'promo_title', 'promo_subtitle', 'about_address_heading', 'about_hours_heading', 'about_contact_heading',
      'footer_shop_heading', 'footer_contact_heading', 'footer_payment_heading', 'footer_shipping_heading']) {
      expect(DEFAULT_LABELS[key], key).toBeTruthy();
    }
  });
});

describe('askMessage', () => {
  it('fills every {product} and leaves other braces as typed', () => {
    expect(askMessage('Halo, {product}? {product} ya', 'Serum')).toBe('Halo, Serum? Serum ya');
    expect(askMessage('Halo {harga}', 'Serum')).toBe('Halo {harga}');
    expect(askMessage('Halo toko', 'Serum')).toBe('Halo toko');
  });
  it('survives awkward names in the URL', () => {
    const url = askLink('https://wa.me/628', askMessage('Tanya {product}', 'Krim & Serum "Glow" 😊'));
    expect(new URL(url).searchParams.get('text')).toBe('Tanya Krim & Serum "Glow" 😊');
  });
});

describe('campaignHeadline with the merchant headline', () => {
  it('prefers the headline, trimmed, over the phrased discount', () => {
    expect(campaignHeadline({ headline: ' Hemat akhir bulan ', discount_type: 'percentage', discount_value: 30 })).toBe('Hemat akhir bulan');
    expect(campaignHeadline({ headline: '  ', discount_type: 'percentage', discount_value: 30 })).toBe('Diskon hingga 30%');
  });
});
