import { render, screen } from '@testing-library/react';
import { ProjectsPage } from './ProjectsPage.tsx';
import { projects } from '../data/projects.ts';

describe('ProjectsPage', () => {
  it('has a Projects heading and one article per project', () => {
    render(<ProjectsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(projects.length);
  });
});
