/** The draft level, one string per row. Wesley: edit the map and the section starts to taste.
 *  `#` solid  `=` one-way platform  `^` spikes  `|` checkpoint  `*` item slot  `F` flag  `@` start */
export const MAP: readonly string[] = [
    '                                                                                                                                                                          ',
    '                                                                                                                                                                          ',
    '                                                                                                                                                                          ',
    '                                                                                                                                                                          ',
    '                                                                                                                                                                          ',
    '                                                                                                                                                                          ',
    '                                                                                                                                                                          ',
    '                              *                                               *                                             *                                             ',
    '                      *     ======                                          ======                                        ======                                          ',
    '|  @    *  ^   *                    ^   *     ^     *       |       *   ^             ^     *       |   ^     *                   ^         |                        F    ',
    '#####################   #############################################################################################   ##################################################',
    '#####################   #############################################################################################   ##################################################',
];

/** Where each section starts, in map columns, and what its item slots are labelled from. */
export const SECTION_STARTS = [
  { id: 'experience', label: 'Experience', start: 0 },
  { id: 'education', label: 'Education', start: 60 },
  { id: 'projects', label: 'Projects', start: 100 },
  { id: 'contact', label: 'Contact', start: 140 },
] as const;
