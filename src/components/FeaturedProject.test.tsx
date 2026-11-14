import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter } from 'react-router';
import { render, screen, within } from '@testing-library/react';
import { projects, type Project } from '../data/projects.ts';
import { FeaturedProject } from './FeaturedProject.tsx';

function setup(project: Project) {
  return render(
    <MemoryRouter>
      <FeaturedProject project={project} />
    </MemoryRouter>,
  );
}

const fake: Project = {
  id: 'fake',
  name: 'Fake App',
  tagline: 'A made-up tagline.',
  description: 'Unused here.',
  published: '2030-01',
  tech: [],
  screenshots: [{ src: '/fake.png', alt: 'Fake screenshot', width: 100, height: 200 }],
  links: { live: 'https://example.com/', github: 'https://example.com/gh' },
};

describe('FeaturedProject', () => {
  it('shows the newest project with its first screenshot', () => {
    const project = projects[0]!;
    setup(project);

    const region = screen.getByRole('region', { name: project.name });
    expect(within(region).getByRole('heading', { level: 2, name: project.name })).toBeInTheDocument();
    expect(within(region).getByText(project.tagline)).toBeInTheDocument();

    const shot = project.screenshots[0]!;
    const img = within(region).getByRole('img', { name: shot.alt });
    expect(img).toHaveAttribute('src', shot.src);
    expect(img).toHaveAttribute('width', String(shot.width));
    expect(img).toHaveAttribute('height', String(shot.height));
  });

  it('labels the teaser as the featured project', () => {
    setup(fake);
    expect(screen.getByText('Featured project')).toBeInTheDocument();
  });

  it('links to the projects page', () => {
    setup(fake);
    expect(screen.getByRole('link', { name: 'View projects' })).toHaveAttribute('href', '/projects');
  });

  it('takes everything from its props, not from a hard-coded project', () => {
    setup(fake);
    expect(screen.getByRole('heading', { level: 2, name: 'Fake App' })).toBeInTheDocument();
    expect(screen.getByText('A made-up tagline.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Fake screenshot' })).toBeInTheDocument();

    const source = readFileSync(resolve(process.cwd(), 'src/components/FeaturedProject.tsx'), 'utf8');
    expect(source).not.toContain('CardiPaw');
  });

  it('renders without a screenshot', () => {
    setup({ ...fake, screenshots: [] });
    expect(screen.getByRole('heading', { level: 2, name: 'Fake App' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
