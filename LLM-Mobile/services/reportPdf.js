// Repair report -> PDF -> native share sheet.
//
// expo-print renders HTML to a real PDF file; expo-sharing hands that file to
// the OS share sheet (WhatsApp, Mail, Files, AirDrop...). Both are official
// Expo SDK modules, so this works inside Expo Go — which matters, because the
// team deliberately removed expo-dev-client to stay on Expo Go.
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Verification photos come off the camera at full sensor resolution — several
// megabytes each. Embedded raw as base64 they would push a routine report into
// tens of megabytes, which WhatsApp refuses and Mail chokes on. 820px wide at
// moderate compression is still comfortably legible at the ~85mm the grid
// prints them, and keeps a six-photo report to roughly a megabyte.
const PHOTO_WIDTH = 820;
const PHOTO_COMPRESS = 0.5;

// A hard ceiling regardless of how many steps asked for a photo. A report that
// will not send is worse than one with a note saying some photos were omitted.
const MAX_PHOTOS = 8;

// Returns a data: URI, or null when the photo cannot be read. A missing photo
// must never fail the export — the rest of the report is still worth having.
async function photoAsDataUri(uri) {
  if (!uri) return null;
  try {
    const rendered = await ImageManipulator.manipulate(uri)
      .resize({ width: PHOTO_WIDTH })
      .renderAsync();
    const out = await rendered.saveAsync({
      compress: PHOTO_COMPRESS,
      format: SaveFormat.JPEG,
      base64: true,
    });
    return out?.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
  } catch (e) {
    console.warn('[reportPdf] Could not embed photo:', e?.message);
    return null;
  }
}

// Turns the raw checklist handed over by the dashboard into something the HTML
// builder can render synchronously: photos already encoded, counts resolved.
export async function prepareEvidence(checklist) {
  const steps = Array.isArray(checklist) ? checklist : [];
  if (!steps.length) return null;

  let embedded = 0;
  let overLimit = 0;
  let failed = 0;

  const prepared = [];
  for (const st of steps) {
    let dataUri = null;
    if (st.photoUri) {
      if (embedded >= MAX_PHOTOS) {
        // Counted separately from a read failure. Telling the reader a photo
        // was dropped for size when it actually failed to load would send them
        // looking for the wrong thing.
        overLimit++;
      } else {
        dataUri = await photoAsDataUri(st.photoUri);
        if (dataUri) embedded++;
        else failed++;
      }
    }
    prepared.push({ ...st, photoDataUri: dataUri });
  }

  return {
    steps: prepared,
    completedCount: prepared.filter((st) => st.completed).length,
    photoCount: embedded,
    photosOverLimit: overLimit,
    photosFailed: failed,
  };
}

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
export function buildReportHtml(record, evidence = null) {
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
  .chk-summary { font-size: 8.5pt; color: #5b6472; margin-bottom: 4px; }
  table.chk td { vertical-align: top; }
  td.chk-no, th.chk-no { width: 20px; color: #8a92a0; }
  td.chk-st, th.chk-st { width: 86px; text-align: right; white-space: nowrap; }
  td.chk-st.done { color: #15803d; font-weight: 600; }
  td.chk-st.todo { color: #9a3412; }
  .chk-tag { display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: 3px;
             font-size: 7pt; background: #f1f0fb; color: #6d5bbd; vertical-align: 1px; }
  .chk-tag.ok { background: #eefaf0; color: #15803d; }
  .chk-tag.miss { background: #fdf1ec; color: #9a3412; }
  /* Photos run two to a row. Each figure is kept whole across a page break —
     a caption stranded from its image is worse than a short page. */
  .shots { display: flex; flex-wrap: wrap; gap: 7px; }
  .shot { width: calc(50% - 4px); margin: 0; page-break-inside: avoid;
          break-inside: avoid; }
  /* width + auto height, nothing else. The photo keeps its own proportions.
     Not cropped, because cropping an evidence photo can remove the very detail
     it was taken to record. No max-height either: capping the height letterboxes
     the landscape shots a phone actually produces, wasting most of the width on
     grey — the aspect ratio has to give somewhere, and a taller figure is the
     cheaper cost. */
  .shot img { width: 100%; height: auto; border-radius: 4px;
              border: 1px solid #e6e8ee; display: block; }
  .shot figcaption { font-size: 7.5pt; color: #5b6472; margin-top: 2px;
                     line-height: 1.25; }
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

  ${
    evidence && evidence.steps.length
      ? `<h2>Work Checklist</h2>
         <p class="chk-summary">${esc(evidence.completedCount)} of ${esc(
          evidence.steps.length
        )} steps marked complete by the technician.</p>
         <table class="chk">
           <thead><tr><th class="chk-no">#</th><th>Step</th><th class="chk-st">Status</th></tr></thead>
           <tbody>${evidence.steps
             .map(
               (st, i) =>
                 `<tr><td class="chk-no">${i + 1}</td><td>${esc(st.title)}${
                   st.timerSeconds
                     ? `<span class="chk-tag">wait ${Math.round(
                         st.timerSeconds / 60
                       )} min</span>`
                     : ''
                 }${
                   st.photoRequired
                     ? `<span class="chk-tag ${st.photoDataUri ? 'ok' : 'miss'}">${
                         st.photoDataUri ? 'photo on file' : 'photo missing'
                       }</span>`
                     : ''
                 }</td><td class="chk-st ${st.completed ? 'done' : 'todo'}">${
                   st.completed ? 'Complete' : 'Not completed'
                 }</td></tr>`
             )
             .join('')}</tbody>
         </table>`
      : ''
  }

  ${
    evidence && evidence.photoCount
      ? `<h2>Photo Evidence</h2>
         <div class="shots">${evidence.steps
           .filter((st) => st.photoDataUri)
           .map(
             (st, i) =>
               `<figure class="shot"><img src="${st.photoDataUri}" alt="" />
                <figcaption>${esc(st.title)}</figcaption></figure>`
           )
           .join('')}</div>
         ${
           evidence.photosOverLimit
             ? `<p class="muted">${esc(
                 evidence.photosOverLimit
               )} further photo(s) were captured but left out, to keep the file small enough to send.</p>`
             : ''
         }
         ${
           evidence.photosFailed
             ? `<p class="muted">${esc(
                 evidence.photosFailed
               )} photo(s) could not be read from the device and are missing from this report.</p>`
             : ''
         }
         <p class="muted">Photos are a record of what the technician saw. They do not confirm the work was performed correctly.</p>`
      : ''
  }

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
export async function createReportPdf(record, checklist = null) {
  const evidence = await prepareEvidence(checklist);
  const html = buildReportHtml(record, evidence);
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
export async function shareReportPdf(record, checklist = null) {
  const uri = await createReportPdf(record, checklist);

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
