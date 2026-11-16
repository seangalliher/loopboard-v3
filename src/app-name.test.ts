import { describe, expect, it } from 'vitest';
import { APP_NAME, pageTitle } from './app-name';

describe('pageTitle', () => {
  it('is the app name alone without a section', () => {
    expect(pageTitle()).toBe(APP_NAME);
  });

  it('prefixes the section when given', () => {
    expect(pageTitle('Board')).toBe('Board · LoopBoard');
  });
});
