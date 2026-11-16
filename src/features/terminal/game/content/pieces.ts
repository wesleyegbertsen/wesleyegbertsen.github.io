/**
 * What the player piano in the cafe can play: the list its selector shows, in this order.
 *
 * HOW TO EDIT: to add a piece,
 *   1. write its track in TRACKS (content/music.ts), like `moonlight`: `loop: false`, every voice `pluck: true`,
 *      with its voices at the levels they have to each other: how loud the piece is comes out by itself (`levelled`
 *      in music.ts: the cafe tune's level, its loudest step no louder than the loudest tune's);
 *   2. add one line here: an `id` of its own, the `name` and the `artist` as the selector shows them (capitals,
 *      22 characters at most each: the width of the box), and `track`, the name of that track in TRACKS.
 * Nothing else: the length the selector shows comes from the track (world.ts), never from here.
 */
export type PieceEntry = { id: string; name: string; artist: string; track: string };

/** The most characters a name or an artist may have: what fits a row of the selector. */
export const PIECE_TEXT_MAX = 22;

export const PIECES: PieceEntry[] = [
  { id: 'moonlight', name: 'MOONLIGHT SONATA MVT 1', artist: 'L. VAN BEETHOVEN', track: 'moonlight' },
  { id: 'scarborough-fair', name: 'SCARBOROUGH FAIR', artist: 'TRADITIONAL ENGLISH', track: 'scarborough-fair' },
  { id: 'always-in-my-heart', name: 'ALWAYS IN MY HEART', artist: 'KATO TATSUYA', track: 'always-in-my-heart' },
  { id: 'unravel', name: 'UNRAVEL', artist: 'TK, LING TOSITE SIGURE', track: 'unravel' },
];
