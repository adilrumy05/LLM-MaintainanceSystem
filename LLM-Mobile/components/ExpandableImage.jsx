import { useState } from 'react';
import { View, Image, TouchableOpacity, Modal, ScrollView, useWindowDimensions, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// A manual picture that opens full screen when tapped. Testers found step
// pictures and figures too small to read, and only source thumbnails could be
// opened. Pinch zoom uses ScrollView's zoom, which works on iOS; Android and
// web show the picture full width without pinch.
export default function ExpandableImage({ uri, style, resizeMode = 'contain', accessibilityLabel = 'Manual picture' }) {
  const [open, setOpen] = useState(false);
  const { width, height } = useWindowDimensions();
  if (!uri) return null;

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.8}
        accessibilityRole="imagebutton" accessibilityLabel={`${accessibilityLabel}. Tap to enlarge`}>
        <Image source={{ uri }} style={style} resizeMode={resizeMode} />
        <View style={s.expandBadge} pointerEvents="none">
          <Ionicons name="expand-outline" size={14} color="#fff" />
        </View>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={s.backdrop}>
          <TouchableOpacity onPress={() => setOpen(false)} style={s.close}
            accessibilityRole="button" accessibilityLabel="Close picture" hitSlop={8}>
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>
          <ScrollView style={s.fill} contentContainerStyle={s.centre}
            maximumZoomScale={5} minimumZoomScale={1} centerContent
            showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
            <Image source={{ uri }} style={{ width, height: height * 0.8 }} resizeMode="contain"
              accessibilityLabel={accessibilityLabel} />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  expandBadge: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12, padding: 4 },
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  close:       { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  fill:        { flex: 1 },
  centre:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
