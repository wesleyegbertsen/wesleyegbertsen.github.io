import html from '../index.html?raw';

describe('index.html', () => {
  it('does not lock zoom', () => {
    const viewport = /<meta[^>]*name="viewport"[^>]*>/.exec(html)?.[0] ?? '';
    expect(viewport).toContain('width=device-width');
    expect(viewport).not.toMatch(/user-scalable/i);
    expect(viewport).not.toMatch(/maximum-scale/i);
  });

  it('declares the language and title', () => {
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<title>Wesley Egbertsen</title>');
  });
});
