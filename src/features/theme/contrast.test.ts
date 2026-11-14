import { contrastRatio, relativeLuminance } from './contrast.ts';

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colours', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('does not depend on the order', () => {
    expect(contrastRatio('#3d6b00', '#fff')).toBeCloseTo(contrastRatio('#fff', '#3d6b00'), 10);
  });

  it('puts #777 on white just under 4.5', () => {
    const ratio = contrastRatio('#777', '#fff');
    expect(ratio).toBeGreaterThan(4.4);
    expect(ratio).toBeLessThan(4.5);
  });

  it('reads short and long hex the same way', () => {
    expect(relativeLuminance('#0f0')).toBeCloseTo(relativeLuminance('#00ff00'), 10);
  });
});
