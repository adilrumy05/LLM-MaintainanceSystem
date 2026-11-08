import Toast from 'react-native-toast-message';
import { useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';

// Toasts start below the status bar. Toast's own 40 pt offset put them under
// the Dynamic Island on recent iPhones.
export default function SafeToast() {
  const insets = useSafeAreaInsets();
  const top = insets.top || initialWindowMetrics?.insets?.top || 0;
  return <Toast topOffset={top + 8} />;
}
