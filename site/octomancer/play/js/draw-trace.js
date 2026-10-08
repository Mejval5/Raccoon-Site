// A test hook for the draw order (controls 2026-10-08, "what the hand holds is on top"): while `drawTrace.on`, the draw
// functions of the things the hand can carry and the octopus itself append (kind, ref) pairs to `drawTrace.log`, so a test
// can see that a held thing is drawn once, after the octopus. Off, it costs one boolean test per drawn thing.
export const drawTrace = { on: false, log: [] };
/** Note that `kind` thing `ref` (an index or the record) was drawn now. */
export function traceDraw(kind, ref) { drawTrace.log.push(kind, ref); }
