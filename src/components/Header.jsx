import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { useConfig } from '@sepetakhq/storefront-kit/config/ConfigProvider';
import { useCart } from '@sepetakhq/storefront-kit/cart/CartProvider';

import { BrandMark } from './BrandMark.jsx';
import { useDrawer } from './CartDrawer.jsx';
import Icon from '../ui/Icon.jsx';

/**
 * The sticky header, as the design draws it: from 820px one row with the
 * mark, the merchant's nav centred, then search, "Pesanan saya" and the cart.
 * Narrower, a menu button leads and the nav moves into a panel under the row
 * (CSS decides which, not a width listener). The panel always carries order
 * tracking even when the merchant's nav does not.
 */
export default function Header() {
  const { brand } = useConfig();
  const { count } = useCart();
  const drawer = useDrawer();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const { pathname, search: qs } = useLocation();
  const headerRef = useRef(null);

  // Any navigation closes both panels; leaving one open over a new screen is
  // the classic mobile-nav bug.
  useEffect(() => {
    setMenu(false);
    setSearch(false);
  }, [pathname, qs]);

  useEffect(() => {
    if (!menu) return undefined;
    document.body.setAttribute('data-menu', '1');
    const onKey = (e) => e.key === 'Escape' && setMenu(false);
    const onDown = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) setMenu(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.body.removeAttribute('data-menu');
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [menu]);

  const hasTrack = brand.nav.some((n) => n.path === '/lacak');

  return (
    <header className="pc-header" ref={headerRef}>
      <div className="pc-header-row">
        <button
          type="button"
          className="pc-icon-btn pc-menu-btn"
          aria-label={menu ? 'Tutup menu' : 'Buka menu'}
          aria-expanded={menu}
          aria-controls="pc-menu"
          onClick={() => {
            setMenu((o) => !o);
            setSearch(false);
          }}
        >
          <Icon name={menu ? 'close' : 'menu'} size={22} strokeWidth={2} />
        </button>
        <Link to="/" aria-label="Beranda" className="pc-wordmark">
          <BrandMark height={40} maxWidth={200} />
        </Link>

        <nav className="pc-nav" aria-label="Navigasi utama">
          {brand.nav.map((n) => (
            <NavLink key={n.path} to={n.path} end={n.path === '/'}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="pc-header-tools">
          <button
            type="button"
            className="pc-icon-btn"
            aria-label="Cari produk"
            aria-expanded={search}
            aria-controls="pc-search"
            onClick={() => {
              setSearch((o) => !o);
              setMenu(false);
            }}
          >
            <Icon name="search" size={21} />
          </button>
          <Link to="/lacak" className="pc-icon-btn pc-only-wide" aria-label="Pesanan saya" title="Pesanan saya">
            <Icon name="user" size={21} />
          </Link>
          <button type="button" className="pc-icon-btn" aria-label={`Keranjang, ${count} barang`} onClick={drawer.show}>
            <Icon name="cart" size={22} />
            {count > 0 && <span className="pc-cart-count">{count > 99 ? '99+' : count}</span>}
          </button>
        </div>
      </div>

      {menu && (
        <nav id="pc-menu" className="pc-menu-panel" aria-label="Menu">
          {brand.nav.map((n) => (
            <NavLink key={n.path} to={n.path} end={n.path === '/'}>
              {n.label}
            </NavLink>
          ))}
          {!hasTrack && <NavLink to="/lacak">Lacak pesanan</NavLink>}
        </nav>
      )}
      {search && (
        <div id="pc-search" className="pc-searchbar">
          <SearchBox autoFocus />
        </div>
      )}
    </header>
  );
}

/**
 * The search box submits to /katalog?q=. It reads the live param so the box
 * shows what the results are for, and is blank everywhere else.
 */
export function SearchBox({ autoFocus = false }) {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = pathname === '/katalog' ? params.get('q') ?? '' : '';
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);

  const submit = (e) => {
    e.preventDefault();
    const q = value.trim();
    navigate(q ? `/katalog?q=${encodeURIComponent(q)}` : '/katalog');
  };

  return (
    <form role="search" onSubmit={submit}>
      <input
        className="pc-input"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Cari nama produk…"
        aria-label="Cari produk"
        maxLength={80}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- opened by the buyer's own tap
        autoFocus={autoFocus}
      />
      <button type="submit" className="pc-btn pc-btn-primary" style={{ minHeight: 46, padding: '0 20px' }}>
        Cari
      </button>
    </form>
  );
}
