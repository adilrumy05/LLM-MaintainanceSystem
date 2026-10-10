// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { logAuditRecord, logTimerEvent } = require('./server/services/auditLogger');
const firebaseAdmin = require('./server/config/firebaseAdmin');
const { runPriorityAdjustmentAgent } = require('./server/agents/priorityAdjustmentAgent');
const { generateRepairReport } = require('./server/services/reportGenerator');
const requireAdmin = require('./server/middleware/requireAdmin');
// Lazy: firebase-admin/auth depends on ESM-only `jose`, which Jest cannot parse
// from node_modules. Only the delete-user route needs it.
const getAuthLazy = () => require('firebase-admin/auth').getAuth();
const fs = require('fs');
const path = require('path');
const sanitize = require('./server/middleware/sanitize');
const validate = require('./server/middleware/validate');
const outputSanitize = require('./server/middleware/outputSanitize');
const { resolveVisualIntake } = require('./server/services/visionIntake');
const { generateSpokenAnswer } = require('./server/services/spokenAnswer');

dotenv.config();

process.on('unhandledRejection', (reason) => {
  console.error('💥 UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION:', err);
});

const app = express();
app.use(cors());

// Photo-and-ask posts a base64 image, which is 300kB-2MB - far past express's
// 100kB default. This parser is mounted BEFORE the global one and scoped to the
// single route that needs it: express runs middleware in order, so this claims
// /api/query, and the global parser below then sees req.body already populated
// and skips. Mounting a larger limit after the global parser would never run,
// and raising the global limit would open 12MB on every route including the
// unauthenticated ones.
app.use('/api/query', express.json({ limit: '12mb' }));
app.use(express.json());
const transcribeRouter = require('./server/routes/transcribe');
app.use('/api', transcribeRouter);
const RETRIEVAL_SERVICE_URL = process.env.RETRIEVAL_SERVICE_URL || 'http://localhost:8001';
const PROMPT_FILE_PATH = path.join(__dirname, 'latest_prompt.txt');

// Iterative retrieval: how many total retrieval rounds one question may use.
// 1 = old single-shot behavior. 2 lets the model ask ONE follow-up search
// when the first pass is insufficient (e.g. it needs to trace a component
// mentioned in the retrieved schematic but not yet retrieved itself). Each
// extra round costs one more /retrieve call plus one more Call-1 LLM call, so
// this is intentionally small and hard-capped rather than open-ended.
const MAX_RETRIEVAL_ROUNDS = parseInt(process.env.MAX_RETRIEVAL_ROUNDS || '2', 10);
const ANSWER_MODEL = process.env.ANSWER_MODEL || 'gpt-6-luna';
const DEFAULT_TOP_K = parseInt(process.env.RETRIEVAL_TOP_K || '10', 10);

const ROLE_SYSTEM_PROMPTS = {
  beginner: `You are a Guidance Helper for a junior maintenance technician.
Use plain, everyday language. Never use jargon without explaining it.
Always prioritise safety: flag any step requiring LOTO or PPE with a clear WARNING.
Structure every response as a numbered step-by-step list.
End with: "If you are unsure about any step, stop and contact a senior technician."
Base all guidance strictly on the retrieved manual content provided.`,

  intermediate: `You are a Task Assistance Helper for an intermediate maintenance technician.
Provide the relevant procedure from the manual context.
Flag steps rated HIGH difficulty or requiring specialist tools with a CAUTION note.
List all required tools and torque specifications when present in the source material.
If the task falls outside standard procedures, state: "Escalate to Expert Technician."
Base all guidance strictly on the retrieved manual content provided.`,

  expert: `You are a Technical Decision Support Helper for an expert maintenance technician.
Provide in-depth technical detail: tolerances, specifications, failure modes, root cause indicators.
Reference relevant standards and compliance requirements in the source documents.
Structure responses as: Summary, Technical Detail, Specifications, Risk Considerations.
Assume full technical competency — do not simplify.
Base all analysis strictly on the retrieved manual content provided.`,

  admin: `You are an Approval and Oversight Helper for a maintenance system administrator.
Summarise the procedure's risk level, compliance flags, and audit-relevant considerations.
Highlight steps requiring documented sign-off or falling under regulatory requirements.
Note whether the procedure matches approved SOPs in the source material.
Do not approve or reject autonomously — present findings for human review only.
Base all analysis strictly on the retrieved manual content provided.`,
};

// Appended to every role prompt. The model decides what is a real wait, not a
// regex on the response: "wait 3 minutes before restarting" and "the unit has
// a 3-minute restart delay" contain the same tokens, and only the model has
// the context to tell an instruction from a specification. A scan of the
// corpus found ~12 unique wait/duration phrasings, of which only about a third
// were actual instructions — the rest were spec tables and descriptions of
// built-in compressor delays.
const TIMER_INSTRUCTION = `

PROCEDURE TIMERS:
RULE: if your answer tells the technician to wait a specific length of time before continuing, you MUST put a marker on the line immediately after that step:
[[TIMER:<seconds>|<short label>]]

This is not optional. Any sentence of the form "wait N minutes", "wait for N seconds", "leave it for N minutes", "allow N minutes before ..." gets a marker.
  "Wait for 3 minutes before restarting the compressor."  ->  [[TIMER:180|Compressor restart wait]]
  "You must wait 3 minutes before the unit restarts."     ->  [[TIMER:180|Restart wait]]
  "Leave the vacuum pump running for 30 minutes."         ->  [[TIMER:1800|Evacuation]]

Do NOT emit a marker when you are only describing equipment behaviour rather than instructing a wait:
  "The compressor will not turn on for 3 minutes after operation stops."   (describes the unit, no marker)
  "Time Delay Safety Control: 2min"                                        (specification table, no marker)
  "Cooling Operation Delay: 3 minutes (minimum)"                           (rating, no marker)

Test to apply: is the technician being told to stop and wait right now? Marker. Are you describing how the equipment behaves, or quoting a spec? No marker.
If a range is given, use the LONGER value and say so in the label ("Pressure hold, 10 min max").
Use whole seconds. Never more than 3 markers in one response.`;

