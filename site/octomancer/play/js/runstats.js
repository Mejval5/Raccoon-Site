// Text for the run summary screens (death, biome clear), the best-runs list and the journal stats page.
// No DOM: ui.js and journal-ui.js lay the rows out, tests read them directly.

import { BIOME_LEVELS, BIOME_NAME, CAUSE_TEXT, CAUSE_NAME } from './run.js';

export function causeText(id) { return CAUSE_TEXT[id] || CAUSE_TEXT.unknown; }
/** The cause as a capitalised noun for a list row ('Piranha'), not a sentence part ('a piranha'). */
export function causeName(id) { return CAUSE_NAME[id] || CAUSE_NAME.unknown; }

/** 75.4 -> "1:15" */
export function formatTime(sec) {
  const t = Math.max(0, Math.floor(sec || 0));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

/** A run's depth as text: "Shallows 1-3", or "Cleared" for a finished biome. */
export function depthLabel(depth) {
  return depth > BIOME_LEVELS ? 'Cleared' : BIOME_NAME + ' 1-' + Math.max(1, depth);
}

/** The "Result" line under the banner. */
export function summaryHeadline(s) {
  return s.cleared ? `All ${BIOME_LEVELS} levels cleared` : `Taken by ${causeText(s.cause)} in ${depthLabel(s.depth)}`;
}

/** Label / value rows of a run summary ({cleared, level, time, shells, kills, quests, cause, seed}). */
export function summaryRows(s, seeded = false) {
  const rows = [
    ['Levels reached', `${s.level} of ${BIOME_LEVELS}`],
    ['Time', formatTime(s.time)],
    ['Shells', String(s.shells)],
    ['Kills', String(s.kills)],
    ['Quests done', String(s.quests)],
    [s.cleared ? 'Result' : 'Cause of death', s.cleared ? 'Cleared' : causeText(s.cause)],
  ];
  if (seeded) rows.push(['Seed', String(s.seed)]);
  return rows;
}

/** One line per best run, "1. Cleared, 34 shells, 5:12". */
export function bestRunLines(list) {
  return list.map((r, i) => `${i + 1}. ${depthLabel(r.depth)}, ${r.shells} shells, ${formatTime(r.time)}`);
}

/** Rows for the journal stats page from save.js getMeta(): totals first, then deaths by cause (most first). */
export function statsRows(meta) {
  const rows = [
    ['Runs', String(meta.dives)],
    ['Biomes cleared', String(meta.clears)],
    ['Best depth', meta.bestDepth ? depthLabel(meta.bestDepth) : 'None yet'],
    ['Total shells', String(meta.shells)],
    ['Total kills', String(meta.kills)],
  ];
  const deaths = Object.keys(meta.deaths).sort((a, b) => meta.deaths[b] - meta.deaths[a] || (a < b ? -1 : 1));
  return { rows, deaths: deaths.map((k) => [causeName(k), String(meta.deaths[k])]) };
}
