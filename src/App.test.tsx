import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import App from './App.tsx';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

describe('App', () => {
  it('renders every part of the page', () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Wesley Egbertsen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wesley Egbertsen logo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pikachu' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Poké Ball \d$/ })).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Game Boy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Email Wesley' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skills' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Work experience' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cat', hidden: true })).toBeInTheDocument();
  });
});
