import { render, screen, within } from '@testing-library/react';
import { ProjectCard } from './ProjectCard.tsx';
import { projects } from '../data/projects.ts';

const project = projects[0]!;

describe('ProjectCard', () => {
  it('is an article named after the project, with its tagline and description', () => {
    render(<ProjectCard project={project} />);

    const card = screen.getByRole('article', { name: project.name });
    expect(within(card).getByRole('heading', { level: 2, name: project.name })).toBeInTheDocument();
    expect(within(card).getByText(project.tagline)).toBeInTheDocument();
    expect(within(card).getByText(project.description)).toBeInTheDocument();
  });

  it('lists the tech as chips', () => {
    render(<ProjectCard project={project} />);

    const chips = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(chips).toEqual(expect.arrayContaining(project.tech));
  });

  it('shows every screenshot with its alt text', () => {
    render(<ProjectCard project={project} />);

    for (const shot of project.screenshots) {
      const image = screen.getByRole('img', { name: shot.alt });
      expect(image).toHaveAttribute('src', shot.src);
      // Intrinsic size reserves the space, so the card does not jump as lazy images load.
      expect(image).toHaveAttribute('width', String(shot.width));
      expect(image).toHaveAttribute('height', String(shot.height));
    }
  });

  it('links live site first, then GitHub, then the extras, all opening safely in a new tab', () => {
    render(<ProjectCard project={project} />);

    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      project.links.live,
      project.links.github,
      ...(project.links.extras ?? []).map((extra) => extra.href),
    ]);
    expect(links.map((a) => a.textContent)).toEqual([
      'Live site',
      'GitHub',
      ...(project.links.extras ?? []).map((extra) => extra.label),
    ]);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noreferrer');
    }
  });
});
