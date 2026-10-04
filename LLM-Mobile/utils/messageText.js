// Turns an answer's Markdown into text that reads correctly when pasted into a
// message, report or note - no asterisks, hashes or table pipes - and keeps the
// manual citations, since an answer copied without its sources loses the thing
// that makes it trustworthy.

export const MAX_QUOTE_CHARS = 500;

export function toPlainText(markdown) {
  if (typeof markdown !== 'string') return '';
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?/g, ''))
    .replace(/^\s*#{1,6}\s+/gm, '')                 // headings
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')       // images -> alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')        // links -> label
    .replace(/(\*\*|__)(.*?)\1/g, '$2')             // bold
    .replace(/(^|[^*\w])[*_]([^*_\n]+)[*_](?=[^*\w]|$)/g, '$1$2') // italic
    .replace(/`([^`]+)`/g, '$1')                    // inline code
    .replace(/^\s*[-*+]\s+/gm, '• ')                // bullets
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, '') // table rules
    .replace(/^\s*\|(.*)\|\s*$/gm, (_, row) => row.split('|').map((c) => c.trim()).join('  '))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return '';
  const lines = [...new Set(sources.map((s) => {
    const name = s?.filename || s?.document_group_id || 'manual';
    return s?.page ? `${name}, p.${s.page}` : name;
  }))];
  return `Sources:\n${lines.map((l) => `- ${l}`).join('\n')}`;
}

/** Text placed on the clipboard for "Copy answer". */
export function answerForClipboard(message) {
  const body = toPlainText(message?.text || '');
  const sources = formatSources(message?.sources);
  return sources ? `${body}\n\n${sources}` : body;
}

/** Normalise a selected passage for quoting: collapse whitespace, cap length. */
export function toQuote(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_QUOTE_CHARS) return clean;
  return `${clean.slice(0, MAX_QUOTE_CHARS - 1).trimEnd()}…`;
}
