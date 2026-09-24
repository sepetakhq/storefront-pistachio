import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';

import { createQueryClient } from '@sepetakhq/storefront-kit/api/queryClient';
import { router } from './routes.jsx';
import { purgeLegacyKeys } from '@sepetakhq/storefront-kit/lib/storage';
import './styles.css';

// The prototype's localStorage describes a catalogue that no longer exists —
// products keyed p1..p8, locally invented order numbers, client-computed
// prices. Cleared once, before anything reads it.
purgeLegacyKeys();

const queryClient = createQueryClient();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
