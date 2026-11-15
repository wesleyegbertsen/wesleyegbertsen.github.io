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
    // The fanfare starts with the line that says the enemy is beaten: the last line of a won battle.
    if (state.battle.outcome === 'win' && state.battle.steps.length <= 1) return music.victory;
    return state.battle.wild ? music.wild : music.boss;
  }
  return music.maps[state.map] ?? music.indoors;
}
