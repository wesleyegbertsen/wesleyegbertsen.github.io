import { audio, images } from './index.ts';

describe('assets', () => {
  it.each(Object.entries({ ...images, ...audio }))('%s resolves to a URL', (_name, url) => {
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
  });
});
