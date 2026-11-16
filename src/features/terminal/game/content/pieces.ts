/**
 * What the player piano in the cafe can play: the list its selector shows, in this order.
 *
 * HOW TO EDIT: to add a piece,
 *   1. write its track in TRACKS (content/music.ts), like `moonlight`: `loop: false`, every voice `pluck: true`,
 *      and soft (a test keeps it under the loudest step of every other tune);
 *   2. add one line here: an `id` of its own, the `name` and the `artist` as the selector shows them (capitals,
 *      22 characters at most each: the width of the box), and `track`, the name of that track in TRACKS.
 * Nothing else: the length the selector shows comes from the track (world.ts), never from here.
 */
export type PieceEntry = { id: string; name: string; artist: string; track: string };

/** The most characters a name or an artist may have: what fits a row of the selector. */
export const PIECE_TEXT_MAX = 22;

export const PIECES: PieceEntry[] = [{ id: 'moonlight', name: 'MOONLIGHT SONATA', artist: 'L. VAN BEETHOVEN', track: 'moonlight' }];
