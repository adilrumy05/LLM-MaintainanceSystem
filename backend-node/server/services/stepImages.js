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

// Pages the answer cites as [[p:NNN]].
function citedPages(answer) {
  return new Set([...String(answer || '').matchAll(/\[\[\s*p:\s*(\d+)\s*\]\]/gi)].map(m => m[1]));
}

// Keep only pictures from the manual(s) the answer was written from. Without a
// confirmed model, retrieval can return several units' manuals, and testers
// were shown a diagram of a different unit beside the steps for theirs. The
// manuals are the ones holding a cited page; an answer with no citations is
// taken to come from the top-ranked block's manual.
function scopeImagesToAnswer(images, answer, blocks = []) {
  const pages = citedPages(answer);
  const manuals = new Set(blocks.filter(b => pages.has(String(b.page))).map(b => b.filename));
  if (!manuals.size && blocks[0]) manuals.add(blocks[0].filename);
  return images.filter(img => manuals.has(img.filename));
}

module.exports = { buildStepImageContent, referenceImageId, resolveStepImage, citedPages, scopeImagesToAnswer };