const DEFAULT_SYSTEM_PROMPT = `You are a maintenance assistant. Give a clear, safe, step-by-step response to technical inspection and maintenance tasks. Base all guidance strictly on the retrieved manual content provided.`;

// Timer markers must never reach a step card. A marker copied into a title or
// description renders as literal "[[TIMER:180|...]]", where the client's marker
// sweep does not reach — that one only cleans the narrative text.
//
// The step extractor (Call 2 below) now READS the markers, because they are
// what tells it which step owns the wait, so this is applied to its OUTPUT
// fields instead of its input. The instruction not to copy them is the first
// line of defence; this is the one that actually holds.
const stripTimerMarkers = (str) =>
  typeof str === 'string' ? str.replace(/[ \t]*\[\[\s*TIMER\b[^\]]{0,80}\]\][ \t]*\n?/gi, '') : str;

function extractDateFromQuery(query) {
  // Match YYYY-MM-DD
  let match = query.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (match) return match[1];

  // Match DD/MM/YYYY or D/M/YYYY
  match = query.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  return null;
}

// ── Retrieval: one round ───────────────────────────────────────────────────
// Extracted so the iterative loop below can call it more than once with a
// different `question` each time, without duplicating the fetch/error
// handling. Returns null on any transport/HTTP failure — same contract the
// inline version had, so the existing "retrieval_unavailable" handling below
// still works unchanged.
async function fetchRetrievalRound(question, filters) {
  const response = await fetch(`${RETRIEVAL_SERVICE_URL}/retrieve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, ...filters }),
  }).catch((err) => {
    console.error('Retrieval service unreachable:', err.message);
    return null;
  });

  if (!response || !response.ok) {
    if (response) {
      const errText = await response.text().catch(() => '');
      console.error('Retrieval service error:', response.status, errText);
    }
    return null;
  }

  return response.json();
}

// ── Merge context_blocks / sources across retrieval rounds ────────────────
// context_blocks are deduped by chunk_id (now returned by retrieval_service.py
// specifically so this loop can do this). sources are deduped by
// (document_group_id, filename, page), with their `images[]` unioned by url —
// round 2 can surface a source round 1 already had, just with an image round
// 1's context didn't happen to include.
function mergeRetrievalRounds(rounds) {
  const blocksById = new Map();
  const sourcesByKey = new Map();

  for (const round of rounds) {
    for (const b of round.context_blocks || []) {
      if (!blocksById.has(b.chunk_id)) blocksById.set(b.chunk_id, b);
    }
    for (const src of round.sources || []) {
      const key = `${src.document_group_id}|${src.filename}|${src.page}`;
      const existing = sourcesByKey.get(key);
      if (!existing) {
        sourcesByKey.set(key, { ...src, images: [...(src.images || [])] });
      } else {
        const seenUrls = new Set(existing.images.map((i) => i.url));
        for (const img of src.images || []) {
          if (img.url && !seenUrls.has(img.url)) {
            existing.images.push(img);
            seenUrls.add(img.url);
          }
        }
      }
    }
  }

  return {
    context_blocks: [...blocksById.values()],
    sources: [...sourcesByKey.values()],
  };
}

// Prompt built from the MERGED block list (retrieval_service.py's own
// build_prompt() only ever sees one round at a time, so a second round's
// blocks need folding in here rather than re-fetched from Python).
function buildMergedPrompt(contextBlocks, question) {
  const contextStr = contextBlocks.length
    ? contextBlocks
        .map((b, i) => {
          const header = `[${i + 1}] [${b.chunk_type}] page ${b.page} — ${b.document_group_id} / ${b.filename}`;
          const scoreStr = b.score > 0 ? `score: ${b.score.toFixed(3)}` : '(context parent)';
          return `${header}\n${scoreStr}\n${b.text}\n---`;
        })
        .join('\n\n')
    : '(no context retrieved)';

  return (
    `You are a helpful technical assistant. Answer the question using ONLY the context provided below. ` +
    `If the context does not contain enough information, say so. Cite page numbers where relevant.\n\n` +
    `=== CONTEXT ===\n${contextStr}\n` +
    `=== QUESTION ===\n${question}\n\n=== ANSWER ===`
  );
}

// ── Call 1: answer, or ask for one more targeted search ────────────────────
// Structured output instead of a 3rd LLM call for the sufficiency check —
// the model decides in the SAME call whether it can answer, reusing the
// step-extraction pattern already proven below (Call 2). `forceAnswer` is set
// on the last allowed round: the model must answer with what it has rather
// than requesting a round MAX_RETRIEVAL_ROUNDS + 1 that will never happen.
async function callAnswerModel({ apiKey, systemPrompt, prompt, photos, imageBase64, visualModel, visualReading, forceAnswer }) {
  const visionRules = imageBase64
    ? `

The user attached ${photos.length > 1 ? `${photos.length} photographs of one job` : 'a photograph'}. It has already been read as: ${JSON.stringify({
        model: visualModel,
        faultCode: visualReading?.faultCode || null,
        observation: visualReading?.observation || null,
      })}.
Answer using ONLY the manual extracts above, and cite pages exactly as normal.
Refer to what is visible in the photo where it helps, but never state a
specification, torque figure, tolerance or procedure that is not in the extracts.`
    : '';

  const sufficiencyRules = forceAnswer
    ? `

You MUST answer now using everything provided above — this is the last retrieval round available, so set "sufficient" to true and put your complete answer in "answer" regardless of any remaining gaps. If something is genuinely missing, say so within the answer itself rather than requesting another search.`
    : `

Before answering, judge whether the context above is actually enough to fully and safely answer the question. If it is NOT — for example the extracts reference a component, fault code, or section by name but do not describe it — set "sufficient" to false, leave "answer" as an empty string, and set "follow_up_query" to a short, specific search query for exactly that missing piece (not a restatement of the original question). If the context IS enough, set "sufficient" to true, "follow_up_query" to an empty string, and put your complete, safe, well-cited answer in "answer".`;

  const fullSystemPrompt = systemPrompt + visionRules + sufficiencyRules;

  const userContent = imageBase64
    ? [
        { type: 'text', text: prompt },
        ...photos.map((b64) => ({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'auto' },
        })),
      ]
    : prompt;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ANSWER_MODEL,
      messages: [
        { role: 'system', content: fullSystemPrompt },
        { role: 'user', content: userContent },
      ],
      reasoning:{"effort": "high"},
      max_completion_tokens: 8192,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'answer_or_followup',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              sufficient: { type: 'boolean' },
              answer: { type: 'string' },
              follow_up_query: { type: 'string' },
            },
            required: ['sufficient', 'answer', 'follow_up_query'],
            additionalProperties: false,
          },
        },
      },
    }),
  }).catch((err) => {
    console.error('OpenAI unreachable:', err.message);
    return null;
  });

  return response;
}

app.post('/api/query', sanitize, validate, outputSanitize, async (req, res) => {
  try {
    const {
      query,
      role,
      userId,
      userEmail,
      sessionId,
      docGroup,
      classification,
      category1,
      category2,
      topK = DEFAULT_TOP_K,
      imageBase64: singleImage,
      images,
      confirmedModel,
      voice,
    } = req.body;

    // One photo or several. Everything below works on the list; `imageBase64`
    // stays truthy whenever at least one photo was attached.
    const photos = Array.isArray(images) && images.length ? images : singleImage ? [singleImage] : [];
    const imageBase64 = photos.length > 0;

    console.log('📥 Query received:', query);

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    // ── Use OpenAI API key ────────────────────────────────────────────────────
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Missing OPENAI_API_KEY in environment variables.',
        code: 'server_misconfigured',
      });
    }

    // ── Get filters from retrieval service ────────────────────────────────────
    const known = await getKnownFilters();

    const {
      matchedGroup,
      matchedFile,
      matchedClassification,
      matchedCategory1,
      matchedCategory2,
      matchedModel
    } = extractFilters(
      query,
      known.document_group_ids || [],
      known.filenames || [],
      known.classifications || [],
      known.category_level_1 || [],
      known.category_level_2 || [],
      known.model_numbers || []
    );

    // Auto-detect date from query
    const matchedDate = extractDateFromQuery(query);

    // A model the technician already confirmed in this chat (from a nameplate
    // photo or the model picker) scopes typed follow-ups too. It is only trusted
    // if it exactly names a model in the catalogue, and a model typed in the
    // question itself still wins - the technician may have moved on.
    const trustedConfirmedModel =
      confirmedModel && (known.model_numbers || []).includes(confirmedModel) ? confirmedModel : null;

    // ── Photo intake ──────────────────────────────────────────────────────────
    // When a photo is attached we read it FIRST and only continue once we know
    // which machine we are looking at.
    //
    // Response contract (docs/API_REFERENCE.md):
    //  - EXPECTED outcomes that need the technician (retake, confirm the model,
    //    no manual, conflict) return 200 with `needsInput`, so the app renders a
    //    normal reply and keeps the photo.
    //  - SERVICE FAILURES (catalogue or vision unavailable) are not outcomes. They
    //    return 503 with `error`, `code` and `retryable`, like any other outage.
    let visualReading   = null;
    let visualModel     = null;
    let retrievalQuery  = query;

    if (imageBase64) {
      console.log(`[VISION] ${photos.length} photo(s) attached`);
      const intake = await resolveVisualIntake({
        images: photos,
        query,
        docGroup: docGroup || null,
        confirmedModel: confirmedModel || null,
        known,
        knownOk: known.ok !== false,
        apiKey,
      });

      if (intake.action === 'error') {
        console.error(`[VISION] service failure: ${intake.reason}`);
        return serviceFailure(res, 503, intake.reason, intake.message, true);
      }

      if (intake.action !== 'proceed') {
        console.log(`[VISION] stopped: ${intake.action} (${intake.reason || 'n/a'})`);
        return res.status(200).json({
          text: intake.message,
          sources: [],
          needsInput: intake.action,      // ask_photo | ask_model | no_manual | conflict
          candidates: intake.candidates || [],
          readModel: intake.readModel || intake.model || null,
          imageAttached: true,
        });
      }

      visualReading  = intake.reading;
      visualModel    = intake.model;
      // The photo's findings go into the text we EMBED AND SEARCH WITH, not
      // just the answer prompt. Without this, "what does this mean?" retrieves
      // vaguely from the right manual instead of the page about this fault.
      retrievalQuery = intake.retrievalQuery;
      console.log(`[VISION] model=${visualModel} fault=${visualReading?.faultCode || '-'}`);
    }

    // ── Steps 1+2: iterative retrieve -> answer loop ───────────────────────────
    // Round 1 uses the photo/query-derived retrievalQuery exactly as before.
    // If Call 1 reports the context was insufficient, round 2 retrieves again
    // with the model's own follow_up_query and both rounds' context are
    // merged for the final (forced) answer. Capped at MAX_RETRIEVAL_ROUNDS so
    // a question can never loop indefinitely.
    const retrievalFilters = {
      document_group_id: matchedGroup || docGroup || null,
      filename: matchedFile || null,
      classification: matchedClassification || classification || null,
      category_level_1: matchedCategory1 || category1 || null,
      category_level_2: matchedCategory2 || category2 || null,
      // A model read off the nameplate is stronger evidence than a substring
      // match against the typed text, so it wins.
      model_number: visualModel || matchedModel || (imageBase64 ? null : trustedConfirmedModel) || null,
      date_added: matchedDate || null,
      top_k: topK,
    };

    console.log(`Calling retrieval service for: "${query}"`);
    const round1 = await fetchRetrievalRound(retrievalQuery, retrievalFilters);

    if (!round1) {
      // The raw upstream body stays in the server log. The app shows `error`
      // verbatim, and a Python traceback is not something a technician can act on.
      return serviceFailure(res, 503, 'retrieval_unavailable',
        'Retrieval service unavailable. Try again in a moment. If it keeps failing, check that the retrieval service is running.',
        Boolean(imageBase64));
    }

    console.log(`Retrieved ${round1.context_blocks.length} context blocks (round 1)`);

    // Stop rather than answer from the image alone.
    //
    // Qdrant ANDs its filters (vector_store.py builds Filter(must=conditions)),
    // so a model filter that disagrees with the selected document group returns
    // nothing at all. Answering anyway would mean the LLM inventing maintenance
    // guidance with no manual behind it - ungrounded and uncitable, which is the
    // one thing this system exists to avoid. Checked after round 1 only: if a
    // photo-scoped question already found nothing, a follow-up round under the
    // same model scope is essentially certain to find nothing either.
    const modelScopedByConfirmation = !imageBase64 && !matchedModel && Boolean(trustedConfirmedModel);
    if ((imageBase64 || modelScopedByConfirmation) && (round1.context_blocks?.length || 0) === 0) {
      const scopedModel = visualModel || (modelScopedByConfirmation ? trustedConfirmedModel : null);
      console.log('[VISION] no context retrieved — refusing to answer unsupported');
      return res.status(200).json({
        text: scopedModel
          ? `I found nothing in the ${scopedModel} manual for this question. Try rephrasing, or check this is the right machine.`
          : 'I could not find anything in the manuals for this. Try rephrasing, or photograph the nameplate.',
        sources: [],
        needsInput: 'no_context',
        readModel: scopedModel || null,
        ...(imageBase64 ? { imageAttached: true } : {}),
      });
    }

    const systemPrompt = (ROLE_SYSTEM_PROMPTS[role] || DEFAULT_SYSTEM_PROMPT) + TIMER_INSTRUCTION;

    let rounds = [round1];
    let merged = mergeRetrievalRounds(rounds);
    let text = '';
    let round = 1;

    while (true) {
      const forceAnswer = round >= MAX_RETRIEVAL_ROUNDS;
      const prompt = buildMergedPrompt(merged.context_blocks, retrievalQuery);

      // Save latest prompt to file (kept from before — last round's prompt wins).
      fs.writeFile(PROMPT_FILE_PATH, prompt, 'utf8', (err) => {
        if (err) console.error('Failed to write latest prompt file:', err);
        else     console.log(`Latest prompt saved to ${PROMPT_FILE_PATH}`);
      });

      const openaiResponse = await callAnswerModel({
        apiKey,
        systemPrompt,
        prompt,
        // Photos ride along on round 1 only — the model has already
        // incorporated what it saw into its first attempt; re-sending the
        // same image on a follow-up round doubles image token cost for no
        // new information.
        photos: round === 1 ? photos : [],
        imageBase64: round === 1 && imageBase64,
        visualModel,
        visualReading,
        forceAnswer,
      });

      if (!openaiResponse) {
        return serviceFailure(res, 503, 'answer_unavailable',
          'Could not reach the answer service. Try again in a moment.', Boolean(imageBase64));
      }

      const data = await openaiResponse.json().catch(() => null);
      console.log(`OpenAI status (round ${round}):`, openaiResponse.status);

      if (!openaiResponse.ok) {
        console.error('OpenAI error:', JSON.stringify(data, null, 2));
        // Never pass the provider's status through: a 401 from OpenAI means OUR
        // key is wrong, not the technician's session, and a 429 is our quota.
        // 502 says an upstream service failed.
        return serviceFailure(res, 502, 'answer_unavailable',
          'The answer service failed. Try again in a moment.', Boolean(imageBase64));
      }

      let parsed;
      try {
        parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
      } catch (e) {
        parsed = { sufficient: true, answer: data?.choices?.[0]?.message?.content || 'No response text returned.', follow_up_query: '' };
      }

      if (parsed.sufficient || forceAnswer) {
        text = parsed.answer || 'No response text returned.';
        break;
      }

      // Insufficient, and rounds remain: retrieve again with the model's own
      // follow-up query, merge, and loop.
      round += 1;
      const followUp = (parsed.follow_up_query || '').trim() || retrievalQuery;
      console.log(`[RETRIEVAL LOOP] round 1 insufficient, searching again: "${followUp}"`);
      const nextRound = await fetchRetrievalRound(followUp, retrievalFilters);
      if (nextRound) {
        rounds.push(nextRound);
        merged = mergeRetrievalRounds(rounds);
        console.log(`Retrieved ${nextRound.context_blocks.length} context blocks (round ${round}, ${merged.context_blocks.length} total after merge)`);
      } else {
        // Follow-up retrieval failed — don't fail the whole request over it,
        // just force an answer from what round 1 already found.
        console.warn('[RETRIEVAL LOOP] follow-up retrieval failed, forcing an answer from round 1 context only');
      }
    }

    const retrievalData = { context_blocks: merged.context_blocks, sources: merged.sources };

    // ── Call 2: cheap structured extraction FROM the finished answer ─────────
    // Given the list of reference images available across every retrieval
    // round, so a step that matches one can carry it through to the app.
    // Also decides which steps should ask the technician for a verification photo.
    let isProcedural = false;
    let steps = [];

    // Debug: what retrieval actually returned.
    console.log('\n========== RETRIEVED CONTEXT BLOCKS ==========');
    console.log(`Total blocks: ${merged.context_blocks.length}`);
    merged.context_blocks.forEach((b, index) => {
      console.log(`\nBlock ${index + 1}:`);
      console.log('  chunk_type:', b.chunk_type);
      console.log('  chunk_id:', b.chunk_id);
      console.log('  page:', b.page);
      console.log('  image_url:', b.image_url || 'NONE');
      console.log('  text:', (b.text || '').slice(0, 200));
    });
    console.log('==============================================\n');

    // ── Build available reference images ─────────────────────────────────────
    // Images can come from two places:
    //   1. context_blocks[].image_url      (image chunks returned by retrieval)
    //   2. sources[].images[].url          (images the retrieval service attaches
    //                                       to a source from Firebase Storage,
    //                                       even when no image chunk was returned)
    // Both are collected here, deduped by URL.
    const availableImages = [];

    // 1. Images directly returned as image context blocks.
    for (const b of merged.context_blocks || []) {
      if (b.chunk_type === 'image' && b.image_url) {
        availableImages.push({
          id: b.chunk_id,
          page: b.page,
          caption: (b.text || '').slice(0, 150),
          url: b.image_url,
          source: 'context_block',
        });
      }
    }

    // 2. Images attached to retrieved sources.
    for (const src of merged.sources || []) {
      for (const img of src.images || []) {
        if (!img?.url) continue;

        // Stable internal id for the source image.
        const imageId =
          `source-image-${src.document_group_id || 'doc'}-` +
          `${src.page || 'page'}-` +
          Buffer.from(img.url)
            .toString('base64')
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(-40);

        const alreadyExists = availableImages.some((existing) => existing.url === img.url);

        if (!alreadyExists) {
          availableImages.push({
            id: imageId,
            page: src.page,
            caption: img.caption || img.description || `Reference image from page ${src.page}`,
            url: img.url,
            source: 'source_metadata',
          });
        }
      }
    }

    console.log('\n========== AVAILABLE REFERENCE IMAGES ==========');
    console.log(`Found ${availableImages.length} image(s)`);
    availableImages.forEach((img, index) => {
      console.log(`Image ${index + 1}:`);
      console.log('  ID:', img.id);
      console.log('  Page:', img.page);
      console.log('  Source:', img.source);
      console.log('  URL:', img.url);
      console.log('  Caption:', img.caption);
    });
    console.log('===============================================\n');

    try {
      // The model only ever sees id / page / caption — never the URL.
      const stepUserContent = availableImages.length
        ? `${text}\n\n=== AVAILABLE REFERENCE IMAGES ===\n${JSON.stringify(
            availableImages.map((img) => ({ id: img.id, page: img.page, caption: img.caption }))
          )}`
        : text;

      const stepResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ANSWER_MODEL,
          messages: [
            {
              role: 'system',
              content: `You extract structured step breakdowns from maintenance answers. Given the answer text below, determine if it describes a procedure, troubleshooting flow, checklist, or multi-step task. If so, break it into atomic steps without changing the meaning or adding new information. If it is not procedural, return an empty steps array.

If a list of AVAILABLE REFERENCE IMAGES is provided (each with an id, page, and short caption), set a step's image_id to the id of the one image that clearly illustrates that specific step. For example:
- A wiring step should match a wiring schematic or wiring diagram.
- An installation step should match an installation diagram.
- A verification/checking step should match an image that allows the technician to visually verify the required condition.
Only set image_id when the image genuinely relates to that specific step. If no image clearly applies, use an empty string. Never invent an image_id that is not present in AVAILABLE REFERENCE IMAGES. Do not put image URLs directly into image_id.

TECHNICIAN VERIFICATION PHOTOS (photo_required / photo_instruction):
These fields are SEPARATE from image_id. image_id is a reference image from the manual. photo_required asks the technician to take their OWN photo as a record of the result.

Be CONSERVATIVE. Set photo_required to true ONLY when the step produces a visible result or condition that a photo can usefully record, for example:
- a surface, floor, filter, drain or work area has been cleaned or cleared
- a part has been installed, seated, connected or fitted and its final position is visible
- a visible condition has been restored or corrected (cover refitted, guard in place, wiring tidy and secured)
- a visible fault, damage, leak or wear is being checked and should be documented

Set photo_required to false for everything else, including:
- switching off, isolating or locking out power (LOTO)
- gathering tools, PPE or materials
- waiting, timing or cooling-down steps
- reading a gauge, measuring a value or entering a setting
- steps whose outcome is not visible
- general reminders, safety notes or "contact a technician" steps

Most procedures should have only a few photo steps, and many should have none. Never set photo_required to true on most or all steps. When unsure, use false.

When photo_required is true, photo_instruction must be one short sentence saying exactly what the photo should show (for example "Take a photo showing the cleaned filter before it is refitted."). When photo_required is false, photo_instruction must be an empty string.

Do not invent new steps for photos and do not change a step's meaning because of them.

PROCEDURE TIMERS (timer_seconds / timer_label):
The answer text may contain markers of the form [[TIMER:<seconds>|<label>]]. Each marker belongs to the step it FOLLOWS — it is the mandated wait the technician must observe before moving on from that step.

For the step a marker follows, set timer_seconds to the number in the marker and timer_label to its label. For every other step, set timer_seconds to 0 and timer_label to an empty string.

NEVER copy the marker text, the brackets, or the word TIMER into title or description. The marker is metadata, not prose. The step's own wording should already describe the wait, and must be left as it is.

If a marker sits between two steps, it belongs to the EARLIER one — the wait happens after completing that step. If no marker is present, every step gets timer_seconds 0.`,
            },
            // Markers are deliberately LEFT IN here: the extractor needs them to
            // know which step owns the wait. They are stripped from the step
            // fields afterwards, below, so a model that ignores the instruction
            // above still cannot leak marker syntax into the UI.
            { role: 'user', content: stepUserContent },
          ],
          reasoning: {"effort": "medium"},
          // Raised from 1500: each step now carries two extra fields, and a
          // truncated response would break JSON.parse.
          max_completion_tokens: 6144,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'step_extraction',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  is_procedural: { type: 'boolean' },
                  steps: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        description: { type: 'string' },
                        warning_level: { type: 'string', enum: ['none', 'caution', 'critical'] },
                        tools_required: { type: 'array', items: { type: 'string' } },
                        image_id: { type: 'string' },
                        photo_required: { type: 'boolean' },
                        photo_instruction: { type: 'string' },
                        // 0 means "no wait on this step". A nullable union would
                        // work too, but strict mode is fussier about those than
                        // it is about a sentinel.
                        timer_seconds: { type: 'integer' },
                        timer_label: { type: 'string' },
                      },
                      required: [
                        'title',
                        'description',
                        'warning_level',
                        'tools_required',
                        'image_id',
                        'photo_required',
                        'photo_instruction',
                        'timer_seconds',
                        'timer_label',
                      ],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['is_procedural', 'steps'],
                additionalProperties: false,
              },
            },
          },
        }),
      });

      const stepData = await stepResponse.json();
      const parsed = JSON.parse(stepData?.choices?.[0]?.message?.content || '{}');
      isProcedural = !!parsed.is_procedural;

      // Translate the internal image_id to a direct URL here — the client
      // never needs to know chunk ids exist.
      const imageUrlById = new Map(availableImages.map((img) => [img.id, img.url]));

      steps = Array.isArray(parsed.steps)
        ? parsed.steps.map((st) => {
            const imageUrl = st.image_id && imageUrlById.has(st.image_id)
              ? imageUrlById.get(st.image_id)
              : null;

            // Normalise the verification-photo fields so the mobile app
            // always receives a boolean and a string.
            const photoRequired = st.photo_required === true;
            let photoInstruction =
              typeof st.photo_instruction === 'string' ? st.photo_instruction.trim() : '';

            if (!photoRequired) {
              photoInstruction = '';
            } else if (!photoInstruction) {
              photoInstruction = 'Take a photo showing the completed result of this step.';
            }

            // Same bounds the client applies to free-text markers: anything
            // outside 5s..2h is a model slip, not a real procedure wait.
            const rawSeconds = Number(st.timer_seconds);
            const timerSeconds =
              Number.isFinite(rawSeconds) && rawSeconds >= 5 && rawSeconds <= 7200
                ? Math.round(rawSeconds)
                : 0;
            const timerLabel = timerSeconds
              ? (typeof st.timer_label === 'string' && st.timer_label.trim()
                  ? st.timer_label.trim().slice(0, 60)
                  : 'Procedure wait')
              : '';

            return {
              // Stripped defensively. The extractor is told not to copy marker
              // text into these fields, but it sees the markers now, so this is
              // the guarantee rather than the instruction.
              title: stripTimerMarkers(st.title),
              description: stripTimerMarkers(st.description),
              warning_level: st.warning_level,
              tools_required: st.tools_required,
              // Manual/reference image: the app only receives the actual URL.
              image_url: imageUrl,
              // Technician's own verification photo.
              photo_required: photoRequired,
              photo_instruction: photoInstruction,
              // Mandated wait owned by THIS step. 0 = none.
              timer_seconds: timerSeconds,
              timer_label: timerLabel,
            };
          })
        : [];

      console.log('\n========== GENERATED PROCEDURE STEPS ==========');
      steps.forEach((step, index) => {
        console.log(`Step ${index + 1}: ${step.title}`);
        console.log('  image_url:', step.image_url || 'NONE');
        console.log('  photo_required:', step.photo_required ? 'YES' : 'NO');
        console.log('  photo_instruction:', step.photo_instruction || 'NONE');
        console.log('  timer:', step.timer_seconds ? `${step.timer_seconds}s "${step.timer_label}"` : 'NONE');
      });
      console.log('===============================================\n');
    } catch (stepErr) {
      console.error('Step extraction failed, continuing with text-only response:', stepErr);
    }

    // ── Step 3: Fire the Audit Logger (Session Based) ────────────────────────
    try {
      await logAuditRecord(
        query,
        text,
        retrievalData.sources,
        userId || 'anonymous',
        sessionId
      );
    } catch (auditErr) {
      console.error('[AUDIT LOGGING FAILED]:', auditErr);
    }

    // ── Step 4: Alert Agent — detect safety-critical content ─────────────────
    const alert = detectAlerts(query, text, role);
    const priorityResult = await runPriorityAdjustmentAgent(
      alert,
      query,
      role,
      userId,
      userEmail,
      sessionId,
      retrievalData.sources
    );

    // ── Step 5: Spoken form for hands-free mode ───────────────────────────────
    // Only when asked for, and only if it passes validation against the full
    // answer. `text` is untouched either way, so rendering, audit logging and
    // alert detection above see exactly what they always did.
    let spoken = null;
    if (voice === true) {
      spoken = await generateSpokenAnswer({ text, apiKey });
      if (!spoken.spokenText) {
        console.log(`[VOICE] no spoken form: ${spoken.reason}` +
          (spoken.rejected ? ` | rejected: "${spoken.rejected.slice(0, 300)}"` : ''));
      }
    }

    // ── Step 6: Return answer + sources + alert metadata ──────────────────────
    res.json({
      text,
      isProcedural,
      steps,
      sources:        retrievalData.sources,
      context_blocks: retrievalData.context_blocks,
      reasoning:      'Generated via OpenAI gpt-4o-mini with RAG context',
      alert,
      priorityTask: priorityResult,
      // The model this answer is grounded in, so the app can hold it as the
      // chat's confirmed machine. Only a photo establishes one here.
      ...(imageBase64 ? { identifiedModel: visualModel, imageAttached: true } : {}),
      ...(voice === true ? { spokenText: spoken.spokenText, spokenUnavailable: spoken.reason } : {}),
    });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      error: 'Internal server error. Try again, and report it if it keeps happening.',
      code:  'internal_error',
    });
  }
});

// Sets another user's password on their behalf. Admin-only, and server-side
// for the same reason as deletion: the client SDK can only change the password
// of the account it is currently signed in as. There is no self-service reset
// in this app, so an administrator doing it for the user is the only path.
app.patch('/api/users/:uid/password', requireAdmin, async (req, res) => {
  const { uid } = req.params;
  const { password } = req.body;

  if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ error: 'Invalid uid' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    await getAuthLazy().updateUser(uid, { password });
    // Deliberately not logged or echoed back anywhere.
    console.log(`[USERS] ${req.caller.email} reset the password for ${uid}`);
    res.json({ status: 'password_updated', uid });
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'No sign-in account for this user' });
    }
    console.error('[USERS] Password update failed:', err.code || err.message);
    res.status(500).json({ error: 'Could not update the password' });
  }
});

// ── Chat session titles ───────────────────────────────────────────────────────
// Names a conversation from its first exchange, the way chat assistants do.
// Kept as its own cheap call rather than folded into /api/query: it runs once
// per chat, not once per message, and a failure here must never cost the user
// their answer — the client falls back to a truncated first message.
app.post('/api/chat-title', sanitize, async (req, res) => {
  const { question, answer } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!question || !String(question).trim()) {
    return res.status(400).json({ error: 'question is required' });
  }
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
  }

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ANSWER_MODEL,
        messages: [
          {
            role: 'system',
            content: `Title this maintenance conversation in 2 to 5 words, as a technician would label the job in a worklist.

Base the title on the QUESTION. The answer is context only — it is often an
apology or a "not in the manual" response, and that must not stop you naming a
perfectly clear question.

Rules:
- Name the equipment and the task when both appear: "CS-C18DKV compressor restart".
- Equipment but no clear task: name the equipment: "CS-E12QD3EAW service".
- Task but no equipment: name the task: "Refrigerant leak check".
- No trailing punctuation, no quotes, no "How to", no filler like "Assistance with".
- Use sentence case.
- Reply exactly "New Chat" ONLY when the question carries no maintenance
  subject at all, such as a greeting or a test message.
Reply with the title and nothing else.`,
          },
          {
            role: 'user',
            content: `Question: ${String(question).slice(0, 500)}\n\nAnswer: ${String(answer || '').slice(0, 500)}`,
          },
        ],
        reasoning: {"effort": "low"},
        max_completion_tokens: 100,
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: data?.error?.message || 'Title request failed' });
    }

    // Trim defensively: the model occasionally wraps the title in quotes or
    // adds a full stop despite the instruction.
    const title = String(data?.choices?.[0]?.message?.content || '')
      .replace(/^["'\s]+|["'.\s]+$/g, '')
      .slice(0, 60);

    res.json({ title: title || 'New Chat' });
  } catch (err) {
    console.error('[TITLE] Failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── User administration ───────────────────────────────────────────────────────
// Deleting a user has to happen server-side. The client SDK can only remove the
// Firestore document; it cannot delete another account's Firebase Auth record,
// because that needs the Admin SDK. Doing only half of it left an orphaned Auth
// account: login was still blocked (login.jsx checks the Users doc exists), but
// the email address stayed permanently claimed, so the same person could never
// be re-added.
app.delete('/api/users/:uid', requireAdmin, async (req, res) => {
  const { uid } = req.params;

  if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ error: 'Invalid uid' });
  }
  if (uid === req.caller.uid) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const result = { uid, firestore: 'skipped', auth: 'skipped' };

  // Delete the Auth record FIRST. If it succeeds and the Firestore delete then
  // fails, the leftover document is harmless and visible in the user list, so
  // it can be retried. The reverse order is what produced the orphan: the
  // document disappears and the invisible Auth record is left behind.
  try {
    await getAuthLazy().deleteUser(uid);
    result.auth = 'deleted';
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      // Already gone, or the record only ever existed in Firestore.
      result.auth = 'not_found';
    } else {
      console.error('[USERS] Auth delete failed:', err.code || err.message);
      return res.status(500).json({ error: 'Could not delete the sign-in account', details: err.code });
    }
  }

  try {
    await firebaseAdmin.db.collection('Users').doc(uid).delete();
    result.firestore = 'deleted';
  } catch (err) {
    console.error('[USERS] Firestore delete failed:', err.message);
    return res.status(500).json({ error: 'Sign-in account removed, but the user record could not be deleted', ...result });
  }

  console.log(`[USERS] ${req.caller.email} deleted ${uid} (auth: ${result.auth})`);
  res.json({ status: 'deleted', ...result });
});

// ── Procedure timers ──────────────────────────────────────────────────────────
// Records that a manual-mandated wait was actually observed, so the audit trail
// evidences the procedure rather than just the advice.
app.post('/api/timer-event', sanitize, async (req, res) => {
  const { sessionId, label, seconds, completedAt } = req.body;
  try {
    const entry = await logTimerEvent(sessionId, { label, seconds, completed_at: completedAt });
    res.json({ status: 'recorded', entry });
  } catch (err) {
    console.error('[TIMER] Failed:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Repair report ─────────────────────────────────────────────────────────────
// Summarises one completed job from its audit_logs session into a structured
// report, and stores it in repair_reports. The client renders the PDF; keeping
// generation server-side means the OpenAI key never leaves the backend and the
// stored record is the single traceable source behind every exported PDF.
// Middleware note: `sanitize` yes (input hygiene), but NOT `validate` — that
// one requires a non-empty `query` field, which a report request has no reason
// to carry — and NOT `outputSanitize`, which HTML-escapes every response
// string, so "don't" would reach the preview as "don&#39;t". The PDF template
// on the client escapes its own interpolations, which is where escaping
// actually belongs for this route.
app.post('/api/report', sanitize, async (req, res) => {
  const { sessionId, userId, userEmail, role } = req.body;
  try {
    const result = await generateRepairReport({
      sessionId,
      requestedBy: userId,
      requestedByEmail: userEmail,
      role,
    });
    console.log(`[REPORT] Generated for session ${sessionId}`);
    res.json(result);
  } catch (err) {
    console.error('[REPORT] Failed:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Fetch a previously generated report without paying for a second LLM call.
app.get('/api/report/:sessionId', async (req, res) => {
  if (!firebaseAdmin.db) {
    return res.status(503).json({ error: 'Firebase Admin not configured' });
  }
  try {
    const snap = await firebaseAdmin.db
      .collection('repair_reports')
      .doc(req.params.sessionId)
      .get();
    if (!snap.exists) return res.status(404).json({ error: 'No report for this session' });
    res.json(snap.data());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── HITL endpoints ────────────────────────────────────────────────────────────
app.post('/api/approve', async (req, res) => {
  const { sessionId, reviewedBy, reviewedAt } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }
  if (!firebaseAdmin.db) {
    return res.status(503).json({ error: 'Firebase Admin not configured' });
  }

  const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];

  try {
    await firebaseAdmin.db.collection('audit_logs').doc(sessionId).update({
      status: 'approved',
      reviewed_by: reviewedBy || 'admin',
      reviewed_at: reviewedAt || timestamp,
      last_updated: timestamp,
    });
    res.json({ status: 'approved' });
  } catch (err) {
    console.error('[HITL APPROVE FAILED]:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reject', async (req, res) => {
  const { sessionId, reviewedBy, reviewedAt, reason } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }
  if (!firebaseAdmin.db) {
    return res.status(503).json({ error: 'Firebase Admin not configured' });
  }

  const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];

  try {
    await firebaseAdmin.db.collection('audit_logs').doc(sessionId).update({
      status: 'rejected',
      reviewed_by: reviewedBy || 'admin',
      reviewed_at: reviewedAt || timestamp,
      last_updated: timestamp,
      ...(reason && { rejection_reason: reason }),
    });
    res.json({ status: 'rejected' });
  } catch (err) {
    console.error('[HITL REJECT FAILED]:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});


app.get('/api/documents', async (req, res) => {
  try {
    const data = await getKnownFilters();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Service failures ──────────────────────────────────────────────────────────
// One shape for every upstream outage on /api/query: a real error status, a
// message the app can show as-is, a stable code to branch on, and whether
// retrying makes sense. `imageAttached` tells the app to keep the photo.
function serviceFailure(res, status, code, message, imageAttached = false) {
  return res.status(status).json({
    error: message,
    code,
    retryable: true,
    ...(imageAttached ? { imageAttached: true } : {}),
  });
}

// ── Body parser errors ────────────────────────────────────────────────────────
// Without this, express answers an oversized or malformed body with its default
// HTML error page: not JSON, and nothing the app can show. Parser errors are
// routed here even though this is registered after the routes.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err.type === 'entity.too.large') {
    const isQuery = req.originalUrl.startsWith('/api/query');
    return res.status(413).json({
      error: isQuery
        ? 'Image too large. Retake the photo at a lower resolution and try again.'
        : 'Request body too large.',
      code: isQuery ? 'image_too_large' : 'payload_too_large',
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.', code: 'invalid_json' });
  }

  console.error('Unhandled middleware error:', err);
  return res.status(500).json({
    error: 'Internal server error. Try again, and report it if it keeps happening.',
    code:  'internal_error',
  });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8000;
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Node backend running at http://localhost:${PORT}`);
    console.log(`Expecting retrieval service at ${RETRIEVAL_SERVICE_URL}`);
  });
}

