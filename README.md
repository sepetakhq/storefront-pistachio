# storefront-pistachio

The `pistachio` storefront template: a fresh green look for snack and
natural-food shops, with Indonesian copy, built for any shop that picks it.
Everything that is not a design — API client, tenant config, cart, checkout
state, the helpers that decide what a page may say — comes from
[`@sepetakhq/storefront-kit`](https://www.npmjs.com/package/@sepetakhq/storefront-kit).

Nothing about a merchant is in here. Name, nav, hero, features, categories,
campaign, story, contact, payment methods and couriers all arrive from
`/storefront/config` and `/storefront/home`; a product or category without a
picture renders as a two-letter tile, an empty hero or story slot as the leaf.

## Develop

Run the platform API first (`make up && make seed && make api` in the
`lilyalora` checkout; the seed installs the *Kebun Camilan* demo tenant on
this template), then:

```
npm install
npm run dev          # http://pistachio.localhost:5181, /api proxied to the API on :8090
```

Open it on `pistachio.localhost`, not `localhost`: the API resolves the shop
from the Host header. `API_TARGET` and `DEV_PORT` override the proxy target
and port.

## Ship

`public/manifest.json` and `public/preview.jpg` are this template's catalogue
entry; `src/manifest.test.js` refuses a push without them. Every push to
`main` builds and uploads to the template registry
(`.github/workflows/release.yml`). To see the registry path locally:

```
npm run publish:local
open http://pistachio.localhost:8090/
```

(The dev MinIO must list `http://pistachio.localhost:8090` in
`MINIO_API_CORS_ALLOW_ORIGIN`, and its container must have been recreated
since, or the page is blank.)

## Rules

- Serve exactly the kit's `ROUTE_CONTRACT` (`src/routes.test.js` pins it).
  Categories and promo are `/katalog?cat=` and `/katalog?sale=1`.
- Keep the `<!--seo:start-->` / `<!--seo:end-->` markers in `index.html`.
- Every colour is a `--pc-*` token in `src/styles.css`; no colour literal,
  demo-shop string or undefined token anywhere else. `src/no-hardcode.test.js`
  enforces all three.
- Branch on `payment.kind`, render `order.timeline` and `status_label`.
- The API sends names, not looks: feature `mark` is up to four characters
  (known emoji become line icons, `featureMark`), banner `bg` is `butter` or
  `pink` (`bannerTheme`), `hero.em` is text after the title.
- The template's own decisions live in `src/lib/copy.js` as pure functions
  with tests.
