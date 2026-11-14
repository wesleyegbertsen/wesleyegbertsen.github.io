import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SocialBar } from './SocialBar.tsx';

function setup() {
  return { user: userEvent.setup(), ...render(<SocialBar />) };
}

describe('social bar panels', () => {
  it('opens the skills panel from its button', async () => {
    const { user } = setup();
    const button = screen.getByRole('button', { name: 'Skills' });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    const dialog = screen.getByRole('dialog', { name: 'My Technical Skills' });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(15);
    expect(within(dialog).getByText(/Images & LoRA training/)).toBeInTheDocument();
  });

  it('lists the work experience newest first', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Work experience' }));

    const dialog = screen.getByRole('dialog', { name: 'My Work Experience' });
    const jobs = within(dialog).getAllByRole('listitem');
    expect(jobs).toHaveLength(10);
    expect(within(jobs[0]!).getByRole('heading', { name: 'Consultant' })).toBeInTheDocument();
    expect(within(jobs[0]!).getByText('May 2026 - Present')).toBeInTheDocument();
    expect(within(jobs[9]!).getByText('January 2012 - June 2012')).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the button', async () => {
    const { user } = setup();
    const button = screen.getByRole('button', { name: 'Skills' });
    await user.click(button);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on an outside press but not on a press inside', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Skills' }));

    await user.click(screen.getByRole('heading', { name: 'My Technical Skills' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('toggles closed when the same button is pressed again', async () => {
    const { user } = setup();
    const button = screen.getByRole('button', { name: 'Skills' });
    await user.click(button);
    await user.click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opening one panel closes the other', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Skills' }));
    await user.click(screen.getByRole('button', { name: 'Work experience' }));

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'My Work Experience' })).toBeInTheDocument();
  });

  it('moves focus into the dialog when it opens', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Skills' }));
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('links out to GitHub and LinkedIn safely', () => {
    setup();
    for (const name of ['GitHub', 'LinkedIn']) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    }
  });
});
