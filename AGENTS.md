# Agent Guidance

## Project Shape

- This is a static, multi-page browser app for LV Maker, written in HTML, CSS, and vanilla JavaScript.
- Firebase Auth, Firestore, App Check, and other browser SDKs are loaded from CDNs; there is no bundler, `package.json`, TypeScript setup, or automated test suite.
- The main admin pages are `index.html`, `orcamentos.html`, `financeiro.html`, `produtos.html`, and `cliente.html`; `catalogo.html` is the public storefront.
- Shared business helpers are in `app.js`; shared admin styles are in `style.css`. Page-local scripts and inline styles are common, so inspect the owning page before extracting or duplicating logic.
- User-facing text and formatting follow Brazilian Portuguese conventions, including BRL currency and dates.

## Working Rules

- Start at the page or symbol that owns the behavior, then trace shared helpers and Firestore rules before editing.
- Preserve the existing browser-global style and inline event-handler conventions unless a change specifically calls for restructuring.
- Escape user or Firestore text before inserting it into HTML. Keep monetary comparisons in integer cents where the existing helper supports it.
- Preserve ownership checks (`usuario`) and admin checks in both client code and `firestore.rules`; do not treat client-side validation as authorization.
- Use Firestore transactions or batches for payment, stock, approval, deletion, and other multi-document state changes where the surrounding code already does so.
- Keep changes focused. Do not introduce a framework, build step, dependency, or broad refactor for a local feature.

## Important Boundaries

- Firestore collections and security behavior are defined in [firestore.rules](firestore.rules); review it with any data-model or permission change.
- Firebase Hosting serves the repository root as configured in [firebase.json](firebase.json). The catch-all rewrite targets `index.html`, so preserve the static multi-page deployment model.
- The service worker has a manually maintained cache name and file list in [service-worker.js](service-worker.js). When changing cache-sensitive assets, update the cache version and the matching `app.js?v=...` reference consistently.
- Firebase configuration is repeated across pages. If changing it, search all HTML files for the affected initialization rather than updating only one page.
- Existing records may use legacy customer fields without `clienteId`; preserve the fallback matching behavior in `app.js` unless migration is intentional.

## Validation

- There is no repository test command. Use editor diagnostics plus a local browser/manual check for the touched page and workflow.
- At minimum, validate authentication redirects, the affected Firestore read/write path, mobile layout, and service-worker behavior when relevant.
- For security or data-model changes, inspect the corresponding rule and use the Firebase Emulator or a deployed test project when available.
- The documented deployment check is `firebase deploy --only hosting,firestore:rules`; do not deploy unless explicitly requested.
- Before finishing, inspect the diff and confirm no credentials, generated build output, or unrelated formatting changes were added.

## Documentation

See [README.md](README.md) for the product purpose and feature summary. Keep this file limited to agent-facing conventions that are not already documented there.
