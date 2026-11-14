import { MemoryRouter, useLocation } from 'react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SiteMenu } from './SiteMenu.tsx';
import * as navigation from '../data/navigation.ts';

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function setup(collapsed: boolean, path = '/', items?: navigation.NavItem[]) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: collapsed,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SiteMenu items={items} />
      <Where />
    </MemoryRouter>,
  );
}

describe('SiteMenu on a wide screen', () => {
  it('lists the nav items as links in a Site landmark', () => {
    setup(false);
    const nav = screen.getByRole('navigation', { name: 'Site' });
    expect(nav).toBeInTheDocument();
    expect(screen.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual(
      navigation.navItems.map((item) => [item.label, item.to]),
    );
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('marks the current page and follows navigation', async () => {
    setup(false);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Projects' })).not.toHaveAttribute('aria-current');

    await userEvent.click(screen.getByRole('link', { name: 'Projects' }));

    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('renders an extra item added to the list', () => {
    setup(false, '/', [...navigation.navItems, { id: 'extra', label: 'Extra', to: '/extra' }]);
    expect(screen.getByRole('link', { name: 'Extra' })).toHaveAttribute('href', '/extra');
  });
});

describe('SiteMenu on a narrow screen', () => {
  it('shows only a closed Menu button', () => {
    setup(true);
    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('opens on click, focuses the first link and points aria-controls at the list', async () => {
    setup(true);
    const toggle = screen.getByRole('button', { name: 'Menu' });
    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveFocus();
    const listId = toggle.getAttribute('aria-controls')!;
    expect(document.getElementById(listId)).toContainElement(screen.getByRole('link', { name: 'Home' }));
  });

  it('closes on Escape and returns focus to the toggle', async () => {
    setup(true);
    const toggle = screen.getByRole('button', { name: 'Menu' });
    await userEvent.click(toggle);
    await userEvent.keyboard('{Escape}');

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('closes on a press outside, and toggles on a press of the button', async () => {
    setup(true);
    const toggle = screen.getByRole('button', { name: 'Menu' });
    await userEvent.click(toggle);
    await userEvent.click(document.body);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('navigates and closes when a link is chosen', async () => {
    setup(true);
    const toggle = screen.getByRole('button', { name: 'Menu' });
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('link', { name: 'Projects' }));

    expect(screen.getByTestId('where')).toHaveTextContent('/projects');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
