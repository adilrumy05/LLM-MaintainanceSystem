# Animations

A step-by-step answer can be drawn as a 2D schematic animation. The client
approved it on 9 Oct 2026 as a toggle that is **off by default**, because each
animation costs money and may not be produced at all.

**Status, 10 Oct 2026: built and tested, switched off.** The server route, the
Animate toggle, the card under an answer and the player are in place. Both
switches are off: `ANIMATIONS_ENABLED` on the server and `ANIMATIONS` in
`LLM-Mobile/constants/featureFlags.js`. Still to do before testers see it:

1. ~~A check on an iPhone.~~ Done by Adil on 11 Oct 2026 with both switches
   on: toggle, notice, card and player worked, including the login check on
   `/api/animate` with a real account.
2. Two people who know the equipment review the cable, filter and TIMER
   animations against the manual pages.

How well it works, and its limits, are in [ANIMATION_SPIKE.md](ANIMATION_SPIKE.md).

## How it works

1. The app sends `animate: true` with a question when the toggle is on.
2. `/api/query` answers as usual. If the answer has guided steps, the server
   keeps the manual passages the answer was written from, under a random
   `animationRef`, and returns the reference. Nothing is generated yet.
3. The app sends `POST /api/animate { animationRef }` with the user's Firebase
   ID token.
4. The server runs the checked pipeline on its own copy of the passages and
   returns one of:

| `status` | Meaning |
|---|---|
| `ready` | `animation` holds the parts, steps, drawings and captions |
| `unavailable` | Nothing can be shown. `reason` and `message` say why; `missing` lists what the manual text lacks |
| `failed` | A model call failed. The app may retry |

`unavailable` reasons: `expired` (the reference is older than 2 hours or the
server restarted), `not_enough_detail`, `model_needed`, `not_a_procedure`,
`daily_limit`.

The caller never sends manual text or a question to `/api/animate`, so an
animation can only be drawn from passages the answer itself used.

## In the app

- **Animate chip** beside the message box, off by default and remembered per
  user. The first time it is turned on, a notice explains that an animation
  may not be produced, that drawings are schematic, and that each one costs a
  few cents.
- **Animation card** under a step-by-step answer: being made (with Cancel),
  ready (the player), not available (with what the manual text lacks), or
  failed (with Retry). An animation left unfinished when the app closed shows
  as interrupted, with Retry.
- **Player:** Play/Pause, Back, Next and All steps. Under each drawing are the
  manual's own words with the page. With Reduce Motion on, each step is a
  still picture of its end position.
- The animation is stored on the message, so it replays without the server.
- Hands-free questions are never animated.

## Limits

| Limit | Value | Where |
|---|---|---|
| Who | Signed-in users; a reference works only for the account it was issued to | `requireUser.js`, `service.js` |
| Per user | 3 a minute, 30 a day (HTTP 429) | `service.js` |
| All users | `ANIMATION_DAILY_USD` a day, default $1, counted from token usage | `service.js` |
| Request body | 2 KB | `server.js` |
| Repeats | A repeated request joins the running one; a finished result is reused | `service.js` |

References, counts and the day's spend are kept in memory. A restart clears
them: the count starts again and the app is told to ask again.

The route writes no audit record and raises no alert or task.

## Settings (`.env`)

```
ANIMATIONS_ENABLED=false     # true to allow animations
ANIMATION_MODEL=gpt-6-sol
ANIMATION_DAILY_USD=1
```

## Code

- `backend-node/server/services/animation/`
  - `facts.js`, `scene.js`: the checks. No model is called here.
  - `prompts.js`: the two prompts and their schemas.
  - `pipeline.js`: passages → facts → scene, and the model call.
  - `service.js`: references, limits and the spending cap.
- `backend-node/server/middleware/requireUser.js`: verifies the ID token.
- `LLM-Mobile/`
  - `utils/animationScene.js`: what is drawn for a step, from the checked facts.
  - `components/animation/Parts.jsx`, `Stage.jsx`, `Player.jsx`: the drawing
    (`react-native-svg`) and the player.
  - `components/AnimationCard.jsx`, `components/AnimateChip.jsx`.
  - `services/api.js`: `animateAnswer()`.
  - Tests: `tests/animationScene.test.js`, `AnimationCard.test.js`,
    `AnimateChip.test.js`, `api.animate.test.js`, `dashboard.animate.test.js`.
- Backend tests: `tests/unit/animationChecks.test.js`, `tests/unit/animationPipeline.test.js`,
  `tests/endpoints/animate.test.js`.
- `spikes/animation/run.js` still runs the 12 test questions through the same
  pipeline, under its own $5 cap.

## Live check, 10 Oct 2026

Two real answers through the service with `gpt-6-sol` (login check skipped):
the cable question gave 9 steps in 18 s for $0.042; the TIMER question gave
7 steps in 13 s for $0.030. A repeated request reused the result.
