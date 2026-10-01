# [Raccoon Website](https://raccoon.website)

The source code for my personal web site. Plain HTML, CSS and a pinch of JavaScript: no framework, no build step.

## Layout

- `site/` is the whole website, deployed as-is to Firebase Hosting.
  - `index.html` is the prism menu; every other page is a folder with its own `index.html` (`about/`, `projects/`, `games/`, `contact/`, `camino/`, `octomancer/`, `preverenges/`, `svatba/`).
  - `css/site.css` holds the shared styles, `js/site.js` the starfield and the prism animation.
  - `img/` holds the images, all WebP and sized for the web.
- `firebase.json` configures hosting (including redirects from the old Vue-era URLs) and the Cloud Functions source/runtime.
- `functions/` is the Cloud Functions project for the wedding RSVP API (see below).
- `firebase/` is the legacy Cloud Functions project from the old contact form (`sendUsEmail`, `uploadEmail`), no longer deployed from the root.

## Wedding page

The wedding invitation lives at `/svatba/` and only opens with the personal invite link (`?k=<token>`) sent to guests; the secret token itself is not in this repository, only its SHA-256 hash (in `functions/lib/rsvp.js`).

RSVPs are submitted via `POST /api/rsvp`, a Firebase Hosting rewrite to the `rsvp` Cloud Function (`functions/`, region `europe-west1`). Each RSVP is stored in the Firestore collection `svatba-rsvp`, and confirmation emails (to the couple and to the guest, in Czech, English or French) are sent by the function itself through Gmail SMTP (nodemailer) from `necesal.daniel@gmail.com`, using a Gmail app password stored as the Firebase secret `GMAIL_APP_PASSWORD` (set once with `firebase functions:secrets:set GMAIL_APP_PASSWORD`). Until the real app password exists, the secret may hold the literal placeholder `unset`; in that case the function skips sending mail, records `mailError: "smtp-not-configured"` on the RSVP doc, and still answers `200 ok:true`.

