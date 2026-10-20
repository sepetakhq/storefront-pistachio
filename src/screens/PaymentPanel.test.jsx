import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Testing Library only registers its own cleanup when vitest runs with
// globals, which this project does not. Without it each render is appended to
// the same document and a second panel makes every query ambiguous.
afterEach(cleanup);

// The panel reads brand copy and QRIS merchant details from the tenant config.
// Mocked rather than wrapped in a real ConfigProvider, which would need a
// network request and a QueryClient to answer a question about rendering.
vi.mock('@sepetakhq/storefront-kit/config/ConfigProvider', () => ({
  useConfig: () => ({
    brand: { whatsapp_url: 'https://wa.me/6281234567890' },
    payment: { qris_merchant_name: 'LILY ALORA', qris_nmid: 'ID10261234567', account_holder: 'LILY ALORA' },
  }),
}));

const { PaymentPanel } = await import('./OrderRoute.jsx');

// A real EMVCo payload, the same string src/lib/payment.test.js and the Go
// classifier use.
const emvco =
  '00020101021226670016COM.NOBUBANK.WWW01189360050300000898240214' +
  '1234567890123450303UMI51440014ID.CO.QRIS.WWW0215ID10261234567890303UMI' +
  '5204541153033605802ID5910LILY ALORA6010PEKALONGAN61055111162070703A016304ABCD';

const order = {
  // `number`, not `order_number`: that is the field the panel reads, and the
  // typo meant every assertion quoting it silently matched "pesanan .".
  number: 'LA-260830-0001',
  status: 'awaiting_payment',
  total: 75000,
  // An hour out, so the panel is not in its past-deadline branch.
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
};

// The copy the buyer sees when the storefront cannot render what it was given.
// Its presence is the failure this whole file exists to catch.
const DEAD_END = /QRIS mode uji|Metode pembayaran ini belum aktif/;

function panel(payment, props = {}) {
  render(<PaymentPanel order={order} payment={payment} onRefresh={() => {}} {...props} />);
}

