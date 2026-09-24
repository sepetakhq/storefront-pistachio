import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';

import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import Toast from './components/Toast.jsx';
import CartDrawer, { DrawerProvider } from './components/CartDrawer.jsx';
import Icon from './ui/Icon.jsx';
import { sectionText } from './lib/copy.js';
import UpdateBanner from './components/UpdateBanner.jsx';
import { ConfigProvider } from '@sepetakhq/storefront-kit/config/ConfigProvider';
import { CartProvider } from '@sepetakhq/storefront-kit/cart/CartProvider';
import { ToastProvider } from '@sepetakhq/storefront-kit/ui/ToastProvider';
import { useHome, useProduct } from '@sepetakhq/storefront-kit/hooks/queries';
import { useConfig } from '@sepetakhq/storefront-kit/config/ConfigProvider';
import { useDocumentTitle } from '@sepetakhq/storefront-kit/hooks/useDocumentTitle';
import { pageName, pageTitle } from '@sepetakhq/storefront-kit/lib/seo';
import { ErrorState } from './ui/states.jsx';

export default function RootLayout() {
  return (
    <ConfigProvider fallback={<Splash />} errorFallback={(error, retry) => <StoreUnavailable error={error} onRetry={retry} />}>
      <CartProvider>
        <ToastProvider>
          <DrawerProvider>
            <Shell />
          </DrawerProvider>
        </ToastProvider>
      </CartProvider>
    </ConfigProvider>
  );
}

function Shell() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', overflowX: 'clip' }}>
      <ScrollRestoration />
      <DocumentTitle />
      <UpdateBanner />
      <Announcement />
      <Header />
      <div className="pc-page" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </div>
      <Footer />
      <CartDrawer />
      <Toast />
    </div>
  );
}

/**
 * The promo strip. It comes from the same payload as the home sections, so it
 * is simply absent until that query resolves rather than flashing in.
 *
 * Exported for its test: the layout around it needs a router and a query
 * client, and the rules about when this bar renders are worth testing without
 * either.
 */
export function Announcement() {
  const { data } = useHome();
  const { copy, brand } = useConfig();
  const announcement = data?.announcement;
  // Through the same substitution as the tagline and the product copy, so a
  // banner written as "gratis ongkir min {free_shipping_min}" follows the
  // threshold the merchant actually set. When the offer is switched off the
  // sentence is withheld -- a bar promising free shipping the checkout would
  // refuse is worse than no bar.
  const text = announcement?.enabled ? copy(announcement.text) : '';
  const origin = brand?.origin_city ? `${sectionText(brand.sections, 'origin_prefix')} ${brand.origin_city}` : '';
  const hours = brand?.opening_hours ?? '';
  if (!text && !origin && !hours) return null;

  // The design's top bar: the announcement left, where the shop ships from
  // and its hours right (hidden on phones by CSS).
  return (
    <div className="pc-topbar">
      <div className="pc-topbar-row">
        {text ? (
          <Link to="/katalog" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit', textWrap: 'pretty' }}>
            <Icon name="truck" size={16} style={{ color: 'var(--pc-lime)' }} />
            {text}
          </Link>
        ) : (
          <span />
        )}
        {(origin || hours) && (
          <span className="pc-topbar-meta">
            {origin && <span>{origin}</span>}
            {hours && <span>{hours}</span>}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Keeps the tab title in step as the buyer moves around.
 *
 * Renders nothing. The server already wrote the head of the document this page
 * arrived as, including its title; an SPA navigation never re-fetches that, so
 * the tab would otherwise be stuck on whichever page was loaded first.
 *
 * The product name comes from useProduct, which shares a cache entry with
 * ProductRoute's own call -- same query key, so this costs no extra request. It
 * resolves after the route renders, and until it does pageName returns '' and
 * the hook leaves the server's title alone.
 */
function DocumentTitle() {
  const { pathname } = useLocation();
  const { brand, tenant } = useConfig();

  const slug = pathname.startsWith('/produk/') ? pathname.slice('/produk/'.length) : '';
  const { data: product } = useProduct(slug);

  const brandName =
    [brand?.wordmark_primary, brand?.wordmark_accent].filter(Boolean).join(' ') || tenant?.name || '';

  useDocumentTitle(
    pageTitle(pageName(pathname, { product, taglineShort: brand?.tagline_short }), brandName),
  );
  return null;
}

/**
 * Shown while the tenant's brand identity loads — the whole shell depends on it.
 *
 * Deliberately wordless. This is ConfigProvider's own fallback, so it renders
 * outside the context it is waiting for and cannot know whose shop this is;
 * anything it named would be one particular merchant's, shown to all of them.
 */
function Splash() {
  return <div style={{ minHeight: '100vh', background: 'var(--pc-white)' }} />;
}

/**
 * The shell could not load: an unknown host (404), a suspended store (503), or
 * a bundle pinned to an API version the server no longer serves. All three are
 * real, and none should render as a broken page.
 */
function StoreUnavailable({ error, onRetry }) {
  const suspended = error?.status === 503;
  // This tab is running a cached bundle older than anything the API still
  // speaks. Retrying re-sends the same dead version forever; only a reload
  // fetches a newer bundle. index.html is served no-cache, so it will.
  const stale = error?.code === 'unsupported_api_version';

  let title = 'Toko tidak ditemukan';
  if (stale) title = 'Aplikasi perlu dimuat ulang';
  else if (suspended) title = 'Toko sedang tidak aktif';

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--pc-white)' }}>
      <ErrorState
        error={error}
        title={title}
        onRetry={stale ? () => window.location.reload() : suspended ? onRetry : undefined}
      />
    </div>
  );
}