The endpoint is protected by an [ALTCHA](https://altcha.org) proof-of-work captcha (`altcha-lib`). `GET /api/rsvp?challenge=1` issues a signed, expiring challenge; the form solves it client-side and submits the result as `altcha` in the POST body, which the function verifies (HMAC + expiry) using the Firebase secret `ALTCHA_HMAC_KEY` (set once with `firebase functions:secrets:set ALTCHA_HMAC_KEY`). Each solved challenge can only be redeemed once, guarded by a Firestore doc in `svatba-captcha`.

- Deploy: push to `master` (see [Auto-deploy](#auto-deploy)). Functions are deployed by name, so the legacy `sendUsEmail` / `uploadEmail` functions in the project are left alone.
- Test the backend: `cd functions && npm install && npm test`

## ShadingLanguageX playground

A demo of [Jake Thorn's ShadingLanguageX](https://github.com/jakethorn/ShadingLanguageX) at `/shadinglanguagex/`: an MXSL editor that compiles to MaterialX in the browser, previews the shader, and a gallery where anyone can share a project. Plain ES modules, no build step.

- `site/shadinglanguagex/index.html` is the editor, `gallery/index.html` the gallery; `js/` holds one module per concern (`engine.js` + `compile-worker.js` compile on a worker, `preview.js` + `mx-shader.js` render with three.js and the MaterialX shader generator, `projects.js` keeps your projects in localStorage, `api.js` talks to the gallery, `render-pool.js` + `render-worker.js` render gallery cards on up to five threads).
- `lib/` holds the WebAssembly builds: `JsMxslc.*` (the mxslc compiler, from the `mxslc_JsMxslc_package.zip` of a [ShadingLanguageX release](https://github.com/jakethorn/ShadingLanguageX/releases)) and `JsMaterialXGenShader.*` (MaterialX's own JavaScript build), plus the environment maps. `scripts/extract-slx-assets.py` is how the first set was pulled out of the single-file playground page; it also documents the one patch `JsMaterialXGenShader.js` needs to run inside a Web Worker. To upgrade mxslc, replace the three `JsMxslc.*` files in `lib/` and the copy in `functions/lib/mxslc/` (rename the glue to `.mjs` there).
- `shadinglanguagex-src/` is the ShadingLanguageX repo as a submodule (your fork, with Jake's repo as `upstream`) for sending changes upstream.

The gallery API is the `gallery` Cloud Function at `/api/gallery` (collection `slx-gallery`). Every share is compiled on the server with the same WASM build (`functions/lib/slx-compile.js`); a program that does not compile is refused. There are no accounts: the first share sets an owner token in an `HttpOnly` cookie (named `__session`, the only cookie Firebase Hosting forwards to functions), and only that browser can update or remove its entries. Each share also uploads a preview, a 24-frame turntable rendered in the sharer's browser and packed into one WebP strip (`js/preview-sprite.js`), stored in `slx-gallery-thumbs` and served from `/api/gallery/<id>/thumb` with an immutable cache. The gallery shows those, so browsing never compiles anyone's shader; entries without a preview render only on request, with a time limit. Projects can carry up to 4 images (PNG, JPEG or WebP, 1 MB each) that the shader samples with `image("name.png")`: kept in the browser's IndexedDB (`js/files.js`, managed in the editor's Images panel), uploaded with a share to `slx-gallery-files` and served from `/api/gallery/<id>/files/<name>`. An image is never overwritten: it has to be removed before another of that name is added. Admin tasks (render missing previews in a batch, delete an entry) go through `scripts/gallery-admin.mjs`, authenticated with the Firebase secret `GALLERY_ADMIN_KEY`; the script reads the same value from the gitignored `.gallery-admin-key`. When the site is served by `run_locally.bat` there is no backend, so `api.js` falls back to an in-browser mock (shown by a "mock gallery" badge); run `firebase emulators:start --only functions,hosting` to test the real function.

## Adding a project

Copy an `<article class="card">` block in `site/projects/index.html` or `site/games/index.html`, drop a WebP image into `site/img/projects/`, and adjust the text. For something bigger (a playable demo, an embedded experiment), give it its own folder under `site/` and link the card to it.

## Run and deploy

- `run_locally.bat` serves `site/` (needs Python) on a port picked at random on first run and kept in `.local-port` (gitignored), so the URL can be bookmarked. It listens on all interfaces and prints both the localhost and the local network URL.
- Pushing to `master` (e.g. merging a PR) deploys automatically, see below. `deploy.bat` (`firebase deploy` from a clean, pushed master) is the manual fallback.

## Auto-deploy

`.github/workflows/deploy.yml` runs on every push to `master`. It diffs against the last successful deploy and ships only what changed: `site/` goes to Firebase Hosting, `functions/` is tested (`npm test`) and then deployed function by function (the legacy `sendUsEmail` / `uploadEmail` stay untouched). A run can also be started by hand from the Actions tab, with an option to deploy everything.

It authenticates with a Google Cloud service account whose JSON key is the repository secret `FIREBASE_SERVICE_ACCOUNT`. One-time setup:

1. In [IAM → Service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=website-raccoon), create `github-deploy` and grant it: Firebase Hosting Admin, Cloud Run Viewer, API Keys Viewer, Cloud Functions Admin, Service Account User, Cloud Scheduler Admin, Secret Manager Viewer, Artifact Registry Administrator, Firebase Extensions Viewer.
2. On that account, Keys → Add key → JSON, and paste the whole file into a new [repository secret](https://github.com/Mejval5/Raccoon-Site/settings/secrets/actions) named `FIREBASE_SERVICE_ACCOUNT`. Then delete the downloaded file.

- `deploy.bat` runs `firebase deploy`.

## Credits

- [ShadingLanguageX](https://github.com/jakethorn/ShadingLanguageX) by Jake Thorn: the language, the `mxslc` compiler and its WebAssembly build behind the playground and gallery at `/shadinglanguagex/`.
- [MaterialX](https://github.com/AcademySoftwareFoundation/MaterialX): the shader generator the previews use, through its JavaScript build.
- [three.js](https://threejs.org/) for drawing the previews.
