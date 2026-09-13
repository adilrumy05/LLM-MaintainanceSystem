// server/services/visionIntake.js
//
// Photo-and-ask intake: read what is in a photograph, reconcile it against the
// manual catalogue, and decide whether we know enough to answer.
//
// WHY THIS IS A SEPARATE STEP, NOT JUST "SEND THE IMAGE TO THE LLM"
// -----------------------------------------------------------------
// Retrieval is filtered by model_number / document_group_id, and those filters
// are ANDed in Qdrant (vector_store.py builds Filter(must=conditions)). If a
// photo arrives with a vague question, retrieval has nothing to scope on and the
// answer cites a confidently wrong machine - the exact failure the feature is
// meant to remove. So we extract first, reconcile against the catalogue, and
// refuse when we cannot establish which machine we are looking at.
//
// Every uncertain path STOPS and asks. There is deliberately no
// "retrieve unfiltered and hope" fallback.

const VISION_MODEL = 'gpt-4o-mini';

// Structured Outputs schema. Stricter than JSON mode: the model must return
// these keys with these types, so a prose reply cannot slip through into
// retrieval. Refusals and truncation are still handled explicitly below.
const EXTRACTION_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'equipment_photo_reading',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['legible', 'confidence', 'modelNumber', 'serialNumber', 'faultCode', 'visibleText', 'observation'],
      properties: {
        legible: {
          type: 'boolean',
          description: 'True only if something useful can actually be read or identified in the image.',
        },
        confidence: {
          type: 'number',
          description: '0 to 1. How confident the reading is.',
        },
        modelNumber: {
          type: ['string', 'null'],
          description: 'Model/type code exactly as printed, or null if none is visible.',
        },
        serialNumber: {
          type: ['string', 'null'],
          description: 'Serial number exactly as printed, or null.',
        },
        faultCode: {
          type: ['string', 'null'],
          description: 'Fault/error code shown on a display or label, e.g. "H27", or null.',
        },
        visibleText: {
          type: ['string', 'null'],
          description: 'Other text legible in the image, verbatim, or null.',
        },
        observation: {
          type: ['string', 'null'],
          description: 'Short factual description of the part or condition shown. No diagnosis.',
        },
      },
    },
  },
};

const VISION_SYSTEM_PROMPT = `You read photographs of air-conditioning equipment for a maintenance technician.

Report only what is actually visible. Do not infer a model number from the shape
of a unit, and do not guess characters that are blurred or cut off.

Set legible=false when the image is too blurred, dark, cropped or distant to read
anything useful. A confident wrong reading sends a technician to the wrong
machine, which is worse than saying you cannot read it.

Copy codes character by character, including hyphens and suffixes.
Do not diagnose. Do not suggest repairs.`;

/** Fold a code to a comparable form: upper case, alphanumerics only. */
function normaliseCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Reconcile an OCR'd model code against the catalogue.
 *
 * A unique prefix match is NOT accepted automatically. It may be unique only
 * because the corpus is small - nine manuals today - so "CS-E7" matching exactly
 * one known model proves very little. Partial matches always ask.
 *
 * @returns {{status: 'exact'|'confirm'|'ambiguous'|'none', model?: string, candidates?: string[]}}
 */
function matchModelNumber(extracted, knownModels) {
  const target = normaliseCode(extracted);
  if (!target) return { status: 'none', candidates: [] };

  const known = (knownModels || []).filter(Boolean);
  const exact = known.filter((m) => normaliseCode(m) === target);
  if (exact.length === 1) return { status: 'exact', model: exact[0] };
  if (exact.length > 1) return { status: 'ambiguous', candidates: exact };

  // Prefix either way: the label may be truncated, or carry a suffix the
  // catalogue omits.
  const prefix = known.filter((m) => {
    const n = normaliseCode(m);
    return n.startsWith(target) || target.startsWith(n);
  });

  if (prefix.length === 1) return { status: 'confirm', model: prefix[0], candidates: prefix };
  if (prefix.length > 1) return { status: 'ambiguous', candidates: prefix };
  return { status: 'none', candidates: [] };
}

/**
 * Call the vision model and validate the result.
 * Never throws for a bad reading - returns {ok:false, reason} instead, so the
 * caller has one place to decide what to do.
 */
async function extractFromImage(imageBase64, apiKey, { fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 300,
        temperature: 0,
        response_format: EXTRACTION_SCHEMA,
        messages: [
          { role: 'system', content: VISION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Read this photograph.' },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: 'auto' },
              },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    return { ok: false, reason: 'vision_unavailable', detail: err.message };
  }

  if (!response.ok) return { ok: false, reason: 'vision_unavailable', detail: `HTTP ${response.status}` };

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    return { ok: false, reason: 'vision_unavailable', detail: 'unparseable response' };
  }

  const choice = payload?.choices?.[0];

  // A model refusal is a first-class outcome under Structured Outputs, and a
  // truncated reply yields valid-looking JSON that is actually incomplete.
  if (choice?.message?.refusal) return { ok: false, reason: 'refused', detail: choice.message.refusal };
  if (choice?.finish_reason === 'length') return { ok: false, reason: 'truncated' };

  let parsed;
  try {
    parsed = JSON.parse(choice?.message?.content ?? '');
  } catch (err) {
    return { ok: false, reason: 'unreadable_output' };
  }

  if (typeof parsed?.legible !== 'boolean' || typeof parsed?.confidence !== 'number') {
    return { ok: false, reason: 'unreadable_output' };
  }

  return { ok: true, data: parsed };
}

/**
 * Build the retrieval question from the typed query plus what the photo shows.
 *
 * This is the difference between a working feature and a useless one. If the
 * fault code only reaches the final answer prompt, "what does this mean?" still
 * searches vaguely inside the right manual and retrieves the wrong pages. The
 * code has to be in the text we embed and search with.
 */
