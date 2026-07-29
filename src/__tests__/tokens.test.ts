import {
  alpha,
  getTokens,
  type as typeScale,
  withAlpha,
} from '../theme/tokens';

describe('withAlpha', () => {
  it('converts 6-digit hex to rgba', () => {
    expect(withAlpha('#00A1E0', 0.5)).toBe('rgba(0, 161, 224, 0.5)');
  });

  it('expands 3-digit shorthand hex', () => {
    expect(withAlpha('#0AE', 1)).toBe('rgba(0, 170, 238, 1)');
  });

  it('replaces an existing hex alpha channel rather than appending', () => {
    expect(withAlpha('#00A1E080', 0.25)).toBe('rgba(0, 161, 224, 0.25)');
  });

  it('rewrites the alpha of an rgba() colour', () => {
    expect(withAlpha('rgba(5, 8, 22, 0.96)', 0.5)).toBe('rgba(5, 8, 22, 0.5)');
  });

  it('adds alpha to an rgb() colour', () => {
    expect(withAlpha('rgb(5, 8, 22)', 0.4)).toBe('rgba(5, 8, 22, 0.4)');
  });

  it('accepts a named alpha token', () => {
    expect(withAlpha('#FFFFFF', 'subtle')).toBe(
      `rgba(255, 255, 255, ${alpha.subtle})`,
    );
  });

  it('clamps out-of-range opacity', () => {
    expect(withAlpha('#000000', 5)).toBe('rgba(0, 0, 0, 1)');
    expect(withAlpha('#000000', -2)).toBe('rgba(0, 0, 0, 0)');
  });

  it('returns named colours untouched instead of producing garbage', () => {
    expect(withAlpha('transparent', 0.5)).toBe('transparent');
  });

  it('returns malformed input untouched', () => {
    expect(withAlpha('#12345', 0.5)).toBe('#12345');
  });

  it('is case-insensitive about hex digits', () => {
    expect(withAlpha('#00a1e0', 0.5)).toBe(withAlpha('#00A1E0', 0.5));
  });

  // The pattern this replaces: `color + '12'` only ever worked for
  // 6-digit hex, and silently produced an invalid colour otherwise.
  it('handles the rgba inputs that broke string concatenation', () => {
    const legacy = 'rgba(94,168,255,0.12)' + '12';
    expect(legacy).not.toMatch(/^rgba\([^)]*\)$/);
    expect(withAlpha('rgba(94,168,255,0.12)', 0.12)).toBe(
      'rgba(94, 168, 255, 0.12)',
    );
  });
});

describe('token sets', () => {
  it('returns a stable reference per scheme so memoisation holds', () => {
    expect(getTokens(true)).toBe(getTokens(true));
    expect(getTokens(false)).toBe(getTokens(false));
    expect(getTokens(true)).not.toBe(getTokens(false));
  });

  it('defines every role in both schemes', () => {
    const dark = getTokens(true);
    const light = getTokens(false);

    const roleShape = (t: typeof dark) => ({
      surface: Object.keys(t.color.surface).sort(),
      border: Object.keys(t.color.border).sort(),
      text: Object.keys(t.color.text).sort(),
      status: Object.keys(t.color.status).sort(),
    });

    expect(roleShape(light)).toEqual(roleShape(dark));
  });

  it('gives each status a base, surface and border', () => {
    const { status } = getTokens(true).color;
    for (const [name, role] of Object.entries(status)) {
      expect(role.base).toMatch(/^(#|rgba?\()/);
      expect(role.surface).toMatch(/^rgba\(/);
      expect(role.border).toMatch(/^rgba\(/);
      expect(role.base).not.toBe(role.surface);
      expect(name).toBeTruthy();
    }
  });

  it('resolves different surfaces per scheme', () => {
    expect(getTokens(true).color.surface.canvas).not.toBe(
      getTokens(false).color.surface.canvas,
    );
  });

  it('flags the scheme', () => {
    expect(getTokens(true).isDark).toBe(true);
    expect(getTokens(false).isDark).toBe(false);
  });
});

describe('type ramp', () => {
  it('is ordered from largest to smallest', () => {
    const sizes = [
      typeScale.metric,
      typeScale.title,
      typeScale.heading,
      typeScale.subheading,
      typeScale.body,
      typeScale.bodySmall,
      typeScale.label,
      typeScale.caption,
      typeScale.micro,
    ].map((s) => s.fontSize);

    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });

  it('gives every role a line height above its font size', () => {
    for (const style of Object.values(typeScale)) {
      expect(style.lineHeight).toBeGreaterThan(style.fontSize);
    }
  });
});
