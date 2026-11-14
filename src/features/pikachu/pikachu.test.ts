import { createHash } from 'node:crypto';
import art from './pikachu.txt?raw';

describe('pikachu art', () => {
  it('is unchanged from the original page', () => {
    // SHA-256 of lines 26-54 of the original index.html, copied byte for byte.
    const hash = createHash('sha256').update(art, 'utf8').digest('hex');
    expect(hash).toBe('079da237cb2624a047f1568af50b043ef5fd248189c20aa8dd70abf56333e074');
  });

  it('has no carriage returns', () => {
    expect(art).not.toContain('\r');
  });
});
