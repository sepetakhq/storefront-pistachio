import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { useConfig } from '@sepetakhq/storefront-kit/config/ConfigProvider';
import { useHome } from '@sepetakhq/storefront-kit/hooks/queries';
import { qk } from '@sepetakhq/storefront-kit/api/queryKeys';
import { serverNow } from '@sepetakhq/storefront-kit/api/client';

import ProductCard from '../components/ProductCard.jsx';
import { Tile } from '../components/Tile.jsx';
import { Img, SIZES } from '../ui/Img.jsx';
import Icon from '../ui/Icon.jsx';
import { CountdownCells } from '../ui/Countdown.jsx';
import { EmptyState, ErrorState, ProductGridSkeleton, Skeleton } from '../ui/states.jsx';
import { bannerTheme, campaignHeadline, featureMark, heroChips, sectionText, showCountdown, storyFacts } from '../lib/copy.js';

/** Products beyond which the carousel earns its arrows. */
export const RAIL_ARROWS_AFTER = 4;

/** The home page is the section list the merchant published, in order. */
export default function HomeRoute() {
  const { data, isPending, isError, error, refetch } = useHome();

  if (isPending) return <HomeSkeleton />;
  if (isError) {
    return (
      <div className="pc-wrap" style={{ paddingTop: 60 }}>
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }
  const sections = (data?.sections ?? []).filter(renders);
  if (sections.length === 0) return <EmptyHome />;
  const hasCats = sections.some((s) => s.type === 'cats');

  return (
    <main>
      {sections.map((sec, i) => (
        <Section key={sec.id ?? i} sec={sec} hasCats={hasCats} />
      ))}
    </main>
  );
}

/** Whether a section has anything to draw; an empty one is skipped. */
export function renders(sec) {
  switch (sec?.type) {
    case 'hero':
      return Boolean(sec.hero?.title);
    case 'features':
      return Boolean(sec.features?.items?.length);
    case 'cats':
      return Boolean(sec.cats?.length);
    case 'campaign':
      return Boolean(sec.campaign);
    case 'grid':
    case 'carousel':
      return Boolean(sec.grid?.products?.length);
    case 'story':
      return Boolean(sec.story?.title);
    case 'banner':
      return Boolean(sec.banner?.text);
    default:
      // A type this bundle predates: skipped, the way the resolver skips one
      // it does not know.
      return false;
  }
}

function Section({ sec, hasCats }) {
  switch (sec.type) {
    case 'hero':
      return <Hero hero={sec.hero} hasCats={hasCats} />;
    case 'features':
      return <Features features={sec.features} />;
    case 'cats':
      return <Categories cats={sec.cats} />;
    case 'campaign':
      return <Campaign campaign={sec.campaign} />;
    case 'grid':
    case 'carousel':
      return <Rail grid={sec.grid} />;
    case 'story':
      return <Story story={sec.story} />;
    case 'banner':
      return <Banner banner={sec.banner} />;
    default:
      return null;
  }
}

/* --- hero ---------------------------------------------------------------- */

function Hero({ hero, hasCats }) {
  const config = useConfig();
  const { brand } = config;
  const picture = brand.heroImages?.[0];
  const chips = heroChips(config);

  // The secondary button jumps to the categories on this page when there are
  // any, and to the catalogue otherwise.
  const toCats = (e) => {
    const el = document.getElementById('kategori');
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return (
    <section className="pc-hero">
      <div className="pc-hero-row">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
          {brand.hero_eyebrow && (
            <span className="pc-eyebrow">
              <Icon name="leaf" size={18} strokeWidth={1.4} fill="var(--pc-leaf)" style={{ color: 'var(--pc-green)' }} />
              {brand.hero_eyebrow}
            </span>
          )}
          <h1>
            {hero.title}
            {hero.em ? (
              <>
                {' '}
                <em>{hero.em}</em>
              </>
            ) : null}
          </h1>
          {hero.sub && <p className="pc-hero-sub">{hero.sub}</p>}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Link to="/katalog" className="pc-btn pc-btn-primary">
              {hero.cta || 'Belanja sekarang'}
            </Link>
            <Link to="/katalog" onClick={hasCats ? toCats : undefined} className="pc-btn pc-btn-outline">
              {sectionText(brand.sections, hasCats ? 'hero_secondary_cta' : 'grid_see_all')}
            </Link>
          </div>
          {chips.length > 0 && (
            <ul className="pc-chips" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {chips.map((c) => (
                <li key={c.title} className="pc-chip">
                  <Icon name={c.icon} size={24} strokeWidth={1.6} style={{ color: 'var(--pc-green)' }} />
                  <span>
                    <b>{c.title}</b>
                    {c.items?.some((x) => x.logo_url) ? (
                      <span className="pc-chip-marks">
                        {c.items.map((x) =>
                          x.logo_url ? <img key={x.logo_url} src={x.logo_url} alt={x.name} loading="lazy" /> : <span key={x.name}>{x.name}</span>,
                        )}
                      </span>
                    ) : (
                      <span>{c.sub}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="pc-hero-media">
          <Img
            src={picture?.url}
            srcSet={picture?.srcset}
            sizes={SIZES.hero}
            alt={picture?.alt ?? ''}
            ratio="5/4"
            priority
            style={{ position: 'absolute', inset: 0, aspectRatio: 'auto', background: 'var(--pc-sage)' }}
            fallback={<LeafFill />}
          />
        </div>
      </div>
    </section>
  );
}

/** What an image slot shows before the merchant uploads one: the leaf. */
function LeafFill({ size = 96 }) {
  return (
    <div aria-hidden="true" style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--pc-leaf)' }}>
      <Icon name="leaf" size={size} strokeWidth={1} />
    </div>
  );
}

/* --- features ----------------------------------------------------------- */

function Features({ features }) {
  return (
    <section className="pc-wrap" style={{ marginTop: 32, width: '100%' }} aria-label={features.title || undefined}>
      <ul className="pc-strip" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {features.items.map((it, i) => {
          const mark = featureMark(it.mark);
          return (
            <li key={i} className="pc-feature">
              <span className="pc-feature-mark" aria-hidden="true">
                {mark.icon ? <Icon name={mark.icon} size={30} strokeWidth={1.5} /> : mark.text}
              </span>
              <span style={{ minWidth: 0 }}>
                <b>{it.title}</b>
                {it.body && <span>{it.body}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* --- categories --------------------------------------------------------- */

function Categories({ cats }) {
  const { brand } = useConfig();
  return (
    <section id="kategori" className="pc-section" style={{ scrollMarginTop: 90 }}>
      <div className="pc-inner">
        <div className="pc-head">
          <h2 className="pc-h2">{sectionText(brand.sections, 'cats_heading')}</h2>
        </div>
        <div className="pc-cats">
          {cats.map((c) => (
            <Link key={c.key} to={`/katalog?cat=${encodeURIComponent(c.key)}`} className="pc-cat">
              <Img
                src={c.image}
                srcSet={c.image_srcset}
                sizes={SIZES.categoryTile}
                alt=""
                ratio="4/3"
                fallback={<Tile label={c.label} tintKey={c.key} size={30} />}
              />
              <span className="pc-cat-body">
                <span>
                  <b>{c.label}</b>
                  {c.subtitle && <span>{c.subtitle}</span>}
                </span>
                <Icon name="next" size={18} strokeWidth={2} style={{ color: 'var(--pc-green)' }} />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --- carousel ----------------------------------------------------------- */

function Rail({ grid }) {
  const { brand } = useConfig();
  const track = useRef(null);
  const scroll = (dir) => {
    const el = track.current;
    if (!el) return;
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: smooth ? 'smooth' : 'auto' });
  };
  const arrows = grid.products.length > RAIL_ARROWS_AFTER;

  return (
    <section className="pc-section" style={{ paddingBottom: 8 }}>
      <div className="pc-inner">
        <div className="pc-head">
          <h2 className="pc-h2">{grid.title || 'Produk pilihan'}</h2>
          <Link to="/katalog" className="pc-see-all">
            {sectionText(brand.sections, 'grid_see_all')} →
          </Link>
        </div>
        <div className="pc-rail">
          {arrows && (
            <>
              <button type="button" className="pc-rail-arrow prev" aria-label="Sebelumnya" onClick={() => scroll(-1)}>
                <Icon name="prev" size={18} strokeWidth={2} />
              </button>
              <button type="button" className="pc-rail-arrow next" aria-label="Berikutnya" onClick={() => scroll(1)}>
                <Icon name="next" size={18} strokeWidth={2} />
              </button>
            </>
          )}
          <ul ref={track} className="pc-rail-track" style={{ listStyle: 'none', margin: 0 }}>
            {grid.products.map((p) => (
              <li key={p.id} className="pc-rail-item">
                <ProductCard p={p} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* --- story -------------------------------------------------------------- */

function Story({ story }) {
  const { brand } = useConfig();
  const portrait = brand.aboutImage;
  const facts = storyFacts(brand);
  const stats = (brand.heroStats ?? []).filter((s) => s?.value || s?.label);

  return (
    <section style={{ marginTop: 'clamp(48px, 8vw, 72px)' }}>
      <div className="pc-story">
        <div className="pc-story-media">
          <Img
            src={portrait?.url}
            srcSet={portrait?.srcset}
            sizes={SIZES.hero}
            alt={portrait?.alt ?? ''}
            ratio="auto"
            style={{ position: 'absolute', inset: 0, background: 'var(--pc-sage)' }}
            fallback={<LeafFill />}
          />
        </div>
        <div style={{ padding: '48px clamp(24px, 4vw, 56px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
          <span className="pc-eyebrow" style={{ fontSize: 12 }}>
            <Icon name="leaf" size={16} strokeWidth={1.4} fill="var(--pc-leaf)" style={{ color: 'var(--pc-green)' }} />
            {sectionText(brand.sections, 'story_eyebrow')}
          </span>
          <h2>{story.title}</h2>
          {story.text && <p>{story.text}</p>}
          <Link to="/tentang" className="pc-btn pc-btn-primary" style={{ alignSelf: 'flex-start', marginTop: 6, minHeight: 44, padding: '0 22px', fontSize: 14 }}>
            {sectionText(brand.sections, 'story_cta')}
          </Link>
        </div>
        {facts.length > 0 && (
          <div style={{ padding: '48px clamp(24px, 3vw, 40px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 24 }}>
            {facts.map((f) => {
              const body = (
                <>
                  <span className="pc-fact-icon">
                    <Icon name={f.icon} size={22} strokeWidth={1.6} />
                  </span>
                  <span>
                    <b>{f.title}</b>
                    <span>{f.sub}</span>
                  </span>
                </>
              );
              return f.href ? (
                <a key={f.icon} href={f.href} target="_blank" rel="noopener noreferrer" className="pc-fact">
                  {body}
                </a>
              ) : (
                <Link key={f.icon} to={f.to} className="pc-fact">
                  {body}
                </Link>
              );
            })}
          </div>
        )}
      </div>
      {stats.length > 0 && (
        <div className="pc-wrap" style={{ marginTop: 24 }}>
          <dl className="pc-strip" style={{ margin: 0, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            {stats.map((s, i) => (
              <div key={i} className="pc-stat" style={{ flexDirection: 'column-reverse' }}>
                <dt>
                  <span>{s.label}</span>
                </dt>
                <dd style={{ margin: 0 }}>
                  <b>{s.value}</b>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}

/* --- campaign ----------------------------------------------------------- */

function Campaign({ campaign }) {
  const qc = useQueryClient();
  const { brand } = useConfig();
  const products = campaign.products ?? [];
  // A countdown only for a real, near deadline: none for a promotion with no
  // end date, one already past, or one weeks away.
  const ticking = showCountdown(campaign.ends_at, serverNow());
  const heading = String(campaign.headline ?? '').trim() || campaign.title || campaignHeadline(campaign);

  return (
    <section className="pc-wrap" style={{ marginTop: 'clamp(48px, 8vw, 72px)', width: '100%' }}>
      <div className="pc-campaign">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {campaign.badge && <span className="pc-badge">{campaign.badge}</span>}
            <h2 style={{ margin: 0, fontWeight: 700, fontSize: 'clamp(24px, 2.6vw, 30px)' }}>{heading}</h2>
          </div>
          {ticking && (
            <CountdownCells
              until={campaign.ends_at}
              label={sectionText(brand.sections, 'countdown_label')}
              onExpire={() => qc.invalidateQueries({ queryKey: qk.home })}
            />
          )}
        </div>
        {products.length > 0 && (
          <div className="pc-grid">
            {products.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
        <Link to="/katalog?sale=1" className="pc-see-all" style={{ alignSelf: 'center' }}>
          {sectionText(brand.sections, 'campaign_cta')} →
        </Link>
      </div>
    </section>
  );
}

/* --- banner ------------------------------------------------------------- */

function Banner({ banner }) {
  const theme = bannerTheme(banner.bg);
  return (
    <section className={theme.className}>
      <div className="pc-banner-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px, 3vw, 20px)', flex: '1 1 280px', minWidth: 0 }}>
          <Icon
            name="leaf"
            size={44}
            strokeWidth={1}
            fill={theme.leaf ? 'var(--pc-leaf)' : 'none'}
            style={{ color: theme.leaf ? 'var(--pc-lime)' : 'var(--pc-green)' }}
          />
          <p>{banner.text}</p>
        </div>
        {banner.cta && (
          <Link to="/katalog" className={theme.button}>
            {banner.cta}
          </Link>
        )}
      </div>
    </section>
  );
}

/* --- states ------------------------------------------------------------- */

function EmptyHome() {
  return (
    <div className="pc-wrap" style={{ paddingTop: 60 }}>
      <EmptyState
        title="Toko sedang disiapkan"
        body="Halaman depan belum diisi. Katalognya sudah bisa dilihat."
        action={
          <Link to="/katalog" className="pc-btn pc-btn-primary">
            Lihat katalog
          </Link>
        }
      />
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true">
      <div style={{ background: 'var(--pc-mist)', height: 420 }} />
      <div className="pc-wrap" style={{ paddingTop: 48 }}>
        <Skeleton height={28} width={260} />
        <div style={{ marginTop: 16 }}>
          <ProductGridSkeleton count={5} />
        </div>
      </div>
    </div>
  );
}
