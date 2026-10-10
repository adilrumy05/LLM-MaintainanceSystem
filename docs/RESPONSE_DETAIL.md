# Response detail: Brief / Standard / Detailed

Sprint 5, "Effort Level Responses". The chip beside the message box lets a
technician choose how much each answer explains. It does not change their skill
level, their permissions or the AI model.

> **Status: paused on 8 Oct 2026. Not accepted, not committed.**
> The feature runs end to end and its automated tests pass, but it has not been
> shown to be worth shipping. Open points to settle before it is picked up again:
>
> 1. **Brief often comes back as Standard.** When the safety check rejects the
>    Brief answer, the technician asked for Brief and sees the full answer. On
>    the iPhone at 3:10 on 8 Oct this is what happened. The rejection rate has
>    not been measured.
> 2. **Brief saves little on step-heavy procedures**, where nearly every line is
>    a step or a warning.
> 3. **Detailed is not clearly more useful than Standard.**
> 4. **Not retested on the iPhone since the model changed to `gpt-6-luna`.**
>    Every phone check so far ran on `gpt-4o-mini`, whose answers are longer and
>    more repetitive, so both of the points above may look different now.
> 5. **A display bug, in every level:** a numbered step's text is sometimes cut
>    off mid-sentence in the answer bubble ("Loosen the screw to take off the
>    control", "safety hazards an"). Seen twice on the iPhone. Not investigated;
>    the inline selectable text added for copy/select is the first suspect.
> 6. **No Brief answer has been checked line by line against the manual.**
>
> **Changed on 10 Oct 2026, when this was merged onto `main`'s new backend.**
> `main` now finds its evidence in a search-and-answer loop, so Brief is written
> after that loop, from the same evidence, while the guided steps are extracted.
> A Brief request therefore takes about as long as Standard (it is no longer the
> quickest level), and a Brief answer keeps its Procedure view. The speed and
> "Brief skips guided steps" notes further down describe the earlier build and
> have not been re-measured. The feature is switched off on both sides
> (`FEATURES.EFFORT_LEVELS`, `EFFORT_LEVELS_ENABLED`) until the checks above pass.

| Detail | What the technician gets | What the server does |
|---|---|---|
| **Brief** | Short key points, with the steps, warnings and measurements kept. The Standard answer is one tap away as "Full" | Writes a Brief and a Standard answer together and compares them (below) |
| **Standard** (default) | Today's answer | Nothing new: the request is identical to before this feature |
| **Detailed** | The reasons, parts, related warnings and follow-up checks, where the manual gives them | Searches 8 passages instead of 5 and adds Detailed rules to the prompt |

## How it behaves

- **The choice is saved per user** and applies to the next question. Earlier
  answers stay as they are.
- **Each request keeps the detail it was sent with.** Retry reuses it, even if
  the chip has changed since.
- **Hands-free ignores the chip.** Spoken answers keep their own pipeline.
- **Brief and Detailed answers are labelled** ("Brief answer", "Detailed answer")
  and open on the written answer. Standard answers open on the guided procedure
  when there is one, as before.
- **A Brief answer has a Full view** holding the Standard answer it was checked
  against. Copy and Select text use whichever view is on screen.
- **The audit record is the answer shown.**
- **A Brief answer has no guided Procedure view.** Skipping that step is what
  makes Brief quicker (see Speed). The Standard answer is still there as Full.

## Brief: how it is kept safe, and what that does not cover

For a Brief request the server asks the answer model twice at the same time:
once for a Brief answer and once for the Standard answer. Brief therefore costs
two answer calls instead of one, and the pair takes as long as one Standard
answer. Brief then skips the guided-steps call, which the other levels make.

The Brief answer is shown only if it passes three checks:

1. **It finished normally.**
2. **Its figures are in the manual.** Every measurement ("40 °C", "1.5 mm²",
   "2 weeks") and every code ("H11", "CS-S10TKH") in it must appear in the
   manual passages, the question or the quoted passage.
3. **It kept what Standard has.** Every measurement in the Standard answer, and
   every kind of safety item it mentions, must also be in the Brief answer, as
   long as the manual passages have it too. The safety items are: power off,
   unplug, lockout, earth, prohibitions, protective gear, electric shock, fire,
   explosion, leak, burn, toxic, refrigerant and "qualified person".

If any check fails, the Standard answer is shown instead, with the reason. No
further call is made, and Brief is never retried.

| `detailFallback` | The app says |
|---|---|
| `incomplete` | A Brief answer was not available, so the Standard answer is shown. |
| `unverified_figures` | A figure in the Brief answer could not be matched to the manual, so the Standard answer is shown. |
| `missing_safety_detail` | The Brief answer left out a safety detail or measurement, so the Standard answer is shown. |

**What this does not cover:**

- Check 3 looks for words. It catches a safety topic that has gone missing, not
  one that is still mentioned but reworded wrongly, and only the topics listed.
- Brief is only as complete as the Standard answer it is compared with. If
  Standard leaves a precaution out, Brief is not asked for it.
- Brief is not held to things Standard adds that the manual does not say, such
  as a Fahrenheit conversion or generic protective gear.
- Bare numbers such as step numbers are not checked.

## Speed

Measured on 8 Oct 2026: two questions, four requests per level, admin role,
local services. A small sample, so treat the figures as indicative.

| Level | Average time | Range |
|---|---|---|
| Brief | 5.0 s | 3.3 to 6.6 s |
| Standard | 7.9 s | 5.2 to 11.3 s |
| Detailed | 10.7 s | 8.8 to 16.2 s |

Before Brief skipped the guided-steps call it averaged 8.4 s, the same as
Standard. That call takes about 3.9 s, close to half of a Standard request.
The backend logs each request's stage times as `[TIMING]`, with no question or
answer text.

### Answer model: gpt-6-luna (8 Oct 2026)

The Node backend's four chat calls now use `gpt-6-luna` instead of
`gpt-4o-mini`: the written answer, guided steps, photo reading and spoken
(hands-free) answers. The model is set by `ANSWER_MODEL` in `.env` (see
`backend-node/server/services/answerModel.js`); setting it to `gpt-4o-mini` restores the
earlier requests exactly. Voice transcription (Whisper) and the Python
ingestion pipeline are unchanged.

Photo reading and spoken answers were checked directly on both models with the
same inputs, then once each through the backend:

- **Photo reading:** read "CS-S10TKH" from a test image on both models. The
  test image was a phone screenshot, not a real nameplate photo.
- **Spoken answers:** 6 of 6 passed the spoken-answer checks on `gpt-6-luna`,
  5 of 6 on `gpt-4o-mini`. `gpt-6-luna` keeps symbols as written ("40°C",
  "4 × 1.5 mm²") where `gpt-4o-mini` wrote "40 degrees Celsius"; how the
  phone's voice reads those has not been checked on a device.
- **Through the backend:** one hands-free request returned a spoken answer, and
  one photo request identified the model and answered.

- `gpt-6-luna` rejects `max_tokens` and `temperature`. It takes
  `max_completion_tokens` and a `reasoning_effort`, which is set to `low`.
- List price per 1M tokens: $0.10 input, $0.50 output, against $0.15 and $0.60
  for `gpt-4o-mini` (OpenAI pricing page, 8 Oct 2026). Its thinking is billed
  as output, so the real cost per answer has not been measured.

Same test as above, four requests per level:

| Level | Average time | Range |
|---|---|---|
| Brief | 4.3 s | 3.2 to 5.3 s |
| Standard | 7.3 s | 5.8 to 8.5 s |
| Detailed | 9.7 s | 6.8 to 13.0 s |

Answers are shorter and cite a page per step. On the cable question the
Standard answer was 138 words against about 270 before, and it chose the
4 × 1.5 mm² cable for this model instead of listing both sizes. The admin role's
risk and compliance section did not appear in that Standard answer. Answer
quality with the new model has not been evaluated beyond these few requests.

## API

`POST /api/query` accepts an optional `detail`: `"brief"`, `"standard"` or
`"detailed"`.

| Case | Result |
|---|---|
| `detail` absent or `"standard"` | Today's request, unchanged |
| Any other value | HTTP 400 |
| `topK` outside 1–10, or not a whole number | HTTP 400 (it had no upper limit before) |
| `voice: true` | `detail` is ignored |

The response adds:

- `responseDetail`: the detail the answer in `text` was actually written in.
- `fullText`: only with a Brief answer, the Standard answer behind it.
- `detailFallback`: only when Brief was asked for and Standard is shown.

Older clients can ignore all three.

## Switching it off

- **Server:** set `EFFORT_LEVELS_ENABLED=false` and restart. Every answer is
  Standard, whatever the app sends.
- **App:** set `FEATURES.EFFORT_LEVELS` to `false` in
  `LLM-Mobile/constants/featureFlags.js`. The chip and labels disappear.

## Where the code is

| Part | File |
|---|---|
| Prompt rules and the Brief checks | `backend-node/server/services/responseDetail.js` |
| Request handling and the Standard fallback | `backend-node/server.js` (`/api/query`) |
| Request validation | `backend-node/server/middleware/validate.js` |
| Chip and picker | `LLM-Mobile/components/DetailChip.jsx` |
| Saved preference | `LLM-Mobile/hooks/usePreferences.js` |
| Labels, default view, fallback messages | `LLM-Mobile/utils/responseDetail.js` |


## Live checks

All run through the real backend against the local manual database. These are
a handful of questions, not an evaluation.

### 7 Oct 2026: first version (Brief written alone)

- Brief was clearly shorter: 68 words against 184 for filter cleaning, and 170
  against 235 for the cable connection.
- A correct Brief was sent back to Standard because the manual writes a range
  as `1.0 \~ 1.5HP`, which the figure check did not read. Fixed, with a test.

### 8 Oct 2026: iPhone check (admin role) and what it led to

- **Fixed:** a Brief answer showed a cable size as raw formula code
  (`$4 \times 1.5 , \text{mm}^2$`). The server now turns these into plain text.
- **Fixed:** a bubble holding only a bulleted list collapsed to a narrow column.
- **Changed:** the Detailed rules now ask for reasons, parts, related warnings
  and follow-up checks. The filter answer went from about the same length as
  Standard to 336 words against 89.
- **Found:** on the cable question, Brief left out the earth-wire warning
  (Yellow/Green, longer than the other wires) in 2 of 3 runs, while Standard
  included it. This is why Brief is now compared with Standard.

### After adding the comparison with Standard

Five Brief requests:

| Role | Question | Result | Brief | Full |
|---|---|---|---|---|
| Admin | Cable connection | Brief shown, earth wire kept | 201 words | 274 words |
| Admin | Cable connection (repeat) | Brief shown, earth wire kept | 207 words | 300 words |
| Beginner | Cable connection | Brief shown, earth wire kept | 139 words | 245 words |
| Admin | Filter cleaning | Brief shown | 90 words | 91 words |
| Beginner | Filter cleaning | Standard shown: Brief had dropped "unplug" | | 196 words |

- The first run of the comparison sent 4 of 5 requests back to Standard. Three
  were false alarms (a cable size read as "4 times", things Standard had added
  that the manual does not say, and "do not use water above" against "water not
  exceeding"). Each is fixed and has a test.
- An earlier run did catch Brief dropping the earth-wire warning, twice.
- When the Standard answer is already short, Brief saves almost nothing (90
  against 91 words).

### 8 Oct 2026, later: second iPhone check and the Detailed rules

- **Brief and Standard confirmed on the phone:** full-width bubble, cable sizes
  as plain text, earth-wire warning present, Procedure / Brief / Full tabs.
- **Detailed was adding unsupported content.** On the cable question it listed
  pipe tools (torque wrench, pipe cutter, reamer) and a gas-leak check, both
  from the piping pages, and wrote its own reasons for steps ("this protects
  the internal components from dust").
- **The Detailed rules were tightened:** steps first; reasons, tools and checks
  only where the manual gives them for this task; other jobs' pages left out.
- **Result:** the unsupported content is gone, but Detailed is no longer longer
  than Standard (217 words on the cable question, 153 on filter cleaning). What
  it adds is the fuller cable specification, page citations per point and the
  "Not covered in the manual" line. With these manuals there is little more to
  say without inventing it.
- **Detailed then gave fewer steps than Standard** (5 against 9 on the cable
  question). The rules now say to give every step a standard answer would.
  Rechecked only by step count (6 against 7), not line by line.
- **Still wrong in both modes:** the filter answer says to clean the filters
  with a soft cloth and cites page 10. Neither is checked against the manual.

### Still open

- **Detailed** may include points the manual does not support. The longer
  filter answer said to wipe the filters with a dry cloth, gave "electrical
  shock" as a consequence and cited page 10. Not yet checked against the manual.
- **Admin answers** carry the role's risk, compliance and sign-off section in
  every mode, which limits how short Brief can be.
- No Brief answer has been checked line by line against the manual pages.

## Not part of this feature

An earlier attempt added stricter answer-writing rules and a second AI call that
reviewed every answer against the manual pages. In its live test the reviewer
approved a known-bad answer and rejected known-good ones, so both were removed.
What it found is worth raising with whoever owns retrieval: Standard answers
sometimes add explanations the manual does not give, and sometimes leave out
precautions that sit on a different page from the procedure.
