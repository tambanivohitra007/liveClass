import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('haptics', () => {
  beforeEach(() => {
    // Reset module cache so canVibrate is re-evaluated
    vi.resetModules();
  });

  it('calls navigator.vibrate(10) for hapticLight when vibrate is available', async () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrateMock, writable: true, configurable: true });

    const { hapticLight } = await import('./haptics');
    hapticLight();
    expect(vibrateMock).toHaveBeenCalledWith(10);
  });

  it('calls navigator.vibrate(25) for hapticMedium', async () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrateMock, writable: true, configurable: true });

    const { hapticMedium } = await import('./haptics');
    hapticMedium();
    expect(vibrateMock).toHaveBeenCalledWith(25);
  });

  it('calls navigator.vibrate with pattern for hapticSuccess', async () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrateMock, writable: true, configurable: true });

    const { hapticSuccess } = await import('./haptics');
    hapticSuccess();
    expect(vibrateMock).toHaveBeenCalledWith([10, 50, 20]);
  });

  it('calls navigator.vibrate with pattern for hapticError', async () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrateMock, writable: true, configurable: true });

    const { hapticError } = await import('./haptics');
    hapticError();
    expect(vibrateMock).toHaveBeenCalledWith([30, 50, 30]);
  });
});
