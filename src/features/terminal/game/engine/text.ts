/** How much text fits the text box: characters per line and lines per page. */
export const COLS = 24;
export const ROWS = 3;

/** The bitmap font has printable ASCII only: fold accents and typographic marks, and show `?` for the rest. */
export function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7e]/g, '?');
}

/** Where to cut a word that is longer than a line: at a slash, dot, dash or at-sign if there is one, so links stay readable. */
function cut(word: string, cols: number): number {
  for (let i = cols; i > 1; i--) {
    if ('/@-:'.includes(word[i - 1]!) || './@'.includes(word[i]!)) return i;
  }
  return cols;
}

/** Word wrap. A word longer than a line (a link) starts on its own line and is cut there. */
export function wrap(text: string, cols = COLS): string[] {
  const lines: string[] = [];
  let line = '';
  for (let word of text.split(' ').filter(Boolean)) {
    if (line && line.length + 1 + word.length <= cols) {
      line += ` ${word}`;
      continue;
    }
    if (line) lines.push(line);
    while (word.length > cols) {
      const at = cut(word, cols);
      lines.push(word.slice(0, at));
      word = word.slice(at);
    }
    line = word;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Pages of at most `rows` lines. Every paragraph starts on a new page, and a paragraph that needs several pages
 * is spread evenly over them, so the last page is not a single leftover word.
 */
export function paginate(paragraphs: readonly string[], cols = COLS, rows = ROWS): string[][] {
  const pages: string[][] = [];
  for (const paragraph of paragraphs) {
    const lines = wrap(fold(paragraph), cols);
    const count = Math.ceil(lines.length / rows);
    for (let page = 0, at = 0; page < count; page++) {
      const size = Math.floor(lines.length / count) + (page < lines.length % count ? 1 : 0);
      pages.push(lines.slice(at, at + size));
      at += size;
    }
  }
  return pages;
}

export const pageLength = (page: readonly string[]) => page.reduce((sum, line) => sum + line.length, 0);
