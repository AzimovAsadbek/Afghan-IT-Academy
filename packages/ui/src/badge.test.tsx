import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge.js';

describe('Badge', () => {
  it('renders its content', () => {
    render(<Badge>Beginner</Badge>);
    expect(screen.getByText('Beginner')).toBeTruthy();
  });

  /**
   * A badge that reads as interactive to assistive technology, or that carries
   * a focus ring, invites a click that does nothing.
   */
  it('is not interactive', () => {
    render(<Badge>Beginner</Badge>);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Beginner').getAttribute('tabindex')).toBeNull();
  });

  it('uses only logical spacing utilities so it mirrors in RTL', () => {
    render(<Badge>Beginner</Badge>);

    expect(screen.getByText('Beginner').className).not.toMatch(/\b(ml|mr|pl|pr)-/);
  });
});