module.exports = app;

// ── Alert Agent ───────────────────────────────────────────────────────────────
function detectAlerts(query, responseText, role) {
  const text = responseText.toLowerCase();

  const criticalKeywords = [
    'loto', 'lockout', 'tagout', 'high voltage',
    'electrical hazard', 'life-threatening', 'fatal', 'electrocution',
  ];
  const warningKeywords = [
    'warning', 'caution', 'ppe', 'personal protective equipment',
    'hazard', 'danger', 'high risk', 'critical safety', 'do not operate',
  ];

  for (const kw of criticalKeywords) {
    if (text.includes(kw)) {
      return {
        level:  'critical',
        icon:   '🚨',
        title:  'CRITICAL Safety Procedure Detected',
        reason: `Critical safety requirement detected: ${kw}`,
      };
    }
  }

  for (const kw of warningKeywords) {
    if (text.includes(kw)) {
      return {
        level:  'warning',
        icon:   '⚠️',
        title:  'Safety Warning in Response',
        reason: `Safety content detected: ${kw}`,
      };
    }
  }

  return null;
}

// ── Filter extractor ──────────────────────────────────────────────────────────
function extractFilters(
  query,
  knownGroups        = [],
  knownFiles         = [],
  knownClassifications = [],
  knownCat1          = [],
  knownCat2          = [],
  knownModels        = []
) {
  const q = query.toLowerCase();

  let matchedGroup          = null;
  let matchedFile           = null;
  let matchedClassification = null;
  let matchedCategory1      = null;
  let matchedCategory2      = null;
  let matchedModel          = null;

  for (const g  of knownGroups)           { if (q.includes(g.toLowerCase()))  { matchedGroup          = g;  break; } }
  for (const f  of knownFiles)            { if (q.includes(f.toLowerCase()))  { matchedFile           = f;  break; } }
  for (const c  of knownClassifications)  { if (q.includes(c.toLowerCase()))  { matchedClassification = c;  break; } }
  for (const c1 of knownCat1)             { if (q.includes(c1.toLowerCase())) { matchedCategory1      = c1; break; } }
  for (const c2 of knownCat2)             { if (q.includes(c2.toLowerCase())) { matchedCategory2      = c2; break; } }
  for (const m  of knownModels)           { if (q.includes(m.toLowerCase()))  { matchedModel          = m;  break; } }

  return {
    matchedGroup,
    matchedFile,
    matchedClassification,
    matchedCategory1,
    matchedCategory2,
    matchedModel,
  };
}

// ── Fetch known filters from retrieval service ────────────────────────────────
// The `ok` flag matters for photo-and-ask. This used to return empty arrays on
// failure, which is indistinguishable from "the corpus contains no models" -
// so a catalogue outage would tell the technician "there is no manual for this
// machine" and send them looking for the wrong problem. Callers that care can
// now tell a service fault from a fact about the corpus.
const EMPTY_FILTERS = {
  document_group_ids: [],
  filenames:          [],
  classifications:    [],
  category_level_1:   [],
  category_level_2:   [],
  model_numbers:      [],
};

async function getKnownFilters() {
  try {
    const res = await fetch(`${RETRIEVAL_SERVICE_URL}/filters`);
    if (!res.ok) {
      console.error(`Failed to fetch filters: ${res.status} ${res.statusText}`);
      return { ...EMPTY_FILTERS, ok: false };
    }
    const data = await res.json();
    return { ...data, ok: true };
  } catch (err) {
    console.error('Failed to fetch filters:', err.message);
    return { ...EMPTY_FILTERS, ok: false };
  }
}