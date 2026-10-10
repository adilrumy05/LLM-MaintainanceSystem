# Animation feasibility test (Sprint 5, Feature C)

**Status, 8 Oct 2026: the automatic part is done. The decision is waiting on a
human review.** Two people who know the equipment need to judge the animations
on the [review sheet](https://claude.ai/artifact/2vVFbA4za7KPpJSZiTj2eV) (ask
Adil for access). Nothing here is in the app.

## The question

Can a model turn manual passages into a step-by-step 2D schematic animation
that is accurate enough to put in front of a technician, for any question, not
a fixed catalogue?

## Scope, as narrowed on 8 Oct

**Only procedures are animated.** The first results showed that an explanation
or a fault-code meaning has nothing to move: it came out as a highlighted box
beside the manual's sentence. Adil agreed to drop those. They are answered in
text as before. The switch is `SHOW_EXPLANATIONS` in `spikes/animation/scene.js`.

## What was built

Code in `spikes/animation/`, tests in `backend-node/tests/unit/animationSpike.test.js`.

| Stage | Who does it | What stops a mistake |
|---|---|---|
| 1. Find the passages | The existing retrieval service | Only passages for the asked model are used |
| 2. Pull out facts (steps, values, warnings) | A model | Each fact must quote the manual word for word, and its verb, object and value must be in that quote (`facts.js`) |
| 3. Read wiring | Code, never a model | Terminal tables are parsed directly; a blank cell is reported as missing, never filled in |
| 4. Arrange the steps | A model | Every step must point at verified facts and follow the manual's order (`scene.js`) |
| 5. Repair | Code | Removes what fails a check, restores the manual's order, adds back a step or safety note the model left out |
| 6. Draw | Code | What moves and which way comes from each fact's verified verb and object, not from the model |
| 7. Captions | Code | The words on screen are the manual's own; the model writes none |

**What the checks look at** is relationships, not just labels: which terminal
joins which, which way a part moves ("remove" cannot be drawn as fitting on),
what order the steps come in, and what value is shown.

**How a step is drawn.** Each part gets a generic picture chosen from the
manual's own name for it (indoor unit, cover, screw, cable, control board,
holder, remote, button). "Remove" and "open" lift a part off a dashed outline,
"attach" and "secure" bring it in, "loosen" and "tighten" turn a screw, and
wiring draws one wire per connection between numbered terminals. Shapes and
positions are schematic. Nothing about where a part sits on the real unit is
claimed, and the stage says so.

## Results

Twelve questions, two models (`gpt-6-luna` and `gpt-6-sol`), four runs.
Figures are from the fourth run.

| | gpt-6-luna | gpt-6-sol |
|---|---|---|
| Procedures animated, of 4 | 3 | 3 |
| Correctly shown nothing, of the 8 other questions | 8 | 8 |
| Shown exactly as the model proposed, with no repair | 1 of 3 | 2 of 3 |
| Model calls that returned usable structured output | 21 of 21 | 22 of 22 |
| Proposed facts thrown out by the checks | 7 of 92 | 2 of 91 |
| Model time per animation shown | 22 s | 19 s |
| Cost per animation shown | $0.0019 | $0.0305 |

Model time is the two model calls only; the search and drawing are extra.

**The 4 procedures:** filter cleaning, drain-hose installation, connecting the
indoor/outdoor cable, and reading a fault with the TIMER indicator blinking.

**The one not animated:** drain-hose installation, by both models. The
passages the search returned only say "Replace the drain hose".

**The 8 others:** four explanations (not animated, by scope), two questions
with no model given (both models asked for the model), one off-topic question
and one about a model that is not in the manuals (both declined).

### Against the plan's go criteria

