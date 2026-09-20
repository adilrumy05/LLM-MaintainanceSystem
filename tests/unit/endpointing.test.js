// End-of-utterance detection for hands-free mode, driven by synthetic metering.
// These prove the logic does what it claims on clean signals. They do NOT prove
// it works with a real microphone in a noisy room - only the device test can.

const { createEndpointer } = require('../../LLM-Mobile/utils/endpointing');

const STEP = 100; // recorder state updates every 100 ms

/** Run a sequence of [levelDb, durationMs] segments; return events with timestamps. */
function run(segments, options) {
  const ep = createEndpointer(options);
  const events = [];
  let t = 0;
  for (const [level, duration] of segments) {
    for (let d = 0; d < duration; d += STEP) {
      const { event } = ep.push(level, t);
      if (event !== 'none') events.push({ event, t });
      t += STEP;
    }
  }
  return events;
}

describe('endpointing', () => {
  test('quiet room: speech then silence ends the turn', () => {
    const events = run([[-60, 600], [-25, 2000], [-60, 2000]]);
    expect(events.map((e) => e.event)).toEqual(['speech_start', 'end']);
    // The last voiced sample is at 2500 ms; the turn ends 1.3 s after it, not before.
    const end = events.find((e) => e.event === 'end').t;
    expect(end).toBeGreaterThanOrEqual(2500 + 1300);
    expect(end).toBeLessThan(2500 + 1300 + 300);
  });

  test('a pause shorter than the silence window does not cut the speaker off', () => {
    const events = run([[-60, 600], [-25, 1000], [-60, 800], [-25, 1000], [-60, 2000]]);
    expect(events.filter((e) => e.event === 'end')).toHaveLength(1);
    expect(events.find((e) => e.event === 'end').t).toBeGreaterThan(3400);
  });

  test('noisy room: a raised floor still separates a louder voice', () => {
    // Constant machinery at -35 dB; voice at -18 dB.
    const events = run([[-35, 600], [-18, 1500], [-35, 2000]]);
    expect(events.map((e) => e.event)).toEqual(['speech_start', 'end']);
  });

  test('noise as loud as the voice never counts as speech', () => {
    // The honest failure mode: amplitude cannot tell a voice from equal noise.
    const events = run([[-30, 600], [-29, 9000]]);
    expect(events.map((e) => e.event)).toEqual(['no_speech']);
  });

  test('a single bang is not speech', () => {
    const events = run([[-60, 600], [-10, 100], [-60, 9000]]);
    expect(events.map((e) => e.event)).toEqual(['no_speech']);
  });

  test('nobody speaks: gives up after the no-speech timeout', () => {
    const events = run([[-60, 10000]]);
    expect(events).toEqual([{ event: 'no_speech', t: 8000 }]);
  });

  test('continuous speech is capped at the maximum duration', () => {
    const events = run([[-60, 600], [-20, 40000]]);
    expect(events.map((e) => e.event)).toEqual(['speech_start', 'end']);
    expect(events[1].t).toBe(30000);
  });

  test('talking from the very first moment still ends correctly', () => {
    // Real speech dips between syllables. The floor is taken from the quieter
    // quarter of calibration, so those dips - not the voice - set the threshold.
    const syllables = Array.from({ length: 20 }, (_, i) => [i % 2 ? -45 : -15, 100]);
    const events = run([...syllables, [-60, 2500]]);
    expect(events.map((e) => e.event)).toEqual(['speech_start', 'end']);
  });

  test('KNOWN LIMIT: an unbroken sound from the first instant becomes the floor', () => {
    // A perfectly steady voice (or noise) during calibration is indistinguishable
    // from a loud room, so it is never detected as speech. Recorded here so the
    // limit is explicit; the app mitigates it by cueing when listening starts.
    const events = run([[-15, 2000], [-60, 7000]]);
    expect(events.map((e) => e.event)).toEqual(['no_speech']);
  });

  test('missing metering is treated as silence, not a crash', () => {
    const ep = createEndpointer();
    expect(() => ep.push(undefined, 0)).not.toThrow();
    expect(ep.push(NaN, 600).event).toBe('none');
  });
});
