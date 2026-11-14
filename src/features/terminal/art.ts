/** ASCII art for the easter eggs. Pure: the same input gives the same lines. */

export function cowsayLines(text: string): string[] {
  const said = text.trim() || 'Moo';
  return [
    ` ${'_'.repeat(said.length + 2)}`,
    `< ${said} >`,
    ` ${'-'.repeat(said.length + 2)}`,
    '        \\   ^__^',
    '         \\  (oo)\\_______',
    '            (__)\\       )\\/\\',
    '                ||----w |',
    '                ||     ||',
  ];
}

// Narrow on purpose: art, a space and the widest fact must fit about 32 characters, the width of a phone.
const NEOFETCH_ART = [
  ' .------.',
  ' | >_   |',
  ' |      |',
  " '------'",
  '  /____\\',
];

export type NeofetchInfo = {
  user: string;
  host: string;
  os: string;
  shell: string;
  theme: string;
  commands: number;
  projects: number;
};

/** The art on the left, the facts on the right. */
export function neofetchLines(info: NeofetchInfo): string[] {
  const title = `${info.user}@${info.host}`;
  const facts = [
    title,
    '-'.repeat(title.length),
    `OS:       ${info.os}`,
    `Shell:    ${info.shell}`,
    `Theme:    ${info.theme}`,
    `Commands: ${info.commands}`,
    `Projects: ${info.projects}`,
  ];
  const width = Math.max(...NEOFETCH_ART.map((line) => line.length));
  return facts.map((fact, i) => `${(NEOFETCH_ART[i] ?? '').padEnd(width)} ${fact}`);
}

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789ABCDEFZ:.=*+-<>';

/** One line of falling-rain glyphs, `width` characters wide, from a `random` in [0, 1). */
export function matrixLine(random: () => number, width: number): string {
  let line = '';
  for (let i = 0; i < width; i += 1) {
    line += random() < 0.3 ? ' ' : GLYPHS[Math.floor(random() * GLYPHS.length)]!;
  }
  return line;
}
