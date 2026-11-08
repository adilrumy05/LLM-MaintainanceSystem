// The line under a manual picture saying where it comes from. Testers said
// pictures did not match the unit in front of them, so each one now names its
// manual and page, and says the unit may differ.

const documentName = (filename) => String(filename)
  .replace(/\.pdf$/i, '')
  .replace(/[_*[\]]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// "panasonic_aircon_CS-S10TKH" -> "Panasonic Aircon CS-S10TKH", as in the
// manual picker. File names are often internal codes, so this reads better.
export function groupLabel(id) {
  if (!id) return '';
  const parts = String(id).split('_');
  const model = parts.pop();
  const rest = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  return rest ? `${rest} ${model}` : model;
}

export function imageCaption({ model, group, document, page } = {}) {
  const from = model ? `the ${documentName(model)} manual`
    : group ? `the ${groupLabel(group)} manual`
      : document ? documentName(document) : 'the manual';
  const at = page != null && page !== '' ? `, p.${page}` : '';
  return `From ${from}${at}. Your unit may look different.`;
}

// A file name is shown under a manual only when it names that manual's model.
// The catalogue's file list is sorted separately from its group list, so
// pairing them by position put another unit's file under the model.
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function filenameForGroup(id, filenames = []) {
  const model = squash(String(id || '').split('_').pop());
  if (!model) return '';
  return filenames.find(f => squash(f).includes(model)) || '';
}
