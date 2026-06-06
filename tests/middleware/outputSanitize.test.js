const outputSanitize = require('../../server/middleware/outputSanitize');

function mockReqRes() {
  const req = {};
  const capturedResponses = [];

  const res = {
    json: jest.fn((data) => capturedResponses.push(data)),
    _captured: capturedResponses,
  };

  return { req, res };
}

function runMiddlewareAndCapture(data) {
  const { req, res } = mockReqRes();
  const next = jest.fn();

  outputSanitize(req, res, next);
  expect(next).toHaveBeenCalled();

  res.json(data);
  return res._captured[0];
}

describe('outputSanitize middleware', () => {
  test('escapes < and > in string values', () => {
    const result = runMiddlewareAndCapture({ text: '<b>bold</b>' });
    expect(result.text).toBe('&lt;b&gt;bold&lt;/b&gt;');
  });

  test('escapes & in string values', () => {
    const result = runMiddlewareAndCapture({ text: 'cats & dogs' });
    expect(result.text).toBe('cats &amp; dogs');
  });

  test('escapes double quotes', () => {
    const result = runMiddlewareAndCapture({ text: 'say "hello"' });
    expect(result.text).toBe('say &quot;hello&quot;');
  });

  test('escapes single quotes', () => {
    const result = runMiddlewareAndCapture({ text: "it's fine" });
    expect(result.text).toBe('it&#39;s fine');
  });

  test('handles nested objects', () => {
    const result = runMiddlewareAndCapture({
      outer: { inner: '<script>alert(1)</script>' },
    });
    expect(result.outer.inner).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('handles arrays of strings', () => {
    const result = runMiddlewareAndCapture({ items: ['<a>', '<b>'] });
    expect(result.items).toEqual(['&lt;a&gt;', '&lt;b&gt;']);
  });

  test('passes through numbers untouched', () => {
    const result = runMiddlewareAndCapture({ count: 42 });
    expect(result.count).toBe(42);
  });

  test('passes through booleans untouched', () => {
    const result = runMiddlewareAndCapture({ active: true });
    expect(result.active).toBe(true);
  });

  test('passes through null untouched', () => {
    const result = runMiddlewareAndCapture({ value: null });
    expect(result.value).toBeNull();
  });

  test('handles clean text without modification', () => {
    const result = runMiddlewareAndCapture({ text: 'Normal maintenance text.' });
    expect(result.text).toBe('Normal maintenance text.');
  });
});
