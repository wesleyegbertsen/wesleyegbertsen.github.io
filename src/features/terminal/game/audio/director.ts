import type { GameState, World } from '../engine/types.ts';

/**
 * Which tune a moment of the game wants: the name of a track, or null for silence. Pure, so the choice can be
 * tested without a sound being made. The names come from the world (content/music.ts).
 */
export function trackFor(state: GameState, world: World): string | null {
  const music = world.music;
  if (!music) return null;
  if (state.scene === 'title') return music.title;
  if (state.scene === 'ending') return music.ending;
  if (state.battle) {
    // The way in: the music stops, so the sound of the transition stands alone and leads into the battle tune.
    if (state.battle.intro > 0) return null;
    // The fanfare starts with the line that says the enemy is beaten, and lasts through the XP and the new level.
    if (state.battle.cheer) return music.victory;
    return state.battle.wild ? music.wild : (world.enemies[state.battle.enemy]?.tune ?? music.boss);
  }
  return music.maps[state.map] ?? music.indoors;
}
