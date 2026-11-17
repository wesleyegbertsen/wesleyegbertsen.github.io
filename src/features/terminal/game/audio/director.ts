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
  // The player piano replaces the tune of its room while it plays: the track of its piece.
  const piece = pianoPiece(state, world);
  if (piece) return piece.track;
  return music.maps[state.map] ?? music.indoors;
}

function pianoPiece(state: GameState, world: World) {
  return state.piano && state.piano.map === state.map ? world.pieces?.find((candidate) => candidate.id === state.piano!.piece) : undefined;
}

/**
 * How many seconds of the tune `trackFor` names have run already, as the game counts them: the player piano's piece
 * that is under way (its length in ticks, 60 a second, less the ticks left). Undefined for every other tune, which
 * starts from its start.
 */
export function positionFor(state: GameState, world: World): number | undefined {
  if (state.scene !== 'world' || state.battle || !state.piano) return undefined;
  const piece = pianoPiece(state, world);
  return piece ? Math.max(0, piece.ticks - state.piano.ticks) / 60 : undefined;
}
