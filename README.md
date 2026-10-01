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

- Deploy: `firebase deploy --only functions,hosting` (the first run offers to delete the legacy `sendUsEmail` / `uploadEmail` functions, since they are not in `functions/`)
- Test the backend: `cd functions && npm install && npm test`

## Adding a project

Copy an `<article class="card">` block in `site/projects/index.html` or `site/games/index.html`, drop a WebP image into `site/img/projects/`, and adjust the text. For something bigger (a playable demo, an embedded experiment), give it its own folder under `site/` and link the card to it.

## Run and deploy

- `run_locally.bat` serves `site/` at http://localhost:8080 (needs Python).
- Pushing to `master` (e.g. merging a PR) deploys automatically, see below. `deploy.bat` (`firebase deploy` from a clean, pushed master) is the manual fallback.

## Auto-deploy

`.github/workflows/deploy.yml` runs on every push to `master`. It diffs against the last successful deploy and ships only what changed: `site/` goes to Firebase Hosting, `functions/` is tested (`npm test`) and then deployed function by function (the legacy `sendUsEmail` / `uploadEmail` stay untouched). A run can also be started by hand from the Actions tab, with an option to deploy everything.

It authenticates with a Google Cloud service account whose JSON key is the repository secret `FIREBASE_SERVICE_ACCOUNT`. One-time setup:

1. In [IAM → Service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=website-raccoon), create `github-deploy` and grant it: Firebase Hosting Admin, Cloud Run Viewer, API Keys Viewer, Cloud Functions Admin, Service Account User, Cloud Scheduler Admin, Secret Manager Viewer, Artifact Registry Administrator, Firebase Extensions Viewer.
2. On that account, Keys → Add key → JSON, and paste the whole file into a new [repository secret](https://github.com/Mejval5/Raccoon-Site/settings/secrets/actions) named `FIREBASE_SERVICE_ACCOUNT`. Then delete the downloaded file.
