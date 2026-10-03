import { Link } from 'react-router-dom';

import { useConfig } from '@sepetakhq/storefront-kit/config/ConfigProvider';
import { useCategories } from '@sepetakhq/storefront-kit/hooks/queries';

import { BrandMark } from './BrandMark.jsx';
import Icon from '../ui/Icon.jsx';
import { chips, footerLinks, sectionText, socialAbbr, socialLabel } from '../lib/copy.js';

/**
 * The design's dark footer, from config alone: the mark, tagline and
 * socials; the merchant's own links; the categories; contact; and, along the
 * bottom, the copyright and the payment methods the shop has switched on. A
 * column with nothing to list is not drawn, so a bare new shop gets a short
 * footer rather than headings over nothing.
 */
export default function Footer() {
  const { brand, paymentMethods } = useConfig();
  const { data: categories } = useCategories();
  const payments = (paymentMethods ?? []).filter((m) => m.enabled && m.name);
  const socials = (brand.social_links ?? []).filter((s) => s.url);
  const links = footerLinks(brand.nav);
  const cats = categories ?? [];
  const address = [brand.address_line1, brand.address_line2].filter(Boolean);
  const phoneHref = brand.phone ? `tel:${String(brand.phone).replace(/[^\d+]/g, '')}` : '';
  const hasContact = Boolean(brand.phone || brand.email || address.length);

  return (
    <footer className="pc-footer">
      <div className="pc-footer-grid">
        <div className="pc-footer-col pc-footer-wide">
          <Link to="/" aria-label="Beranda" style={{ alignSelf: 'flex-start' }}>
            <BrandMark height={36} maxWidth={180} tone="dark" />
          </Link>
          {brand.tagline && <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--pc-foot-dim)', textWrap: 'pretty' }}>{brand.tagline}</p>}
          {socials.length > 0 && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {socials.map((s, i) => (
                <a
                  key={`${s.kind}-${i}`}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={socialLabel(s.kind)}
                  title={socialLabel(s.kind)}
                  className="pc-social"
                >
                  {socialAbbr(s.kind)}
                </a>
              ))}
            </div>
          )}
        </div>

        {links.length > 0 && (
          <nav className="pc-footer-col" aria-label={sectionText(brand.sections, 'footer_shop_heading')}>
            <h4>{sectionText(brand.sections, 'footer_shop_heading')}</h4>
            {links.map((n) => (
              <Link key={n.path} to={n.path}>
                {n.label}
              </Link>
            ))}
          </nav>
        )}

        {cats.length > 0 && (
          <nav className="pc-footer-col" aria-label={sectionText(brand.sections, 'footer_categories_heading')}>
            <h4>{sectionText(brand.sections, 'footer_categories_heading')}</h4>
            {cats.map((c) => (
              <Link key={c.key} to={`/katalog?cat=${encodeURIComponent(c.key)}`}>
                {c.label}
              </Link>
            ))}
          </nav>
        )}

        {hasContact && (
          <div className="pc-footer-col pc-footer-wide">
            <h4>{sectionText(brand.sections, 'footer_contact_heading')}</h4>
            {brand.phone && (
              <a href={phoneHref} style={contactRow}>
                <Icon name="phone" size={17} style={{ color: 'var(--pc-lime)' }} />
                {brand.phone}
              </a>
            )}
            {brand.email && (
              <a href={`mailto:${brand.email}`} style={contactRow}>
                <Icon name="mail" size={17} style={{ color: 'var(--pc-lime)' }} />
                {brand.email}
              </a>
            )}
            {address.length > 0 && (
              <span style={{ ...contactRow, alignItems: 'flex-start', lineHeight: 1.5 }}>
                <Icon name="pin" size={17} style={{ color: 'var(--pc-lime)', marginTop: 2 }} />
                <span>
                  {address.map((l, i) => (
                    <span key={i} style={{ display: 'block' }}>
                      {l}
                    </span>
                  ))}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {(brand.copyright || payments.length > 0) && (
        <div className="pc-footer-bottom">
          <div>
            <span>{brand.copyright || ''}</span>
            {payments.length > 0 && (
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span>{sectionText(brand.sections, 'footer_payment_heading')}:</span>
                {chips(payments).map((m) =>
                  m.logo_url ? (
                    <span key={m.code} className="pc-footer-chip pc-logo-chip" title={m.name}>
                      <img src={m.logo_url} alt={m.name} loading="lazy" />
                    </span>
                  ) : (
                    <span key={m.code} className="pc-footer-chip">
                      {m.name}
                    </span>
                  ),
                )}
              </span>
            )}
          </div>
        </div>
      )}
    </footer>
  );
}

const contactRow = { display: 'flex', gap: 10, alignItems: 'center' };
