import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

const config = { brand: {} };
vi.mock('@sepetakhq/storefront-kit/config/ConfigProvider', () => ({
  useConfig: () => config,
}));

const AboutScreen = (await import('./About.jsx')).default;
const About = () => (
  <MemoryRouter>
    <AboutScreen />
  </MemoryRouter>
);

function withBrand(brand) {
  config.brand = { heroImages: [], ...brand };
}

describe('About', () => {
  it('renders the merchant’s story, one paragraph per blank line', () => {
    withBrand({ aboutTitle: 'Lily Alora', aboutBody: 'Satu.\n\nDua.' });
    render(<About />);

    expect(screen.getByRole('heading', { name: 'Lily Alora' })).toBeTruthy();
    expect(screen.getByText('Satu.')).toBeTruthy();
    expect(screen.getByText('Dua.')).toBeTruthy();
  });

  // The heading and the shop's name are the same string for most shops, so a
  // merchant who left the title empty gets their name, not an empty h1.
  it('falls back to the wordmark for the heading', () => {
    withBrand({ aboutTitle: '', wordmark_primary: 'Lily', wordmark_accent: 'Alora' });
    render(<About />);

    expect(screen.getByRole('heading', { name: 'Lily Alora' })).toBeTruthy();
  });

  // An empty story renders nothing rather than one empty paragraph, which
  // would leave a gap above the contact box with no explanation.
  it('renders no paragraphs for an empty story', () => {
    withBrand({ aboutTitle: 'Lily Alora', aboutBody: '' });
    const { container } = render(<About />);

    expect(container.querySelectorAll('p').length).toBe(0);
    expect(screen.getByRole('heading', { name: 'Lily Alora' })).toBeTruthy();
  });

  // The body is copy a merchant typed into the backoffice. The shortest path
  // from "let them use bold" to "let them inject a script" runs through this
  // element, so the markup has to arrive as text.
  it('renders the story as text, never as markup', () => {
    withBrand({
      aboutTitle: 'Lily Alora',
      aboutBody: '<img src=x onerror="alert(1)"><b>tebal</b>',
    });
    const { container } = render(<About />);

    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<img src=x onerror="alert(1)"><b>tebal</b>')).toBeTruthy();
  });

  // The portrait arrives already resolved: the API substitutes the borrowed
  // hero, so this page never reaches into heroImages itself.
  it('renders the portrait the API resolved', () => {
    withBrand({
      aboutTitle: 'Lily Alora',
      aboutImage: { url: 'https://cdn.test/portrait.jpg', srcset: '', alt: 'Pendiri' },
      // Present and deliberately different: picking this one would mean the
      // fallback had crept back into the frontend.
      heroImages: [{ url: 'https://cdn.test/hero.jpg', alt: 'hero' }],
    });
    render(<About />);

    const img = screen.getByAltText('Pendiri');
    expect(img.getAttribute('src')).toBe('https://cdn.test/portrait.jpg');
  });

  // A tenant with no heroes and no portrait. Img renders its placeholder;
  // nothing here may throw reaching into an empty list.
  it('survives a tenant with no portrait at all', () => {
    withBrand({ aboutTitle: 'Lily Alora', aboutImage: null, heroImages: [] });
    expect(() => render(<About />)).not.toThrow();
  });

  it('names the shop in the landmark label', () => {
    withBrand({ aboutTitle: 'Toko Lain' });
    render(<About />);

    expect(screen.getByLabelText('Tentang Toko Lain')).toBeTruthy();
  });

  it('draws a contact card only for what the merchant filled in', () => {
    withBrand({ aboutTitle: 'Ayuna', opening_hours: 'Senin–Sabtu', phone: '0812' });
    render(<About />);
    expect(screen.getByText('Jam buka')).toBeTruthy();
    expect(screen.getByText('Hubungi kami')).toBeTruthy();
    expect(screen.queryByText('Alamat toko')).toBeNull();
    cleanup();
    withBrand({ aboutTitle: 'Ayuna' });
    render(<About />);
    expect(screen.queryByText('Jam buka')).toBeNull();
  });

  it('titles the cards and the WhatsApp button with the shop\'s words, else its own', () => {
    withBrand({
      aboutTitle: 'Ayuna', address_line1: 'Jl. Riau 18', opening_hours: 'Senin–Sabtu', phone: '0812',
      whatsapp_url: 'https://wa.me/628', whatsapp_text: 'Chat admin',
      sections: { about_address_heading: 'Lokasi', about_hours_heading: ' ', about_contact_heading: 'Telepon' },
    });
    render(<About />);
    expect(screen.getByText('Lokasi')).toBeTruthy();
    expect(screen.getByText('Jam buka')).toBeTruthy();
    expect(screen.getByText('Telepon')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chat admin' })).toBeTruthy();
  });
});
