// The player in a battle: the trainer seen from behind, 32x32 like the enemies (scripts/sprites/enemies.mjs), but
// drawn whole (not mirrored), because he stands at an angle: he looks up and to the right, at the enemy. Same
// notation: 0 lightest, 1 light, 2 dark, 3 darkest, . see-through. After a change run `npm run sprites`.
//
// A person from head to feet, like the trainer's back on the real thing: a cap (dark, with a light band at the
// back) and its brim out to the upper right, dark hair, the right ear and a sliver of cheek (he is turned a little
// to the right), the neck, a light shirt over the shoulders, a backpack with straps, a flap and a pocket, both arms
// (the right one a little ahead), the trousers with the right leg a step ahead, and two shoes. The head, down to
// the neck, is about a third of the height.

export const trainers = {
  'trainer-back': [
'................................',
    '.............33333..............',
    '...........3322222333...........',
    '..........322222222223..........',
    '.........32222222222223.........',
    '.........3222000000222233333....',
    '.........33333333333332222223...',
    '.........333323333233333333.....',
    '.........332333323333113........',
    '.........333332333333113........',
    '..........3333333333313.........',
    '...........333233333313.........',
    '.............3311113............',
    '.......333000111100003333.......',
    '......30000332222223300033......',
    '.....3000132222222222300303.....',
    '.....30013222222222222303003....',
    '.....30013222000002222301003....',
    '.....30132222000002222301003....',
    '.....30132222222222222301103....',
    '.....301323333333333223011113...',
    '.....311323222222223223001113...',
    '.....3113232222222232230.333....',
    '......333232222222232230........',
    '........3323333333333223........',
    '.........3000000000000003.......',
    '.........3333333333333333.......',
    '.........3323333333332223.......',
    '.........3323333.3333223........',
    '.........3333333..333333........',
    '........30000003..3000003.......',
    '........33333333..3333333.......',
  ],
};
