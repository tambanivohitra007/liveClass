import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import OfflineBanner from './OfflineBanner';

describe('OfflineBanner', () => {
  it('renders offline message', () => {
    render(<OfflineBanner />);
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
    cleanup();
  });

  it('has role="alert" for screen readers', () => {
    render(<OfflineBanner />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    cleanup();
  });
});
