import { navItems } from './navigation.ts';

describe('navItems', () => {
  it('lists Home then Projects', () => {
    expect(navItems.map((item) => [item.label, item.to])).toEqual([
      ['Home', '/'],
      ['Projects', '/projects'],
    ]);
  });

  it('has unique ids', () => {
    expect(new Set(navItems.map((item) => item.id)).size).toBe(navItems.length);
  });
});