| Criterion | Result |
|---|---|
| At least 80% of replies usable | Met: 43 of 43, no retries |
| No ungrounded element on screen | Met for what the checks cover (see Limits) |
| Every adversarial case rejected | Met: 20 wrong-but-plausible scenes and 12 bad facts, all caught |
| An under-specified job lists what is missing | Met: the cable scene reports that wire colours and one table column are not in the text |
| Unsupported and ambiguous questions decline or ask | Met: 4 of 4, both models, in all four runs |
| Two teammates judge every shown procedure correct | **Not done** |
| At least 70% rated helpful | **Not done** |
| Time and cost recorded | Done |

## What the test found

1. **The search, not the animation, was the first obstacle.** With the question
   sent as asked, five of the eight answerable questions came back with
   specification tables and parts lists, and both models correctly declined.
   The model number in the question text pulls in the pages that repeat it
   most. With the model used only as a filter, the right pages came back (drain
   hose p.49, error H11 p.92 to 95, filter care p.33). The app sends the model
   number in the text today, so its ordinary answers are affected too.
2. **Models do not follow the rules reliably.** In the fourth run only 3 of the
   6 shown scenes were valid as proposed. The repair step is what makes the
   rest showable. Typical slips: a rotation arrow tied to the wrong sentence,
   wiring placed before the cover is removed, two pages' procedures woven
   together.
3. **The models' own drawing instructions were thin.** In the third run 43 of
   the 67 drawings they asked for were highlights, and several steps had none.
   Two things changed as a result: explanations are no longer animated, and
   the drawing is now built from the verified facts instead.
4. **What the model fails to pick up is invisible to the checks.** In an early
   trial `gpt-6-luna` extracted five facts for the cable job and missed the
   earth-wire warning and the "do not use joint cable" rule. The checks pass
   such a scene, because nothing in it is wrong. The review sheet lists
   safety-worded sentences on the same pages that no fact covers, for a person
   to judge.
5. **Results vary between runs.** The drain-hose question was declined in three
   runs and given a one-line scene in one. Extraction is not repeatable.
6. **The manual text limits what can be drawn.** Wire colours, diagrams and
   the filter-removal steps are in page images, not in the extracted text.
   They are reported as missing. The filter-cleaning animation is the manual's
   cautions, not a cleaning procedure, because the text has no procedure.

## Limits of this test

- **Not a clean held-out test.** The checks and prompts were changed between
  runs using what each run showed, and the cable and filter questions were
  already used in earlier development.
- **Deviations from the plan:** captions are the manual's wording, not the
  model's; a repair step was added (the plan only rejected); drawings come
  from the facts, not the model's scene; the search text drops the model
  number after the first run; explanations are out of scope. The first run is
  kept as the baseline (`results/run1-first-full.json`).
- **The checks compare words.** A fact whose quote is real but whose meaning
  the model misread can pass.
- **Warning placement is only partly checked.** Prerequisites must come before
  the first action. Other warnings must appear, but not at a particular step.
- **The drawings are generic.** A "cover" is drawn as a plate with four screws
  whatever the real cover looks like.
- **Only seen in a browser.** The player is a web page for review. The app
  would need the same drawing code written for React Native.
- **Not built:** the signed answer reference, login check and rate limits from
  the plan. They belong to the build, if there is one.

## Cost

$1.06 of the $5 cap, across four full runs and one two-question trial. The cap
is enforced by the runner (`results/ledger.json`). The budget for testing and
building together is $10.

## Decision needed

After the review, one of:

- **Go:** build it into the app for procedures.
- **More testing first**, for example on the manuals with poorer text.
- **Stop.**

The automatic results support building it for procedures. They do not yet show
that technicians would find it correct or useful.

## Running it

Needs the retrieval service on port 8001 and `OPENAI_API_KEY` in `.env`.

```powershell
node spikes/animation/run.js                          # all questions, both models
node spikes/animation/run.js --only cable --models gpt-6-luna
node spikes/animation/run.js --search as-asked        # repeat the first run's search
node spikes/animation/report.js                       # rebuild results/review.html
```

Add `#sheet` to the review page's address to see every step of every animation
at once, without movement.
