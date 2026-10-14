import { describe, test, expect } from 'vitest';
import { FEEDBACK_EMAIL } from './brand';
import {
  buildMailto, feedbackMailto, problemMailto, problemReport, uaSummary, MAILTO_MAX,
  type FeedbackContext,
} from './feedback';
import type { ErrorEntry } from './errorLog';

const ctx: FeedbackContext = {
  version: '1.0.0', channel: 'web', browser: 'Chrome 129 on macOS', viewport: '1280×800', theme: 'system (dark)',
};

function parse(url: string) {
  const [addr, query] = url.slice('mailto:'.length).split('?');
  const params = new URLSearchParams(query.replace(/\+/g, '%2B'));
  return { addr, subject: params.get('subject')!, body: params.get('body')! };
}

describe('feedback mailto', () => {
  test('is addressed to the feedback inbox with a versioned subject', () => {
    const m = parse(feedbackMailto(ctx));
    expect(FEEDBACK_EMAIL).toBe('sandhoshsivan00@gmail.com');
    expect(m.addr).toBe(FEEDBACK_EMAIL);
    expect(m.subject).toBe('Khazana feedback — 1.0.0 (web)');
    for (const line of ['App version: 1.0.0', 'Build channel: web', 'Browser: Chrome 129 on macOS', 'Viewport: 1280×800', 'Theme: system (dark)']) {
      expect(m.body).toContain(line);
    }
    expect(m.body.startsWith('\n')).toBe(true);
  });

  test('desktop channel shows in the subject', () => {
    expect(parse(feedbackMailto({ ...ctx, channel: 'desktop' })).subject).toContain('(desktop)');
  });

  test('encodes spaces as %20, never +', () => {
    expect(feedbackMailto(ctx)).not.toContain('+');
  });
});

describe('problem report', () => {
  const errors: ErrorEntry[] = Array.from({ length: 50 }, (_, i) => ({
    t: Date.UTC(2026, 0, 1, 0, i), message: `TypeError: thing ${i} broke`, stack: `Error\n    at fn${i} (app.js:${i}:10)`.repeat(8), route: '/settings', version: '1.0.0',
  }));

  test('full report lists errors newest first', () => {
    const r = problemReport(ctx, errors);
    expect(r.indexOf('thing 49')).toBeLessThan(r.indexOf('thing 0 '));
    expect(r).toContain('Recent errors (50, sanitized)');
  });

  test('mailto stays under the length cap and says it was truncated', () => {
    const url = problemMailto(ctx, errors);
    expect(url.length).toBeLessThanOrEqual(MAILTO_MAX);
    const m = parse(url);
    expect(m.addr).toBe(FEEDBACK_EMAIL);
    expect(m.subject).toBe('Khazana problem report — 1.0.0 (web)');
    expect(m.body).toContain('App version: 1.0.0');
    expect(m.body).toContain('truncated');
  });

  test('a short report is not truncated', () => {
    const url = problemMailto(ctx, []);
    expect(url.length).toBeLessThanOrEqual(MAILTO_MAX);
    expect(parse(url).body).toContain('No errors have been recorded');
    expect(parse(url).body).not.toContain('truncated');
  });

  test('truncation never splits an emoji', () => {
    const body = '😀'.repeat(2000);
    expect(() => buildMailto({ subject: 's', body })).not.toThrow();
    expect(buildMailto({ subject: 's', body }).length).toBeLessThanOrEqual(MAILTO_MAX);
  });
});

test('uaSummary is coarse', () => {
  expect(uaSummary('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.90 Safari/537.36'))
    .toBe('Chrome 129 on macOS');
  expect(uaSummary('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'))
    .toBe('Safari 17 on iOS');
  expect(uaSummary('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('Firefox 131 on Windows');
  expect(uaSummary('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)')).toBe('WebKit on macOS');
});
