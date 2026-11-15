// The player in a battle: the trainer seen from behind, 32x32 like the enemies (scripts/sprites/enemies.mjs), but
// drawn whole (not mirrored), because he stands at an angle: he looks up and to the right, at the enemy. Same
// notation: 0 lightest, 1 light, 2 dark, 3 darkest, . see-through. After a change run `npm run sprites`.
//
// A cap with a light panel where the light falls on it (from the upper left) and its brim out to the right, the
// hair below it, the right ear and a sliver of cheek (he is turned a little), the neck, a jacket with its shoulders,
// a backpack with a flap, a buckle, a pocket and the straps over the shoulders, and the right arm a little out.
// The picture is cut at the waist, like a trainer's back in a battle on the real thing.

export const trainers = {
  'trainer-back': [
    '................................',
    '..............33333.............',
    '............330000233...........',
    '...........30000022223..........',
    '..........3000002222223.........',
    '..........30000222222223333.....',
    '..........322222222222222223....',
    '..........3333333333333333333...',
    '..........32333233333322113.....',
    '..........32333332333321013.....',
    '..........33323333323321113.....',
    '...........3333333233331113.....',
    '............33333333333113......',
    '.............33111111133........',
    '........33333221111112233333....',
    '.......3222223311111133222223...',
    '......322222300000000003222223..',
    '.....3222223000000000000322223..',
    '....32222230000000000000032223..',
    '....3222223333330033333332222233',
    '...32222223111113003111113222223',
    '...32222223111111331111113222223',
    '...32222223111111111111113222223',
    '...32222223113333333333113222223',
    '...32222223113222222223113222203',
    '...32222223113111111113113222003',
    '...32222223113111111113113222203',
    '...32222223113333333333113222223',
    '...32222223111111111111113222223',
    '...32222223111111111111113222223',
    '...32222223333333333333333222223',
    '...32222222222222222222222222223',
  ],
};
