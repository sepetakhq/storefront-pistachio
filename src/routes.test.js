import { describe, expect, it } from 'vitest';

import { ROUTE_CONTRACT, routePaths } from '@sepetakhq/storefront-kit/shared/routes';

import { router } from './routes.jsx';

// The API bakes these paths into order emails, the gateway return page, the
// sitemap and the SEO head. Renaming one here breaks a link already in a
// buyer's inbox; the kit publishes the list, and this pins the router to it.
describe('route contract', () => {
  it('serves exactly the paths every Sepetak storefront must', () => {
    expect(routePaths(router.routes)).toEqual(ROUTE_CONTRACT);
  });
});
