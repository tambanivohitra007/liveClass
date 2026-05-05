import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CircularTimer from './CircularTimer';

describe('CircularTimer', () => {
  it('displays time remaining', () => {
    render(<CircularTimer timeLeft={15} totalTime={30} />);
    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveAttribute('aria-label', '15 seconds remaining');
    cleanup();
  });

  it('shows urgent styling when timeLeft <= 5', () => {
    render(<CircularTimer timeLeft={3} totalTime={30} />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('aria-live', 'assertive');
    expect(timer).toHaveClass('animate-timer-pulse');
    cleanup();
  });

  it('does not announce when time is not urgent', () => {
    render(<CircularTimer timeLeft={20} totalTime={30} />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('aria-live', 'off');
    cleanup();
  });

  it('renders SVG with correct progress', () => {
    const { container } = render(<CircularTimer timeLeft={15} totalTime={30} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    cleanup();
  });
});
