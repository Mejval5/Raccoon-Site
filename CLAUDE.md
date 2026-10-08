# raccoon.website

Static site in `site/`, Cloud Functions in `functions/`, Firebase project `website-raccoon`. See `README.md` for the layout.

## Deploying

**Pushing to `master` deploys.** `.github/workflows/deploy.yml` runs on every push to master and ships whatever changed since the last successful deploy: `site/` to Firebase Hosting, `functions/` (after `npm test`) to Cloud Functions, by exported name.

- Do not run `firebase deploy` or `deploy.bat` yourself. They are a manual fallback, used only if Daniel asks for it or GitHub Actions is down.
- Anything that reaches `origin/master` is live about two minutes later. Keep unfinished work on a branch or worktree, and push master only when the work should be live.
- After merging finished work into master, push without asking; Daniel pre-approved this. Then check the run: `gh run list -R Mejval5/Raccoon-Site --workflow deploy.yml --limit 1`, then `gh run watch <id> -R Mejval5/Raccoon-Site --exit-status`. On failure, read `gh run view <id> -R Mejval5/Raccoon-Site --log-failed` and report it.
- To redeploy without a code change, run the workflow by hand from the Actions tab (option "deploy everything"), or `gh workflow run deploy.yml -R Mejval5/Raccoon-Site -f everything=true`.
- A new function only needs to be exported from `functions/index.js`. A new secret must be set (`firebase functions:secrets:set NAME`) before the code that uses it is pushed. The legacy `sendUsEmail` / `uploadEmail` functions are left alone on purpose.
- CI authenticates as the service account `github-deploy@website-raccoon.iam.gserviceaccount.com` (repo secret `FIREBASE_SERVICE_ACCOUNT`). If a deploy fails on a missing permission, tell Daniel which role to add; don't work around it.
- `scripts/deploy-guard.js` still runs before every deploy (local and CI) and blocks anything that isn't master.

Older Octomancer docs (`octomancer-web/OVERNIGHT.md`, `MORNING-REPORT.md`, `PLAN.md`) say that Daniel deploys by hand. That was before auto-deploy and no longer applies.

## Wedding page

The invite page `/svatba/` is locked behind an invite key (`?k=<key>`). The key is in the gitignored `.svatba-key` file in the repo root; the repo only holds its SHA-256 hash, and this repo is public, so never commit the key. When reporting wedding-page changes, give Daniel the unlock URLs: `http://localhost:41089/svatba/?k=<key>`, the LAN one, and `https://raccoon.website/svatba/?k=<key>`. The gifts admin page is `https://raccoon.website/svatba/admin/#key=<admin key>`; that key is in the gitignored `.dary-admin-key` and must match the Firebase secret `DARY_ADMIN_KEY`.
