import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { CartBody } from '../screens/CartRoute.jsx';
import Icon from '../ui/Icon.jsx';

const DrawerContext = createContext({ open: false, show: () => {}, hide: () => {} });

/** Whether the cart drawer is open, shared by the header and "add to cart". */
export function DrawerProvider({ children }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, show, hide }), [open, show, hide]);
  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export function useDrawer() {
  return useContext(DrawerContext);
}

/**
 * The design's side drawer: the same cart as /keranjang, over the page.
 * Escape, the scrim and any navigation close it.
 */
export default function CartDrawer() {
  const { open, hide } = useDrawer();
  const { pathname } = useLocation();

  useEffect(() => hide(), [pathname, hide]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && hide();
    document.addEventListener('keydown', onKey);
    document.body.setAttribute('data-menu', '1');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.removeAttribute('data-menu');
    };
  }, [open, hide]);

  if (!open) return null;
  return (
    <div className="pc-drawer">
      <div className="pc-drawer-scrim" onClick={hide} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" aria-label="Keranjang">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid var(--pc-line)' }}>
          <h2 style={{ margin: 0, fontWeight: 700, fontSize: 22 }}>Keranjang</h2>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- a dialog takes focus */}
          <button type="button" className="pc-icon-btn" aria-label="Tutup" onClick={hide} autoFocus>
            <Icon name="close" size={20} strokeWidth={2} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px 22px' }}>
          <CartBody onNavigate={hide} />
        </div>
      </aside>
    </div>
  );
}
