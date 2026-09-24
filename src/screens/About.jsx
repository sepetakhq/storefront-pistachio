import { Link } from 'react-router-dom';

import { Img, SIZES } from '../ui/Img.jsx';
import Icon from '../ui/Icon.jsx';
import { useConfig } from '@sepetakhq/storefront-kit/config/ConfigProvider';
import { paragraphs } from '@sepetakhq/storefront-kit/shared/format';

import { sectionText } from '../lib/copy.js';

export default function About() {
  const { brand } = useConfig();
  // Already resolved by the API: a merchant who has not chosen a portrait gets
  // the hero this page has always borrowed.
  const portrait = brand.aboutImage;
  const name = [brand.wordmark_primary, brand.wordmark_accent].filter(Boolean).join(' ');
  // An unset title renders the wordmark rather than an empty h1.
  const title = brand.aboutTitle || name;
  const story = paragraphs(brand.aboutBody);
  // The page's name in the breadcrumb is what the shop calls it in its nav.
  const crumb = brand.nav?.find((n) => n.path === '/tentang')?.label || sectionText(brand.sections, 'story_cta');

  // Each card only when the merchant filled it in: three headings over
  // nothing read as a broken page, not a quiet one.
  const address = [brand.address_line1, brand.address_line2].filter(Boolean);
  const contact = [brand.phone, brand.email].filter(Boolean);
  const cards = [
    address.length && { icon: 'pin', title: sectionText(brand.sections, 'about_address_heading'), lines: address },
    brand.opening_hours && { icon: 'clock', title: sectionText(brand.sections, 'about_hours_heading'), lines: [brand.opening_hours] },
    contact.length && { icon: 'chat', title: sectionText(brand.sections, 'about_contact_heading'), lines: contact },
  ].filter(Boolean);

  return (
    <main aria-label={`Tentang ${title}`}>
      <section className="pc-pagehead">
        <div className="pc-inner" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <nav aria-label="Breadcrumb" className="pc-crumbs">
            <Link to="/">Beranda</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{crumb}</span>
          </nav>
          <h1 style={{ textWrap: 'balance' }}>{title}</h1>
        </div>
      </section>

      <section className="pc-story" style={{ background: 'var(--pc-white)' }}>
        <div style={{ padding: '48px clamp(24px, 4vw, 56px)', display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center' }}>
          <span className="pc-eyebrow" style={{ fontSize: 12 }}>
            <Icon name="leaf" size={16} strokeWidth={1.4} fill="var(--pc-leaf)" style={{ color: 'var(--pc-green)' }} />
            {sectionText(brand.sections, 'story_eyebrow')}
          </span>
          {/* Text nodes, never dangerouslySetInnerHTML: the body is copy a
              merchant typed into the backoffice. */}
          {story.map((para, i) => (
            <p key={i} style={{ fontSize: 16, lineHeight: 1.75 }}>
              {para}
            </p>
          ))}
          {brand.whatsapp_url && (
            <a href={brand.whatsapp_url} target="_blank" rel="noopener noreferrer" className="pc-btn pc-btn-primary" style={{ alignSelf: 'flex-start', marginTop: 6 }}>
              <Icon name="chat" size={18} />
              {brand.whatsapp_text || 'Chat WhatsApp'}
            </a>
          )}
        </div>
        <div className="pc-story-media">
          <Img
            src={portrait?.url}
            srcSet={portrait?.srcset}
            alt={portrait?.alt || name}
            ratio="auto"
            sizes={SIZES.hero}
            style={{ position: 'absolute', inset: 0, background: 'var(--pc-sage)' }}
            fallback={
              <div aria-hidden="true" style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--pc-leaf)' }}>
                <Icon name="leaf" size={96} strokeWidth={1} />
              </div>
            }
          />
        </div>
      </section>

      {cards.length > 0 && (
        <section className="pc-wrap" style={{ paddingTop: 32, width: '100%' }}>
          <div className="pc-strip" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {cards.map((c, i) => (
              <div key={i} className="pc-fact" style={{ padding: 24, alignItems: 'flex-start' }}>
                <span className="pc-fact-icon">
                  <Icon name={c.icon} size={22} strokeWidth={1.6} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <b>{c.title}</b>
                  {c.lines.map((l, j) => (
                    <span key={j} style={{ fontSize: 15, color: 'var(--pc-body)', overflowWrap: 'anywhere' }}>
                      {l}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
