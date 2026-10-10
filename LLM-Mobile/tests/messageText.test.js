import { toPlainText, answerForClipboard, toQuote, MAX_QUOTE_CHARS } from '../utils/messageText';

test('APP-B1-1 copied answers read cleanly: no Markdown symbols left', () => {
  const md = [
    '## Wiring',
    '**WARNING:** Switch off the power supply.',
    '1. Loosen the `screw` on the cover.',
    '- Use an *approved* cable',
    'See [page 56](http://x).',
  ].join('\n');
  const plain = toPlainText(md);
  expect(plain).toContain('WARNING: Switch off the power supply.');
  expect(plain).toContain('1. Loosen the screw on the cover.');
  expect(plain).toContain('• Use an approved cable');
  expect(plain).toContain('See page 56.');
  expect(plain).not.toMatch(/[*#`]|\]\(/);
});

test('APP-B1-2 tables become readable rows', () => {
  const plain = toPlainText('| Model | Cable |\n|---|---|\n| CS-S10TKH | 4 x 1.5 mm² |');
  expect(plain).toContain('Model  Cable');
  expect(plain).toContain('CS-S10TKH  4 x 1.5 mm²');
  expect(plain).not.toContain('|');
});

test('APP-B1-3 a copied answer keeps its manual sources, deduplicated', () => {
  const text = answerForClipboard({
    text: 'Switch off the power.',
    sources: [{ filename: 'manual.pdf', page: 56 }, { filename: 'manual.pdf', page: 56 }, { filename: 'manual.pdf', page: 75 }],
  });
  expect(text).toBe('Switch off the power.\n\nSources:\n- manual.pdf, p.56\n- manual.pdf, p.75');
});

test('APP-B1-4 an answer without sources is copied as-is', () => {
  expect(answerForClipboard({ text: 'No manual covers this.', sources: [] })).toBe('No manual covers this.');
});

test('APP-B3-1 quotes collapse whitespace and are capped to the server limit', () => {
  expect(toQuote('  Secure the\n  cable  ')).toBe('Secure the cable');
  const long = toQuote('x'.repeat(900));
  expect(long.length).toBeLessThanOrEqual(MAX_QUOTE_CHARS);
  expect(long.endsWith('…')).toBe(true);
});
