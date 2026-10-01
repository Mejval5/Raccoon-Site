// Runs before every `firebase deploy` (see "predeploy" in firebase.json).
// Only `master` goes live: a deploy replaces the whole site, so deploying from any other branch or
// worktree silently rolls back everything that branch doesn't have. Also refuses uncommitted changes
// in what gets deployed, so the live site always matches a commit.
const { execFileSync } = require('child_process')
const path = require('path')

const repo = path.resolve(__dirname, '..')
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()

function fail (message) {
  console.error(`\n  Deploy blocked: ${message}\n  Only a clean master deploys to raccoon.website.\n`)
  process.exit(1)
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
if (branch !== 'master') fail(`this checkout is on "${branch}", not master.`)

const dirty = git('status', '--porcelain', '--', 'site', 'functions', 'firebase.json')
if (dirty) fail(`uncommitted changes in deployed files:\n${dirty.split('\n').map((l) => '    ' + l).join('\n')}`)

if (process.env.GITHUB_ACTIONS === 'true') {
  // CI deploys the exact commit that was pushed. Deploys run one at a time, so if master has moved on
  // since, the newer commit's run is queued behind this one and will deploy right after it.
  git('fetch', '--quiet', 'origin', 'master')
  try {
    git('merge-base', '--is-ancestor', 'HEAD', 'origin/master')
  } catch (e) {
    fail('this commit is not on origin/master.')
  }
  console.log(`  Deploy guard OK (CI): master @ ${git('rev-parse', '--short', 'HEAD')}`)
  process.exit(0)
}

try {
  git('fetch', '--quiet', 'origin', 'master')
  const behind = git('rev-list', '--count', 'HEAD..origin/master')
  if (behind !== '0') fail(`master is ${behind} commit(s) behind origin/master; pull first.`)
  const ahead = git('rev-list', '--count', 'origin/master..HEAD')
  if (ahead !== '0') console.warn(`  Note: master is ${ahead} commit(s) ahead of origin/master; remember to push.`)
} catch (e) {
  console.warn('  Note: could not compare with origin/master (offline?); deploying the local master.')
}

console.log(`  Deploy guard OK: master @ ${git('rev-parse', '--short', 'HEAD')}`)
