// Repair report -> PDF -> native share sheet.
//
// expo-print renders HTML to a real PDF file; expo-sharing hands that file to
// the OS share sheet (WhatsApp, Mail, Files, AirDrop...). Both are official
// Expo SDK modules, so this works inside Expo Go — which matters, because the
// team deliberately removed expo-dev-client to stay on Expo Go.
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

// Every value below is interpolated into an HTML document, so it must be
// escaped. /api/report intentionally skips the outputSanitize middleware (it
// would corrupt the on-screen preview with &#39; entities), which makes this
// the single place responsible for escaping.
const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const listOrEmpty = (items, emptyText) =>
  items && items.length
    ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
    : `<p class="muted">${esc(emptyText)}</p>`;

// A4 with generous margins, sized to stay on one page for a typical job.
export function buildReportHtml(record) {
  const r = record?.report || {};
  const sources = record?.sources || [];

  // Group by document rather than one row per page. A real session cites the
  // same manual six or seven times, and listing the filename once per page
  // both reads badly and pushes the report onto a second page — it was 23 rows
  // for a single job before grouping.
  const grouped = new Map();
  for (const src of sources) {
    const key = src.filename || 'Unknown';
    if (!grouped.has(key)) {
      grouped.set(key, { pages: [], classification: src.classification || '—' });
    }
    if (src.page !== null && src.page !== undefined) grouped.get(key).pages.push(src.page);
  }

  const sourceRows = grouped.size
    ? [...grouped.entries()]
        .map(
          ([filename, v]) =>
            `<tr><td>${esc(filename)}</td><td class="pg">${esc(
              v.pages.length ? v.pages.sort((a, b) => a - b).join(', ') : '—'
            )}</td><td>${esc(v.classification)}</td></tr>`
        )
        .join('')
    : `<tr><td colspan="3" class="muted">No manual sources cited</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>
  @page { size: A4; margin: 13mm 13mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
         color: #1f2430; font-size: 9.5pt; line-height: 1.33; margin: 0; }
  .head { border-bottom: 2.5px solid #7c3aed; padding-bottom: 7px; margin-bottom: 11px; }
  .brand { font-size: 8.5pt; letter-spacing: .13em; text-transform: uppercase;
           color: #7c3aed; font-weight: 700; }
  h1 { font-size: 13.5pt; margin: 4px 0 6px; line-height: 1.2; }
  .meta { display: flex; flex-wrap: wrap; gap: 5px 22px; font-size: 8.5pt; color: #5b6472; }
  .meta b { color: #1f2430; font-weight: 600; }
  h2 { font-size: 9pt; letter-spacing: .1em; text-transform: uppercase; color: #7c3aed;
       margin: 10px 0 4px; border-bottom: 1px solid #e6e8ee; padding-bottom: 2px; }
  p { margin: 0 0 5px; }
  ul { margin: 0 0 5px; padding-left: 16px; }
  li { margin-bottom: 1.5px; }
  .muted { color: #8a92a0; font-style: italic; }
  .safety { background: #fff8f5; border-left: 3px solid #ea580c; padding: 6px 10px;
            border-radius: 0 5px 5px 0; }
  .safety ul { margin: 0; }
  .safety li { color: #9a3412; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  th { text-align: left; color: #5b6472; font-weight: 600; border-bottom: 1px solid #e6e8ee;
       padding: 3px 6px; }
  td { padding: 2px 6px; border-bottom: 1px solid #f2f3f7; }
  td.pg { width: 130px; color: #5b6472; }
  .foot { margin-top: 11px; padding-top: 6px; border-top: 1px solid #e6e8ee;
          font-size: 7.5pt; color: #8a92a0; }
</style></head><body>
  <div class="head">
    <div class="brand">Maintenance Copilot &middot; Repair Report</div>
    <h1>${esc(r.title || 'Maintenance Report')}</h1>
    <div class="meta">
      <span><b>Equipment:</b> ${esc(r.equipment)}</span>
      <span><b>Technician:</b> ${esc(record?.generated_by_email || record?.generated_by)}</span>
      <span><b>Role:</b> ${esc(record?.generated_by_role || '—')}</span>
      <span><b>Generated:</b> ${esc(record?.generated_at)}</span>
      <span><b>Session:</b> ${esc(record?.session_id)}</span>
    </div>
  </div>

  <h2>Problem Reported</h2>
  <p>${esc(r.problem_reported)}</p>

  <h2>Diagnosis</h2>
  <p>${esc(r.diagnosis)}</p>

  <h2>Actions Taken</h2>
  ${listOrEmpty(r.actions_taken, 'No actions recorded')}

  <h2>Parts Replaced</h2>
  ${listOrEmpty(r.parts_replaced, 'No parts recorded')}

  ${
    r.safety_notes && r.safety_notes.length
      ? `<h2>Safety Notes</h2><div class="safety"><ul>${r.safety_notes
          .map((n) => `<li>${esc(n)}</li>`)
          .join('')}</ul></div>`
      : ''
  }

  <h2>Outcome</h2>
  <p>${esc(r.outcome)}</p>

  <h2>Follow-up</h2>
  <p>${esc(r.follow_up)}</p>

  <h2>Manual Sources Cited</h2>
  <table>
    <thead><tr><th>Document</th><th>Page</th><th>Type</th></tr></thead>
    <tbody>${sourceRows}</tbody>
  </table>

  <div class="foot">
    Generated by Maintenance Copilot from ${esc(record?.exchange_count ?? 0)} logged exchange(s)
    using ${esc(record?.model || 'gpt-4o-mini')}. Summary derived from the session transcript;
    verify against the cited manual pages before acting. Stored in Firestore as
    repair_reports/${esc(record?.session_id)}.
  </div>
</body></html>`;
}

// Filenames reach WhatsApp/Mail as-is, so keep them readable but filesystem-safe.
function safeFilename(record) {
  const raw = (record?.report?.title || 'repair-report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  const date = (record?.generated_at || '').split(' ')[0] || 'report';
  return `${raw || 'repair-report'}_${date}.pdf`;
}

// printToFileAsync writes to a cache path with a random name. Renaming gives
// the share sheet a meaningful filename instead of something like
// "3f9a1c2e-....pdf", which is what the recipient actually sees in WhatsApp.
export async function createReportPdf(record) {
  const html = buildReportHtml(record);
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  try {
    const src = new File(uri);
    const target = new File(Paths.cache, safeFilename(record));
    if (target.exists) target.delete();
    src.move(target);
    return target.uri;
  } catch (e) {
    // A rename failure is cosmetic — the PDF itself is fine, so share the
    // original rather than failing the whole export over a filename.
    console.warn('[reportPdf] Could not rename PDF, sharing original:', e?.message);
    return uri;
  }
}

// Generate + hand to the OS share sheet. Returns false when sharing is
// unavailable (notably web), so the caller can fall back to the preview.
export async function shareReportPdf(record) {
  const uri = await createReportPdf(record);

  if (!(await Sharing.isAvailableAsync())) {
    return { shared: false, uri };
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Share repair report',
    UTI: 'com.adobe.pdf',
  });
  return { shared: true, uri };
}
