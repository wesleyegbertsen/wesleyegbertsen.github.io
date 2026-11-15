import type { FsData } from '../../fs.ts';
import type { World } from '../engine/types.ts';
import { parseMap } from '../engine/world.ts';
import { BADGES, BASE_HP, ENEMIES, FALLBACK_MOVE, HP_PER_BADGE, ITEMS, MOVES, PLAYER_MOVES, START_ITEMS } from './battles.ts';
import { LEGEND } from './maps.ts';
import { HINTS, buildMaps, ending, intro } from './story.ts';

/** Puts the content modules together into the world the engine plays. The facts come from `data`. */
export function buildWorld(data: FsData): World {
  const maps = buildMaps(data).map((spec) => parseMap(spec, LEGEND));
  return {
    title: 'CAREER QUEST',
    subtitle: data.profile.name,
    maps: Object.fromEntries(maps.map((map) => [map.id, map])),
    tiles: LEGEND,
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
    intro: intro(data),
    hints: HINTS,
    ending: ending(data),
  };
}
