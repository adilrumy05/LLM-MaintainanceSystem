// utils/endpointing.js
//
// Decides when a spoken turn has ended, from the recorder's metering level
// (dBFS, roughly -160 silent to 0 loudest).
//
// This is amplitude, not speech recognition: it hears loudness. A plant room's
// machinery can sit well above a quiet office, so the threshold is relative to
// the noise floor measured when listening starts, not a fixed number. Whether
// that is good enough in real noise is exactly what the device test decides.
//
// Kept free of React and native modules so it can be unit-tested with synthetic
// levels. CommonJS so the backend Jest suite can require it directly.

const DEFAULTS = {
  calibrationMs: 500,      // listen to the room before judging speech
  speechAboveFloorDb: 12,  // this far above the floor counts as speech
  voiceAboveFloorDb: 6,    // above this, a voice is still trailing off
  minSpeechMs: 250,        // ignore clicks and single bangs
  silenceMs: 1300,         // quiet this long after speech ends the turn
  noSpeechTimeoutMs: 8000, // nobody spoke at all
  maxMs: 30000,            // never record indefinitely
  floorMinDb: -75,
  floorMaxDb: -20,         // a floor louder than this means speech during calibration
};

function createEndpointer(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const calibration = [];
  let startedAt = null;
  let lastAt = null;
  let floor = null;
  let speechMs = 0;
  let speechStarted = false;
  let lastVoiceAt = null;
  let finished = false;

  const clampFloor = (db) => Math.min(cfg.floorMaxDb, Math.max(cfg.floorMinDb, db));

  /**
   * Feed one metering sample.
   * @returns {{ event: 'none'|'speech_start'|'end'|'no_speech', floor: number|null, level: number }}
   */
  function push(levelDb, now) {
    const level = Number.isFinite(levelDb) ? levelDb : -160;
    if (startedAt === null) { startedAt = now; lastAt = now; }
    const elapsed = now - startedAt;
    const dt = Math.max(0, now - lastAt);
    lastAt = now;

    if (finished) return { event: 'none', floor, level };

    if (elapsed < cfg.calibrationMs) {
      calibration.push(level);
      return { event: 'none', floor, level };
    }

    if (floor === null) {
      // The quieter quarter of the calibration window, so someone who starts
      // talking immediately does not become the "noise floor".
      const sorted = calibration.length ? [...calibration].sort((a, b) => a - b) : [level];
      floor = clampFloor(sorted[Math.floor(sorted.length / 4)]);
    }

    if (level >= floor + cfg.speechAboveFloorDb) {
      speechMs += dt;
      if (!speechStarted && speechMs >= cfg.minSpeechMs) {
        speechStarted = true;
        lastVoiceAt = now;
        return { event: 'speech_start', floor, level };
      }
    } else if (!speechStarted) {
      // Brief noise that never became speech does not accumulate forever.
      speechMs = Math.max(0, speechMs - dt / 2);
      // Let the floor follow the room downward, never upward, so speech cannot
      // raise its own threshold.
      if (level < floor) floor = clampFloor(floor * 0.9 + level * 0.1);
    }

    if (level >= floor + cfg.voiceAboveFloorDb) lastVoiceAt = now;

    if (speechStarted && now - lastVoiceAt >= cfg.silenceMs) {
      finished = true;
      return { event: 'end', floor, level };
    }
    if (elapsed >= cfg.maxMs) {
      finished = true;
      return { event: speechStarted ? 'end' : 'no_speech', floor, level };
    }
    if (!speechStarted && elapsed >= cfg.noSpeechTimeoutMs) {
      finished = true;
      return { event: 'no_speech', floor, level };
    }
    return { event: 'none', floor, level };
  }

  return { push, get speechStarted() { return speechStarted; }, config: cfg };
}

module.exports = { createEndpointer, ENDPOINTING_DEFAULTS: DEFAULTS };
