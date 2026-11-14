import { render, screen } from '@testing-library/react';
import App from './App.tsx';

it('renders the logo', () => {
  render(<App />);
  expect(screen.getByAltText(/wesley egbertsen/i)).toBeInTheDocument();
});
