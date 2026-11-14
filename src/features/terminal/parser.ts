export type ParsedLine = { name: string; args: string[] };

/**
 * Splits a command line into a name and arguments. Whitespace separates words, and single or double
 * quotes keep the spaces inside them. An unclosed quote runs to the end of the line. A blank line gives null.
 */
export function parse(line: string): ParsedLine | null {
  const words: string[] = [];
  let word = '';
  let started = false;
  let quote: '"' | "'" | null = null;

  for (const char of line) {
    if (quote) {
      if (char === quote) quote = null;
      else word += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) words.push(word);
      word = '';
      started = false;
    } else {
      word += char;
      started = true;
    }
  }
  if (started) words.push(word);

  const [name, ...args] = words;
  return name === undefined ? null : { name, args };
}
