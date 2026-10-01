// Speech (round 38): the lines an NPC says, one at a time, as a speech bubble at the NPC (drawn by speech-draw.js).
// Pure data and timers, no DOM: a `talk` is a queue of lines plus the one being shown. Used by the encounters in the
// levels (quests.js: meet, ask, help, thank) and by the residents of the hub (main.js).

/** Seconds a line stays up: long enough to read at a glance, capped. */
export function lineDuration(text) { return Math.min(5.5, 1.5 + 0.055 * text.length); }

export function createTalk() { return { q: [], text: '', left: 0, total: 0 }; }

/** Queue lines (empty strings are skipped). */
export function say(talk, lines) { for (const l of lines) if (l) talk.q.push(l); }

/** Is anything showing or waiting? */
export function talking(talk) { return talk.left > 0 || talk.q.length > 0; }

/** Advance by dt seconds: the current line expires, the next one starts. */
export function talkStep(talk, dt) {
  if (talk.left > 0) { talk.left -= dt; if (talk.left <= 0) { talk.left = 0; talk.text = ''; } }
  if (talk.left <= 0 && talk.q.length) { talk.text = talk.q.shift(); talk.total = talk.left = lineDuration(talk.text); }
}

/** 0..1 opacity of the line showing: a quick fade in and a slower fade out. */
export function talkAlpha(talk) {
  if (!talk.text) return 0;
  const age = talk.total - talk.left;
  return Math.max(0, Math.min(1, age / 0.15, talk.left / 0.35));
}

/** Break a line into rows of at most `max` characters at spaces. */
export function wrapLines(text, max = 22) {
  const out = [];
  let row = '';
  for (const w of text.split(' ')) {
    if (row && (row + ' ' + w).length > max) { out.push(row); row = w; } else row = row ? row + ' ' + w : w;
  }
  if (row) out.push(row);
  return out;
}
