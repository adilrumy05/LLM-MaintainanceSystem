const { createHash } = require('crypto');

function referenceImageId(url) {
  return `reference-${createHash('sha256').update(url).digest('hex')}`;
}

// Show the extractor actual manual figures, with labels that map to response IDs.
// Bound image count and page text to keep large retrievals manageable.
const MAX_IMAGES = 12;
function buildStepImageContent(answer, images, blocks = []) {
  const selected = images.slice(0, MAX_IMAGES);
  if (!selected.length) return answer;
  const content = [{ type: 'text', text: answer }];
  for (const image of selected) {
    const context = blocks.filter(block =>
      String(block.page) === String(image.page) &&
      block.document_group_id === image.documentGroupId
    ).map(block => block.text || '').join('\n').slice(0, 2000);
    content.push({ type: 'text', text: JSON.stringify({
      image_id: image.id, page: image.page, caption: image.caption,
      page_context: context,
    }) });
    content.push({ type: 'image_url', image_url: { url: image.url, detail: 'auto' } });
  }
  return content;
}
function resolveStepImage(step, imageUrlById) {
  const reason = typeof step.image_match_reason === 'string' ? step.image_match_reason.trim() : '';
  return step.image_id && reason && imageUrlById.has(step.image_id)
    ? imageUrlById.get(step.image_id) : null;
}

module.exports = { buildStepImageContent, referenceImageId, resolveStepImage };
