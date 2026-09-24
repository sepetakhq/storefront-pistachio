import { describe, expect, it } from 'vitest';

import {
  confirmStep,
  estimatePaymentFee,
  estimateShipping,
  listPhrase,
  methodFits,
  missingFields,
  outOfRangeReason,
} from './CheckoutRoute.jsx';

const empty = { customer_name: '', contact: '', phone: '', address: '', city: '' };
const full = {
  customer_name: 'Siti',
  contact: 'siti@buyer.test',
  phone: '08123456789',
  address: 'Jl. Melati 12',
  city: 'Pekalongan',
};

// The first submit of an empty form used to name three fields and leave the
// contact out, so the buyer fixed those three, submitted again, and only then
// met a fourth requirement.
describe('missingFields', () => {
  it('names every empty field at once, contact included', () => {
    const got = missingFields({
      form: empty,
      liveShipping: false,
      destination: null,
      contactLabel: 'Email',
    });
    expect(got).toEqual(['nama', 'email', 'nomor hp', 'alamat', 'kota']);
  });

  it('is empty when the form is complete', () => {
    expect(
      missingFields({ form: full, liveShipping: false, destination: null, contactLabel: 'Email' }),
    ).toEqual([]);
  });

  // Live rates replace the free-text city with a picked destination, so the
  // check and the label both change.
  it('asks for a picked destination under live rates', () => {
    expect(
      missingFields({ form: full, liveShipping: true, destination: null, contactLabel: 'Email' }),
    ).toEqual(['tujuan pengiriman']);
    expect(
      missingFields({
        form: { ...full, city: '' },
        liveShipping: true,
        destination: { ref: 'x' },
        contactLabel: 'Email',
      }),
    ).toEqual([]);
  });

  it('follows the label of whichever contact channel is configured', () => {
    const got = missingFields({
      form: empty,
      liveShipping: false,
      destination: null,
      contactLabel: 'Nomor WhatsApp',
    });
    expect(got).toContain('nomor whatsapp');
  });

  it('treats whitespace as empty', () => {
    expect(
      missingFields({
        form: { customer_name: '  ', contact: ' ', phone: ' ', address: '\t', city: ' ' },
        liveShipping: false,
        destination: null,
        contactLabel: 'Email',
      }),
    ).toHaveLength(5);
  });

  // The phone sits between the contact and the address on screen, and this
  // function exists to name fields in the order the buyer will find them.
  it('names the phone where it appears, after the contact', () => {
    const got = missingFields({
      form: { ...full, contact: '', phone: '' },
      liveShipping: false,
      destination: null,
      contactLabel: 'Email',
    });
    expect(got).toEqual(['email', 'nomor hp']);
  });

  // Under a WhatsApp tenant the contact field already holds the number, so no
  // second input is rendered and none can be left empty.
  it('does not ask for a phone when the contact channel is the phone', () => {
    const got = missingFields({
      form: { ...full, phone: '' },
      liveShipping: false,
      destination: null,
      contactLabel: 'Nomor WhatsApp',
      phoneAsked: false,
    });
    expect(got).toEqual([]);
  });
});

// The OTP step had no coverage at all before the trust cookie existed, and it
// is the highest-consequence path in the app: the track token is returned once
// and is unrecoverable.
describe('confirmStep', () => {
  const live = { expiresAt: new Date(2_000_000_000_000).toISOString() };
  const dead = { expiresAt: new Date(1_000_000_000_000).toISOString() };
  const now = 1_500_000_000_000;

  it('sends a code when nothing says otherwise', () => {
    expect(confirmStep({ otpRequired: true, otp: null, now })).toBe('send');
  });

  it('places straight away when the server says no code is needed', () => {
    expect(confirmStep({ otpRequired: false, otp: null, now })).toBe('place');
  });

  // A code already paid for should be spent, not abandoned, and the server
  // re-checks the trust cookie either way.
  it('prefers a code already in flight over skipping', () => {
    expect(confirmStep({ otpRequired: false, otp: live, now })).toBe('reopen');
    expect(confirmStep({ otpRequired: true, otp: live, now })).toBe('reopen');
  });

  it('ignores a code that has already expired', () => {
    expect(confirmStep({ otpRequired: true, otp: dead, now })).toBe('send');
    expect(confirmStep({ otpRequired: false, otp: dead, now })).toBe('place');
  });

  // An older API answers without the field at all, which has to read as the
  // behaviour that existed before the field did.
  it('asks for a code when the response never mentioned one', () => {
    expect(confirmStep({ otpRequired: undefined, otp: null, now })).toBe('send');
  });
});

describe('listPhrase', () => {
  it('joins the Indonesian way, with a serial "dan" and no comma before it', () => {
    expect(listPhrase(['nama', 'alamat', 'kota'])).toBe('nama, alamat dan kota');
    expect(listPhrase(['nama', 'kota'])).toBe('nama dan kota');
    expect(listPhrase(['kota'])).toBe('kota');
    expect(listPhrase([])).toBe('');
  });
});