function buildRetrievalQuery(query, reading) {
  const parts = [String(query || '').trim()];
  if (reading?.faultCode) parts.push(`fault code ${reading.faultCode}`);
  if (reading?.observation) parts.push(reading.observation);
  // Visible text only helps when it is the subject - a display message or a
  // warning label. On a nameplate the model already filters retrieval, and the
  // rest of the plate (serial, voltage, refrigerant) drags the embedding toward
  // specification tables: "clean the air filter" plus nameplate text retrieved
  // spec and circuit-diagram pages instead of anything about the filter.
  if (reading?.visibleText && !reading?.modelNumber) parts.push(reading.visibleText);
  return parts.filter(Boolean).join(' — ').slice(0, 900);
}

const MIN_CONFIDENCE = 0.5;

/**
 * Decide what to do with a photo-bearing request.
 *
 * Returns one of:
 *   proceed      - model established; carry on to retrieval
 *   ask_photo    - unreadable; ask for another picture
 *   ask_model    - ask the user to confirm which model
 *   no_manual    - readable, but nothing in the catalogue matches
 *   conflict     - the photo disagrees with the selected document group
 *   error        - vision or catalogue unavailable (NOT the same as no_manual).
 *                  A service failure, not an outcome: the route answers HTTP 503
 *                  with `code` = reason, never a 200 needsInput reply.
 */
async function resolveVisualIntake({
  imageBase64,
  query,
  docGroup = null,
  confirmedModel = null,
  known,
  knownOk = true,
  apiKey,
  fetchImpl = fetch,
}) {
  // A catalogue outage must not be reported as "no manual for this machine".
  // One is a service fault we should retry; the other is a fact about the
  // corpus. Collapsing them sends people looking for the wrong problem.
  if (!knownOk) {
    return { action: 'error', reason: 'catalogue_unavailable',
      message: 'Cannot reach the manual catalogue right now. Try again in a moment.' };
  }

  const extraction = await extractFromImage(imageBase64, apiKey, { fetchImpl });

  if (!extraction.ok) {
    if (extraction.reason === 'vision_unavailable') {
      return { action: 'error', reason: 'vision_unavailable',
        message: 'Could not analyse the photo right now. Try again in a moment.' };
    }
    return { action: 'ask_photo', reason: extraction.reason,
      message: 'I could not read that photo. Try again, closer and in better light.' };
  }

  const reading = extraction.data;

  if (!reading.legible || reading.confidence < MIN_CONFIDENCE) {
    return { action: 'ask_photo', reason: 'not_legible', reading,
      message: 'That photo is not clear enough to read. Try again, closer and in better light.' };
  }

  const retrievalQuery = buildRetrievalQuery(query, reading);

  // PATH B - a model is already confirmed for this chat, and the photo carries
  // no model of its own. Use the confirmed model and analyse what is shown.
  // This is what lets a technician photograph a damaged part with no label.
  if (!reading.modelNumber && confirmedModel) {
    return { action: 'proceed', model: confirmedModel, reading, retrievalQuery };
  }

  // No model in the photo and none confirmed. A document group is NOT a model:
  // 8 of 9 groups in this corpus cover several models, one covers 19. Selecting
  // a manual narrows the scope, it does not identify the machine.
  if (!reading.modelNumber) {
    return { action: 'ask_model', reason: 'no_model_established', reading, retrievalQuery,
      candidates: known?.model_numbers || [],
      message: 'I can see the part, but not which unit it belongs to. Photograph the nameplate, or pick the model.' };
  }

  const match = matchModelNumber(reading.modelNumber, known?.model_numbers || []);

  if (match.status === 'none') {
    return { action: 'no_manual', reading, readModel: reading.modelNumber,
      message: `I can read this as ${reading.modelNumber}, but there is no manual for it in the system.` };
  }

  if (match.status === 'confirm' || match.status === 'ambiguous') {
    return { action: 'ask_model', reason: match.status, reading, retrievalQuery,
      candidates: match.candidates,
      message: `I read this as ${reading.modelNumber}. Which model is it?` };
  }

  // Exact match. Last check: does it contradict a manual the user chose?
  // Filters are ANDed downstream, so a mismatch returns zero results rather
  // than a wrong answer - but silently overriding the user's choice would be
  // worse than asking.
  if (confirmedModel && normaliseCode(confirmedModel) !== normaliseCode(match.model)) {
    return { action: 'conflict', reading, model: match.model, previous: confirmedModel,
      message: `This looks like ${match.model}, but this chat is set to ${confirmedModel}. Which one are you working on?` };
  }

  if (docGroup && !modelBelongsToGroup(match.model, docGroup, known)) {
    return { action: 'conflict', reading, model: match.model, docGroup,
      message: `This looks like ${match.model}, which is not covered by the manual you selected. Which one are you working on?` };
  }

  return { action: 'proceed', model: match.model, reading, retrievalQuery };
}

/**
 * Is this model covered by the selected document group?
 *
 * When the catalogue gives no group->model mapping we return true rather than
 * inventing a conflict: refusing on missing metadata would block real work.
 */
function modelBelongsToGroup(model, docGroup, known) {
  const mapping = known?.group_models || known?.models_by_group;
  if (!mapping || !mapping[docGroup]) return true;
  const target = normaliseCode(model);
  return mapping[docGroup].some((m) => normaliseCode(m) === target);
}

module.exports = {
  extractFromImage,
  matchModelNumber,
  buildRetrievalQuery,
  resolveVisualIntake,
  normaliseCode,
  MIN_CONFIDENCE,
};