// This is the seam the QRIS defect lived in. The adapter filled a field, the
// route agreed, the DTO serialised it and every layer's own tests passed --
// and the buyer got a panel saying the method was switched off. Nothing below
// asserts styling; it asserts that each kind the backend can emit produces
// something a buyer can act on.
describe('PaymentPanel renders every kind the backend can emit', () => {
  it('va: shows the account number to transfer to', () => {
    panel({ kind: 'va', method: 'BCA', amount: 75000, va_bank: 'BCA', va_number: '31086616057511859904943' });

    expect(screen.getByText(/31086616057511859904943/)).toBeTruthy();
    // The holder the merchant typed in settings, beside the number.
    expect(screen.getByText('LILY ALORA')).toBeTruthy();
    expect(screen.queryByText(DEAD_END)).toBeNull();
  });

  it('qr: encodes an EMVCo payload rather than refusing it', () => {
    panel({ kind: 'qr', method: 'QRIS', amount: 75000, qr_payload: emvco });

    expect(screen.queryByText(DEAD_END)).toBeNull();
    // Merchant name and NMID under the code, from the tenant's settings.
    expect(screen.getByText('LILY ALORA')).toBeTruthy();
    expect(screen.getByText(/NMID ID10261234567/)).toBeTruthy();
  });

  it('qr_image: shows the image the provider drew', () => {
    panel({
      kind: 'qr_image',
      method: 'QRIS',
      amount: 75000,
      qr_image_url: 'https://sakurupiah.id/qr-codeIMG/TRX1788086870-PDC3yb2gKMT.png',
    });

    const img = screen.getByAltText(/QRIS/i);
    expect(img.getAttribute('src')).toContain('sakurupiah.id');
    expect(screen.queryByText(DEAD_END)).toBeNull();
  });

  it('redirect: offers a link that leaves this site', () => {
    panel({
      kind: 'redirect',
      method: 'GOPAY',
      amount: 75000,
      redirect_url: 'https://pay.example/checkout/abc123',
    });

    expect(screen.queryByText(DEAD_END)).toBeNull();
  });

  it("manual_transfer: shows the shop's own account, not a Virtual Account", () => {
    panel({
      kind: 'manual_transfer',
      method: 'MANUAL_BCA',
      amount: 75137,
      manual_bank: 'BCA',
      manual_account_number: '1234567890',
      manual_account_holder: 'Lily Alora',
    });

    expect(screen.getByText('1234567890')).toBeTruthy();
    expect(screen.getByText('Lily Alora')).toBeTruthy();
    // The wording matters as much as the number. A fixed account the shop owns
    // is not a Virtual Account issued per order, and telling a buyer it is
    // sends them to their bank asking why the account rejects them.
    expect(screen.getByText(/Transfer ke rekening BCA/)).toBeTruthy();
    expect(screen.queryByText(/Virtual Account/)).toBeNull();
    expect(screen.queryByText(DEAD_END)).toBeNull();
  });

  it("manual_qris: shows the shop's own code and says the amount is typed", () => {
    panel({
      kind: 'manual_qris',
      method: 'MANUAL_QRIS',
      amount: 75137,
      manual_qr_image_url: 'https://cdn.test/t/alpha/products/qris.png',
    });

    expect(screen.getByAltText(/Kode QRIS/i)).toBeTruthy();
    // The one thing a gateway QRIS never has to say: a static code carries no
    // amount, so the buyer types it and it has to be exact.
    expect(screen.getByText(/Nominalnya diisi sendiri/)).toBeTruthy();
    expect(screen.queryByText(DEAD_END)).toBeNull();
  });

  it('manual_whatsapp: opens a chat with the order already typed in', () => {
    panel({
      kind: 'manual_whatsapp',
      method: 'MANUAL_WHATSAPP',
      amount: 75000,
      manual_whatsapp_phone: '6281234567890',
    });

    const link = screen.getByText('Buka WhatsApp').closest('a');
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/6281234567890\?text=/);
    expect(decodeURIComponent(link.getAttribute('href'))).toContain('#LA-260830-0001');
    // The buyer reads what they are about to send.
    expect(screen.getByText(/Halo, saya mau pesan #LA-260830-0001/)).toBeTruthy();
    // And none of the account chrome: nothing to copy, no unique code.
    expect(screen.queryByText('Salin')).toBeNull();
    expect(screen.queryByText(DEAD_END)).toBeNull();
  });

  it('manual_whatsapp: falls back when the number is gone', () => {
    panel({ kind: 'manual_whatsapp', method: 'MANUAL_WHATSAPP', amount: 75000 });
    expect(screen.getByText('Rekening belum tersedia')).toBeTruthy();
    expect(screen.queryByText('Buka WhatsApp')).toBeNull();
  });
});

// The three digits that make a bank transfer identifiable. Rendered wrong, the
// buyer sends a round number and the shop gets a credit matching nothing.
describe('PaymentPanel and the unique code', () => {
  const manual = {
    kind: 'manual_transfer',
    method: 'MANUAL_BCA',
    amount: 75137,
    manual_bank: 'BCA',
    manual_account_number: '1234567890',
    manual_account_holder: 'Lily Alora',
  };

  it('marks the code inside the amount and explains it', () => {
    render(
      <PaymentPanel order={{ ...order, unique_code: 137 }} payment={manual} onRefresh={() => {}} />,
    );

    // Twice, and deliberately: once marked inside the amount, where the
    // mistake gets made, and once in the sentence that says why it matters.
    // Either alone leaves a buyer who reads only one of them.
    expect(screen.getAllByText('137')).toHaveLength(2);
    expect(screen.getByText(/Transfer tepat sampai/)).toBeTruthy();
  });

  it('leaves a gateway amount as one unbroken number', () => {
    render(
      <PaymentPanel
        order={order}
        payment={{ kind: 'va', method: 'BCA', amount: 75000, va_bank: 'BCA', va_number: '8808123' }}
        onRefresh={() => {}}
      />,
    );

    expect(screen.getByText('Rp 75.000')).toBeTruthy();
  });
});

// A manual payment produces no callback, so this button is the only signal the
// shop ever gets. It has to appear exactly where the server would accept it.
describe('PaymentPanel and the claim', () => {
  const manual = {
    kind: 'manual_transfer',
    method: 'MANUAL_BCA',
    amount: 75137,
    manual_bank: 'BCA',
    manual_account_number: '1234567890',
    manual_account_holder: 'Lily Alora',
  };

  it('offers the button on an unclaimed manual order', () => {
    const onClaim = vi.fn();
    render(
      <PaymentPanel
        order={{ ...order, unique_code: 137 }}
        payment={manual}
        onRefresh={() => {}}
        onClaim={onClaim}
      />,
    );

    fireEvent.click(screen.getByText('Saya sudah bayar'));
    expect(onClaim).toHaveBeenCalled();
  });

  it('replaces it with the waiting state once claimed', () => {
    render(
      <PaymentPanel
        order={{ ...order, unique_code: 137, buyer_claimed_at: new Date().toISOString() }}
        payment={manual}
        onRefresh={() => {}}
        onClaim={() => {}}
      />,
    );

    expect(screen.getByText('Menunggu konfirmasi penjual')).toBeTruthy();
    // Pressing it again does nothing the server would accept, so it is gone.
    expect(screen.queryByText('Saya sudah bayar')).toBeNull();
  });

  it('offers it on a WhatsApp order with chat wording, not bank wording', () => {
    const onClaim = vi.fn();
    render(
      <PaymentPanel
        order={order}
        payment={{ kind: 'manual_whatsapp', method: 'MANUAL_WHATSAPP', amount: 75000, manual_whatsapp_phone: '628123' }}
        onRefresh={() => {}}
        onClaim={onClaim}
      />,
    );
    expect(screen.getByText(/disepakati di WhatsApp/)).toBeTruthy();
    expect(screen.queryByText(/transfer terkirim/)).toBeNull();
    fireEvent.click(screen.getByText('Saya sudah bayar'));
    expect(onClaim).toHaveBeenCalled();
  });

  it('never offers it on a gateway order, where nobody has to be told', () => {
    render(
      <PaymentPanel
        order={order}
        payment={{ kind: 'va', method: 'BCA', amount: 75000, va_bank: 'BCA', va_number: '8808123' }}
        onRefresh={() => {}}
        onClaim={() => {}}
      />,
    );

    expect(screen.queryByText('Saya sudah bayar')).toBeNull();
  });
});

// The cases where the dead end is correct. Showing a code that scans and does
// the wrong thing is worse for a buyer than showing none, so these must keep
// falling back.
describe('PaymentPanel refuses what it cannot render', () => {
  it('falls back when a URL arrives in the payload field', () => {
    // Exactly the bug: Sakurupiah returns an image URL, the old adapter stored
    // it as a qr payload, and kind said "qr". The storefront was right to
    // refuse -- which is why the fix belongs in the adapter, not here.
    panel({
      kind: 'qr',
      method: 'QRIS',
      amount: 75000,
      qr_payload: 'https://sakurupiah.id/qr-codeIMG/TRX1788086870-PDC3yb2gKMT.png',
    });

    expect(screen.getByText(/QRIS mode uji/)).toBeTruthy();
  });

  it('falls back on an http image, which the browser drops as mixed content', () => {
    panel({
      kind: 'qr_image',
      method: 'QRIS',
      amount: 75000,
      qr_image_url: 'http://sakurupiah.id/qr-codeIMG/TRX-1.png',
    });

    expect(screen.getByText(/QRIS mode uji/)).toBeTruthy();
  });

  it('offers a person when there is no payment at all', () => {
    // An intent that failed to open. The order is still valid and payable, so
    // this must not look like an error page.
    panel(null);

    expect(screen.getByText(/Pembayaran belum bisa dibuka/)).toBeTruthy();
  });
});

// The defect this file failed to catch. A charge that dies at checkout returns
// no payment object; one that dies later returns a row with an empty kind. Both
// are the same failure, and the second used to render "Metode pembayaran ini
// belum aktif" -- on a live method, on an order the buyer could still pay.
describe('PaymentPanel when the charge never opened', () => {
  const failed = { status: 'failed', method: 'QRIS', kind: '', amount: 200 };

  it('says the same thing whether the intent is missing or failed', () => {
    panel(null);
    const missing = screen.getByText(/Pembayaran belum bisa dibuka/);
    cleanup();

    panel(failed);
    const dead = screen.getByText(/Pembayaran belum bisa dibuka/);

    expect(missing.textContent).toBe(dead.textContent);
  });

  it('never claims the method is switched off', () => {
    panel(failed);

    expect(screen.queryByText(DEAD_END)).toBeNull();
  });

  it('drops the countdown and the check-now button, which cannot help', () => {
    panel(failed);

    expect(screen.queryByText(/Cek sekarang/)).toBeNull();
    expect(screen.queryByText(/^Sisa/)).toBeNull();
    expect(screen.queryByText(/memperbarui sendiri/)).toBeNull();
  });

  it('names the order and says it is still payable', () => {
    panel(failed);

    expect(screen.getByText(/LA-260830-0001/)).toBeTruthy();
    expect(screen.getByText(/masih bisa dibayar/)).toBeTruthy();
    // The deadline is stated, not counted down.
    expect(screen.getByText(/Batas pembayaran/)).toBeTruthy();
  });

  it('asks the server to re-open the payment', () => {
    const onRetry = vi.fn();
    panel(failed, { onRetry });

    fireEvent.click(screen.getByText('Coba lagi'));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('will not fire twice while a retry is in flight', () => {
    const onRetry = vi.fn();
    panel(failed, { onRetry, retrying: true });

    const button = screen.getByText('Membuat ulang…');
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("renders the server's refusal verbatim", () => {
    // API messages are Indonesian copy written for a buyer, so the server owns
    // the wording and this component must not paraphrase it.
    const message = 'Pembayaranmu sudah masuk. Halaman ini akan menyesuaikan sebentar lagi.';
    panel(failed, { onRetry: () => {}, retryError: { message } });

    expect(screen.getByText(message)).toBeTruthy();
  });

  it('still says something useful with no retry wired', () => {
    panel(failed);

    expect(screen.queryByText('Coba lagi')).toBeNull();
    expect(screen.getByText(/Pembayaran belum bisa dibuka/)).toBeTruthy();
    expect(screen.getByText(/Hubungi kami/)).toBeTruthy();
  });

  // The suppression above must be scoped to the dead branch and nothing else.
  it('leaves a live payment panel alone', () => {
    panel({ status: 'pending', kind: 'qr', method: 'QRIS', amount: 75000, qr_payload: emvco });

    expect(screen.getByText(/Cek sekarang/)).toBeTruthy();
    expect(screen.queryByText(/Pembayaran belum bisa dibuka/)).toBeNull();
  });
});
