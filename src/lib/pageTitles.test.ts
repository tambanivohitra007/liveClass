import { describe, expect, it } from 'vitest';
import { getPageTitle } from './pageTitles';

describe('getPageTitle', () => {
  it('names top-level pages', () => {
    expect(getPageTitle('/dashboard')).toBe('Dashboard');
    expect(getPageTitle('/arcade')).toBe('Arcade');
    expect(getPageTitle('/mini-games')).toBe('Mini Games');
  });

  it('names pages with ids, preferring the more specific route', () => {
    expect(getPageTitle('/quiz/abc/host')).toBe('Host Session');
    expect(getPageTitle('/quiz/abc')).toBe('Quiz Editor');
    expect(getPageTitle('/rubric/r1/host')).toBe('Live Grading');
    expect(getPageTitle('/rubric/r1')).toBe('Rubric');
    expect(getPageTitle('/grading/g1/results')).toBe('Grading Results');
    expect(getPageTitle('/arcade/g1/host')).toBe('Arcade');
  });

  it('returns an empty string for unknown pages', () => {
    expect(getPageTitle('/')).toBe('');
    expect(getPageTitle('/nowhere')).toBe('');
  });
});
