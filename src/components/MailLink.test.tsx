import { render, screen } from '@testing-library/react';
import { MailLink } from './MailLink.tsx';

describe('MailLink', () => {
  it('links to the email address', () => {
    render(<MailLink />);
    expect(screen.getByRole('link', { name: 'Email Wesley' })).toHaveAttribute(
      'href',
      'mailto:wesleyegbertsen@gmail.com',
    );
  });
});
