const { buildStepImageContent } = require('../../server/services/stepImages');
const image = { id: 'sleeve', page: 50, documentGroupId: 'aircon', caption: 'Reference image from page 50', url: 'https://example.com/sleeve.jpg' };
test('no images keeps extraction text-only', () => {
  expect(buildStepImageContent('Answer', [])).toBe('Answer');
});
test('generic caption includes actual figure and matching page context', () => {
  const result = buildStepImageContent('Answer', [image], [
    { page: 50, document_group_id: 'aircon', text: 'Install sleeve and bushing.' },
    { page: 50, document_group_id: 'other', text: 'Unrelated manual' },
    { page: 51, document_group_id: 'aircon', text: 'Wrong page' },
  ]);
  expect(JSON.parse(result[1].text)).toEqual({ image_id: 'sleeve', page: 50, caption: image.caption, page_context: 'Install sleeve and bushing.' });
  expect(result[2]).toEqual({ type: 'image_url', image_url: { url: image.url, detail: 'auto' } });
});
test('page context and number of figures are bounded', () => {
  const result = buildStepImageContent('Answer', Array(20).fill(image), [{ page: 50, document_group_id: 'aircon', text: 'x'.repeat(4000) }]);
  expect(result.filter(part => part.type === 'image_url')).toHaveLength(12);
  expect(JSON.parse(result[1].text).page_context).toHaveLength(2000);
});

test('image IDs stay distinct when URLs have the same ending', () => {
  const { referenceImageId } = require('../../server/services/stepImages');
  const a = 'https://example.com/images/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-tail.jpg?alt=media';
  const b = 'https://example.com/images/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-tail.jpg?alt=media';
  expect(referenceImageId(a)).not.toBe(referenceImageId(b));
  expect(referenceImageId(a)).toBe(referenceImageId(a));
});

test('steps retain their independently selected images', () => {
  const { resolveStepImage } = require('../../server/services/stepImages');
  const images = new Map([['sleeve', 'sleeve.jpg'], ['cable', 'cable.jpg']]);
  expect(resolveStepImage({ image_id: 'sleeve', image_match_reason: 'Shows fitted sleeve.' }, images)).toBe('sleeve.jpg');
  expect(resolveStepImage({ image_id: 'cable', image_match_reason: 'Shows cable holder.' }, images)).toBe('cable.jpg');
});
test('unknown and unexplained selections have no fallback image', () => {
  const { resolveStepImage } = require('../../server/services/stepImages');
  const images = new Map([['sleeve', 'sleeve.jpg']]);
  expect(resolveStepImage({ image_id: 'other', image_match_reason: 'Shows something.' }, images)).toBeNull();
  expect(resolveStepImage({ image_id: 'sleeve', image_match_reason: '   ' }, images)).toBeNull();
  expect(resolveStepImage({ image_id: '', image_match_reason: '' }, images)).toBeNull();
});
