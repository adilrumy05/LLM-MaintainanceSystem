import { useEffect, useState } from 'react';
import { Text } from 'react-native';

// What the app is doing while an answer is on its way, with the real time
// waited. Testers found answers slow, and a bare "Analyzing..." gave no sense
// of progress.
export default function WaitStatus({ style }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text style={style} accessibilityLiveRegion="polite">
      Searching the manuals and writing your answer{seconds > 0 ? ` · ${seconds} s` : '…'}
    </Text>
  );
}