// The summary is only an estimate, but it has to mirror the server's rule --
// the draft on the next screen is the one that charges, and a buyer who sees
// "Gratis" and then pays 12000 has been told two different prices.
describe('estimateShipping', () => {
  const courier = { cost: 12000 };

  it('waives the charge at the threshold', () => {
    expect(estimateShipping(150000, courier, { enabled: true, min: 150000 })).toBe(0);
  });

  it('charges just below it', () => {
    expect(estimateShipping(149999, courier, { enabled: true, min: 150000 })).toBe(12000);
  });

  it('charges at any subtotal once the offer is off', () => {
    expect(estimateShipping(10000000, courier, { enabled: false, min: 150000 })).toBe(12000);
  });

  // A threshold of zero is the case a flag has to beat: it means every order
  // ships free, so there is no number that could stand for "no offer".
  it('charges with the offer off even where the threshold is zero', () => {
    expect(estimateShipping(500000, courier, { enabled: false, min: 0 })).toBe(12000);
  });

  it('is zero before a courier is chosen', () => {
    expect(estimateShipping(500000, null, { enabled: false, min: 150000 })).toBe(0);
  });
});

// --- what paying costs, before the draft says for certain --------------------

// The rate the server sends is one combined number: the gateway's cut and the
// platform's margin already folded together, rounded up to a whole basis
// point. The split never reaches a browser.
const qris = { code: 'QRIS', fee_flat: 858, fee_basis_pt: 172 };
const bcaVA = { code: 'BCA', fee_flat: 6402, fee_basis_pt: 0, min_order_total: 10000 };

describe('estimatePaymentFee', () => {
  // The same table as TestEffectiveFeeMatchesTheStorefront in
  // backend/internal/payment/quote_test.go. These exist so a change to the
  // rounding on either side fails on both. If you edit one, edit the other.
  const pinned = [
    { flat: 856, basisPt: 172, base: 100000, want: 2576 },
    { flat: 856, basisPt: 172, base: 0, want: 856 },
    { flat: 856, basisPt: 172, base: 1, want: 857 },
    { flat: 4941, basisPt: 101, base: 100000, want: 5951 },
    { flat: 0, basisPt: 0, base: 100000, want: 0 },
    { flat: 353, basisPt: 71, base: 10000, want: 424 },
  ];
  for (const c of pinned) {
    it(`Rp ${c.flat} + ${c.basisPt}bp on ${c.base} is ${c.want}`, () => {
      expect(
        estimatePaymentFee(c.base, { fee_flat: c.flat, fee_basis_pt: c.basisPt }),
      ).toBe(c.want);
    });
  }

  // Rounds up, mirroring payment.ChannelFee.On: under-stating a fee is the
  // failure the whole thing exists to prevent, and an estimate below the real
  // charge is the one direction a buyer must never be shown.
  it('rounds up rather than down', () => {
    expect(estimatePaymentFee(200, { fee_flat: 0, fee_basis_pt: 70 })).toBe(2);
  });

  it('charges nothing when the shop absorbs the cost', () => {
    // A merchant-pays storefront is sent no rate at all, so there is nothing
    // to estimate and nothing to show.
    expect(estimatePaymentFee(100000, { code: 'QRIS' })).toBe(0);
    expect(estimatePaymentFee(100000, undefined)).toBe(0);
  });
});

describe('which methods this cart fits', () => {
  it('accepts a cart inside the channel’s bounds', () => {
    expect(methodFits({ min_order_total: 500, max_order_total: 5000000 }, 92000)).toBe(true);
  });

  it('refuses a cart under the floor, and says which floor', () => {
    expect(methodFits(bcaVA, 5000)).toBe(false);
    expect(outOfRangeReason(bcaVA, 5000)).toBe('Minimal Rp 10.000 untuk metode ini.');
  });

  it('refuses a cart over the ceiling, and says which ceiling', () => {
    const m = { max_order_total: 5000000 };
    expect(methodFits(m, 6000000)).toBe(false);
    expect(outOfRangeReason(m, 6000000)).toBe('Maksimal Rp 5.000.000 untuk metode ini.');
  });

  // Zero means the channel states no bound, which is not the same as a bound
  // of nothing -- it matches payment.AmountRange's own convention.
  it('treats an unstated bound as no bound', () => {
    expect(methodFits({ min_order_total: 0, max_order_total: 0 }, 20000000)).toBe(true);
    expect(methodFits({}, 1)).toBe(true);
  });

  // An empty cart is not out of range, it is not yet a cart. Greying every
  // method out before the buyer has added anything would read as an outage.
  it('says nothing about a cart with no value yet', () => {
    expect(methodFits(bcaVA, 0)).toBe(true);
  });
});

// The bounds arrive already expressed in order-value terms, because the server
// inverts the gross-up. So a cart that fits is one whose *charge* fits, and the
// screen never has to reason about the fee to know that.
describe('the bounds are about the order, not the charge', () => {
  it('compares the cart against the bound directly', () => {
    const m = { ...qris, max_order_total: 100000 };
    expect(methodFits(m, 100000)).toBe(true);
    expect(methodFits(m, 100001)).toBe(false);
  });
});
