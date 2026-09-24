import { Navigate, createBrowserRouter, useParams } from 'react-router-dom';

import RootLayout from './RootLayout.jsx';
import HomeRoute from './screens/HomeRoute.jsx';
import CatalogRoute from './screens/CatalogRoute.jsx';
import ProductRoute from './screens/ProductRoute.jsx';
import CartRoute from './screens/CartRoute.jsx';
import CheckoutRoute from './screens/CheckoutRoute.jsx';
import OrderRoute from './screens/OrderRoute.jsx';
import LookupRoute from './screens/LookupRoute.jsx';
import About from './screens/About.jsx';
import NotFound from './screens/NotFound.jsx';

/**
 * `/track/:token` is not a free choice. The backend composes the emailed
 * tracking link as `<STOREFRONT_BASE_URL>/track/<token>` with the path
 * hardcoded, so this route has to exist for every confirmation email already
 * in the wild. It redirects to the Indonesian path the rest of the site uses.
 */
function TrackRedirect() {
  const { token } = useParams();
  return <Navigate to={`/pesanan/${token}`} replace />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: 'katalog', element: <CatalogRoute /> },
      { path: 'produk/:slug', element: <ProductRoute /> },
      { path: 'keranjang', element: <CartRoute /> },
      { path: 'checkout', element: <CheckoutRoute /> },
      // One route for the whole life of an order: pay, then track. Which one
      // the buyer sees is decided by order.status, not by a separate screen.
      { path: 'pesanan/:token', element: <OrderRoute /> },
      { path: 'track/:token', element: <TrackRedirect /> },
      { path: 'lacak', element: <LookupRoute /> },
      { path: 'tentang', element: <About /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
