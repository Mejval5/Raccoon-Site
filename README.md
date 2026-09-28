# [Raccoon Website](https://raccoon.website)

The source code for my personal web site. Plain HTML, CSS and a pinch of JavaScript: no framework, no build step.

## Layout

- `site/` is the whole website, deployed as-is to Firebase Hosting.
  - `index.html` is the prism menu; every other page is a folder with its own `index.html` (`about/`, `projects/`, `games/`, `contact/`, `camino/`, `octomancer/`, `preverenges/`).
  - `css/site.css` holds the shared styles, `js/site.js` the starfield and the prism animation.
  - `img/` holds the images, all WebP and sized for the web.
- `firebase.json` configures hosting, including redirects from the old Vue-era URLs.
- `firebase/` is the Cloud Functions project from the old contact form (deployed separately).

## Adding a project

Copy an `<article class="card">` block in `site/projects/index.html` or `site/games/index.html`, drop a WebP image into `site/img/projects/`, and adjust the text. For something bigger (a playable demo, an embedded experiment), give it its own folder under `site/` and link the card to it.

## Run and deploy

- `run_locally.bat` serves `site/` at http://localhost:8080 (needs Python).
- `deploy.bat` runs `firebase deploy`.
