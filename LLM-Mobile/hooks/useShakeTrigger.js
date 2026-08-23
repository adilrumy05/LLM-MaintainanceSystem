// hooks/useShakeTrigger.js
//
// Fires a callback when the device is shaken — hands-free alternative
// trigger for voice recording. Threshold is a starting guess, not tuned —
// test on a real device before trusting it.

import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';

const SHAKE_THRESHOLD = 1.8; // magnitude delta (in g) considered a shake spike — TUNE THIS
const COOLDOWN_MS = 1000;    // minimum time between triggers, prevents double-fire on one shake

export function useShakeTrigger(onShake, { enabled = true, updateInterval = 100 } = {}) {
  const lastTrigger = useRef(0);
  const lastMagnitude = useRef(0);
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;

  useEffect(() => {
    if (!enabled) return;

    Accelerometer.setUpdateInterval(updateInterval);
    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const delta = Math.abs(magnitude - lastMagnitude.current);
      lastMagnitude.current = magnitude;

      const now = Date.now();
      if (delta > SHAKE_THRESHOLD && now - lastTrigger.current > COOLDOWN_MS) {
        lastTrigger.current = now;
        onShakeRef.current?.();
      }
    });

    return () => subscription.remove();
  }, [enabled, updateInterval]);
}