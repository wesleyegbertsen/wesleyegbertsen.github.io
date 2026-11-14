import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import App from './App.tsx';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

function renderAt(path: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </StrictMode>,
  );
}

function expectBottomIcons() {
  expect(screen.getByRole('button', { name: 'Game Boy' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Email Wesley' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Skills' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Work experience' })).toBeInTheDocument();
}

describe('App', () => {
  it('renders every part of the home page', () => {
    renderAt('/');

    expect(screen.getByRole('heading', { level: 1, name: 'Wesley Egbertsen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wesley Egbertsen logo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pikachu' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Poké Ball \d$/ })).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Cat', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Site' })).toBeInTheDocument();
    expectBottomIcons();
  });

  it('shows the projects page with the shared menu and bottom icons, without the home content', () => {
    renderAt('/projects');

    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'CardiPaw' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Site' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Social and about' })).toBeInTheDocument();
    expectBottomIcons();
    expect(screen.queryByRole('button', { name: 'Pikachu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cat', hidden: true })).not.toBeInTheDocument();
  });

  it('sends an unknown address to the home page', () => {
    renderAt('/nope');

    expect(screen.getByRole('heading', { level: 1, name: 'Wesley Egbertsen' })).toBeInTheDocument();
  });
});
