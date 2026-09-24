import { Link, useSearchParams } from 'react-router-dom';

import { useCategories, useProducts } from '@sepetakhq/storefront-kit/hooks/queries';
import { useConfig } from '@sepetakhq/storefront-kit/config/ConfigProvider';

import ProductCard from '../components/ProductCard.jsx';
import { EmptyState, ErrorState, InlineError, ProductGridSkeleton } from '../ui/states.jsx';
import { SORTS, catalogChips, catalogTitle, sectionText, sortOrDefault } from '../lib/copy.js';

/**
 * The catalogue. Every filter lives in the URL -- `cat`, `sale`, `q`,
 * `sort` -- so a filtered page is a link and the back button unwinds it.
 * All four are the API's: `sale=1` asks for `on_sale`, so the promo list is
 * complete on every page rather than whatever the first page happened to hold.
 */
export default function CatalogRoute() {
  const [params, setParams] = useSearchParams();
  const cat = params.get('cat') || '';
  const sort = sortOrDefault(params.get('sort'));
  const sale = params.get('sale') === '1';
  const q = (params.get('q') ?? '').trim();

  const { brand, copy } = useConfig();
  const promoTitle = sectionText(brand.sections, 'promo_title');
  const categories = useCategories();
  const products = useProducts({ cat, sort, q, on_sale: sale ? 1 : undefined });
  const cats = categories.data ?? [];

  const setSort = (value) => {
    const next = new URLSearchParams(params);
    if (value === 'featured') next.delete('sort');
    else next.set('sort', value);
    setParams(next);
  };

  const items = (products.data?.pages ?? []).flatMap((p) => p.products ?? []);
  const filters = { cat, sale, q };
  const title = catalogTitle(filters, cats, promoTitle);
  const chips = catalogChips(cats, filters, sort, promoTitle);
  const filtered = Boolean(cat || sale || q);
  const current = cats.find((c) => c.key === cat);
  const sub = q ? 'Pencarian nama produk' : sale ? sectionText(brand.sections, 'promo_subtitle', copy) : current?.subtitle ?? '';

  return (
    <main aria-label="Katalog">
      <section className="pc-pagehead">
        <div className="pc-inner" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <nav aria-label="Breadcrumb" className="pc-crumbs">
            <Link to="/">Beranda</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{title}</span>
          </nav>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 640, minWidth: 0 }}>
              <h1 style={{ overflowWrap: 'anywhere' }}>{title}</h1>
              {sub && <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--pc-body)' }}>{sub}</div>}
              <span style={{ fontSize: 14, color: 'var(--pc-muted)' }} aria-live="polite">
                {products.isPending ? 'Memuat…' : `${items.length}${products.hasNextPage ? '+' : ''} produk`}
              </span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--pc-body)', fontWeight: 500 }}>
              <span>Urutkan</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                style={{ height: 40, border: '1px solid var(--pc-line-2)', borderRadius: 8, background: 'var(--pc-white)', padding: '0 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {categories.isError ? (
            <InlineError error={categories.error} onRetry={categories.refetch} />
          ) : (
            // One scrolling row, not a wrapping block: ten categories would
            // otherwise push the products below the fold on a phone.
            <nav aria-label="Kategori" className="hs" style={{ display: 'flex', gap: 8, margin: '0 calc(-1 * var(--pc-gutter))', padding: '2px var(--pc-gutter)' }}>
              {chips.map((c) => (
                <Link key={c.key} to={c.to} className="pc-pill" aria-current={c.current ? 'true' : undefined}>
                  {c.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </section>

      <section className="pc-wrap" style={{ paddingTop: 32, width: '100%' }}>
        {filtered && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
            <Link to={sort === 'featured' ? '/katalog' : `/katalog?sort=${sort}`} className="pc-pill">
              <span>Hapus filter</span>
              <span aria-hidden="true">×</span>
            </Link>
          </div>
        )}

        {products.isPending ? (
          <ProductGridSkeleton count={8} />
        ) : products.isError ? (
          <ErrorState error={products.error} onRetry={products.refetch} />
        ) : items.length === 0 ? (
          <EmptyState
            title={sale ? 'Belum ada promo saat ini' : 'Belum ada produk yang cocok'}
            body={q ? `Tidak ada produk bernama “${q}”. Coba kata kunci lain atau pilih kategori.` : sale ? 'Promo berikutnya akan muncul di sini.' : 'Coba kategori lain atau lihat semua produk.'}
            action={
              <Link to="/katalog" className="pc-btn pc-btn-primary">
                Lihat semua produk
              </Link>
            }
          />
        ) : (
          <>
            <div className="pc-grid">
              {items.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
            {products.hasNextPage && (
              <div style={{ textAlign: 'center', marginTop: 28 }}>
                <button type="button" className="pc-btn pc-btn-outline" disabled={products.isFetchingNextPage} onClick={() => products.fetchNextPage()}>
                  {products.isFetchingNextPage ? 'Memuat…' : 'Muat lagi'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
