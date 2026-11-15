import type { FsData } from '../../fs.ts';
import type { World } from '../engine/types.ts';
import { parseMap } from '../engine/world.ts';
import { BADGES, BASE_HP, COLLECT, ECONOMY, ENEMIES, FALLBACK_MOVE, HP_PER_BADGE, ITEMS, LEARN, LEVELS, MOVES, PLAYER_MOVES, SHOPS, STAMP, START_ITEMS } from './battles.ts';
import { MUSIC } from './music.ts';
import { HINTS, buildMaps, countCollectibles, ending, intro } from './story.ts';

/** Puts the content modules together into the world the engine plays. The facts come from `data`. */
export function buildWorld(data: FsData): World {
  const specs = buildMaps(data);
  const maps = specs.map((spec) => parseMap(spec, spec.legend));
  return {
    title: 'CAREER QUEST',
    subtitle: data.profile.name,
    maps: Object.fromEntries(maps.map((map) => [map.id, map])),
    start: { map: 'town', at: '@', dir: 'up' },
    items: ITEMS,
    startItems: START_ITEMS,
    moves: MOVES,
    playerMoves: PLAYER_MOVES,
    fallbackMove: FALLBACK_MOVE,
    enemies: ENEMIES,
    badges: BADGES,
    baseHp: BASE_HP,
    hpPerBadge: HP_PER_BADGE,
    levels: LEVELS,
    learn: LEARN,
    economy: ECONOMY,
    shops: SHOPS,
    intro: intro(data),
    hints: HINTS,
    ending: ending(data),
    collect: [
      { item: COLLECT, total: countCollectibles(specs, COLLECT), label: 'STARS', mark: '*', icon: 'star-mini' },
      { item: STAMP, total: countCollectibles(specs, STAMP), label: 'STAMPS', mark: '#' },
    ],
    music: MUSIC,
  };
}
