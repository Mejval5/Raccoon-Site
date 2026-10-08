// r43: level generation off the main thread. generateLevel (rooms, shaving, the A* solvability checks) and buildLevelSpawns (the
// pattern match, the hazard A* pass) cost 30-60 ms of one task at 4x CPU throttle; on a phone that is a dropped-frame stutter and
// starves the audio thread. They are pure functions of (seed, level index), so they run here and the result (flat typed arrays and
// plain records) is posted back; main.js builds the world from it. If this worker cannot start, main.js does the same two steps
// itself, one task each (see makeWorldSteps in main.js).
import { setDefaultBank, generateLevel } from './level.js';
import { fetchBiome1Bank } from './rooms.js';
import { fetchPatterns, setPatternTable } from './patterns.js';
import { buildLevelSpawns } from './level-spawns.js';
import { questPathFor } from './quests.js';
import { addBackRoom } from './backroom.js';

let ready = null;
function init(dataBase) {
  return (async () => {
    setDefaultBank(await fetchBiome1Bank(dataBase + 'biome1-rooms.json', dataBase + 'rooms.json'));
    setPatternTable(await fetchPatterns(dataBase + 'patterns.json'));
  })();
}

self.onmessage = async (e) => {
  const { id, seed, levelIndex, dataBase } = e.data;
  try {
    if (!ready) ready = init(dataBase);
    await ready;
    if (seed === undefined) { postMessage({ id, warm: true }); return; }
    const level = generateLevel(seed, levelIndex);
    const spawnInfo = buildLevelSpawns(level, seed, levelIndex);
    addBackRoom(level, spawnInfo.spawns, seed, levelIndex); // back rooms: the annex under the level (before the quest path data, so its checksum matches)
    level.questPath = questPathFor(level); // vibe fixes: the quest planner's path data (planQuest uses it while the tiles match), not on the main thread
    postMessage({ id, level, spawnInfo });
  } catch (err) {
    postMessage({ id, error: String((err && err.message) || err) });
  }
};
