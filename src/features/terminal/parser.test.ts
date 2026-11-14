import { parse } from './parser.ts';

describe('parse', () => {
  it('gives null for a blank line', () => {
    expect(parse('')).toBeNull();
    expect(parse('   \t ')).toBeNull();
  });

  it('splits a name from its arguments on any whitespace', () => {
    expect(parse('  ls   projects \t x ')).toEqual({ name: 'ls', args: ['projects', 'x'] });
  });

  it('gives a command without arguments an empty list', () => {
    expect(parse('help')).toEqual({ name: 'help', args: [] });
  });

  it('keeps the spaces inside double and single quotes', () => {
    expect(parse('echo "a  b" c')).toEqual({ name: 'echo', args: ['a  b', 'c'] });
    expect(parse("echo 'a  b'")).toEqual({ name: 'echo', args: ['a  b'] });
  });

  it('lets one kind of quote hold the other', () => {
    expect(parse(`echo "it's"`)).toEqual({ name: 'echo', args: ["it's"] });
  });

  it('takes an unclosed quote to the end of the line', () => {
    expect(parse('echo "a b')).toEqual({ name: 'echo', args: ['a b'] });
  });

  it('keeps an empty quoted argument', () => {
    expect(parse('echo ""')).toEqual({ name: 'echo', args: [''] });
  });

  it('keeps flags as plain arguments', () => {
    expect(parse('rm -rf /')).toEqual({ name: 'rm', args: ['-rf', '/'] });
  });
});
