import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Alert, Field } from './field.js';

describe('Field', () => {
  it('associates the label with the input', () => {
    render(<Field label="Email" />);
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });

  it('marks the input invalid and announces the error when one is given', () => {
    render(<Field label="Email" error="That address is not valid." />);

    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('That address is not valid.');
  });

  it('is not marked invalid without an error', () => {
    render(<Field label="Email" />);
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('false');
  });

  it('points aria-describedby at both the hint and the error', () => {
    render(<Field label="Password" hint="At least 12 characters." error="Too short." />);

    const describedBy = screen.getByLabelText('Password').getAttribute('aria-describedby');
    const ids = describedBy?.split(' ') ?? [];

    expect(ids).toHaveLength(2);
    for (const id of ids) {
      expect(document.getElementById(id)?.textContent).toBeTruthy();
    }
  });

  it('omits aria-describedby when there is nothing to describe', () => {
    render(<Field label="Email" />);
    expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toBeNull();
  });

  it('gives two instances of the same label distinct ids', () => {
    render(
      <>
        <Field label="Password" />
        <Field label="Confirm password" />
      </>,
    );

    const first = screen.getByLabelText('Password').id;
    const second = screen.getByLabelText('Confirm password').id;

    expect(first).not.toBe(second);
  });

  it('uses only logical spacing utilities so it mirrors in RTL', () => {
    render(<Field label="Email" required error="Required." />);

    const markup = document.body.innerHTML;
    expect(markup).not.toMatch(/class="[^"]*\b(ml|mr|pl|pr)-/);
  });
});

describe('Alert', () => {
  it('announces an error assertively, because the user is waiting on it', () => {
    render(<Alert tone="error">Sign-in failed.</Alert>);

    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('aria-live')).toBe('assertive');
  });

  it('announces other tones politely so it does not interrupt', () => {
    render(<Alert tone="success">Check your email.</Alert>);

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });
});
