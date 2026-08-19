import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button.js';

describe('Button', () => {
  it('defaults to type="button" so it does not submit an enclosing form', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button')).toHaveProperty('type', 'button');
  });

  it('is disabled and marked busy while loading', () => {
    render(<Button isLoading>Save</Button>);
    const button = screen.getByRole('button');

    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('stays disabled when explicitly disabled and not loading', () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole('button')).toHaveProperty('disabled', true);
  });

  it('uses only logical spacing utilities so it mirrors in RTL', () => {
    render(<Button>Save</Button>);
    const className = screen.getByRole('button').className;

    expect(className).not.toMatch(/\b(ml|mr|pl|pr)-/);
  });
});
