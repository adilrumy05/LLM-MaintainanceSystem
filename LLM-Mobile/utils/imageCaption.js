// The line under a manual picture saying where it comes from. Testers said
// pictures did not match the unit in front of them, so each one now names its
// manual and page, and says the unit may differ.

const documentName = (filename) => String(filename)
  .replace(/\.pdf$/i, '')
  .replace(/[_*[\]]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export function imageCaption({ document, page, model } = {}) {
  const from = model ? `the ${documentName(model)} manual` : document ? documentName(document) : 'the manual';
  const at = page != null && page !== '' ? `, p.${page}` : '';
  return `From ${from}${at}. Your unit may look different.`;
}
