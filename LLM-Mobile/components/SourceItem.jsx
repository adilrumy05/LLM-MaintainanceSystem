import { useState } from 'react';
import { View, Text, Image, TouchableOpacity, Modal, ScrollView, Dimensions, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';

export default function SourceItem({ source }) {
  const [expanded, setExpanded]       = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const hasImages = source.images && source.images.length > 0;

  return (
    <View style={s.sourceContainer}>
      <Modal visible={!!selectedImage} transparent animationType="fade" onRequestClose={() => setSelectedImage(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <TouchableOpacity onPress={() => setSelectedImage(null)} style={{ position: 'absolute', top: 50, right: 20, zIndex: 10 }}>
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
            maximumZoomScale={5} minimumZoomScale={1} centerContent showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
            <Image source={{ uri: selectedImage }} style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.8 }} resizeMode="contain" />
          </ScrollView>
        </View>
      </Modal>

      <TouchableOpacity onPress={() => setExpanded(!expanded)} style={s.sourceRow}>
        <Text style={s.sourceItem}>
          • {source.filename || source.document_group_id}{source.page ? ` — p.${source.page}` : ''}
        </Text>
      </TouchableOpacity>

      {expanded && hasImages && (
        <View style={s.imageDropdown}>
          {source.images.map((img, imgIdx) => (
            <View key={imgIdx} style={s.imageCard}>
              {img.url ? (
                <TouchableOpacity onPress={() => setSelectedImage(img.url)} activeOpacity={0.8}>
                  <Image source={{ uri: img.url }} style={s.thumbnail} resizeMode="contain" />
                  <View style={{ position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12, padding: 4 }}>
                    <Ionicons name="expand-outline" size={14} color="#fff" />
                  </View>
                </TouchableOpacity>
              ) : null}
              {img.caption ? <Text style={s.imagePlaceholder}>{img.caption}</Text> : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  sourceContainer:  { marginBottom: 8 },
  sourceRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  sourceItem:       { fontSize: 11, color: '#6d28d9', marginBottom: 2 },
  imageDropdown:    { marginTop: 6, marginLeft: 12, padding: 8, backgroundColor: '#f9f9ff', borderRadius: 8, borderWidth: 1, borderColor: '#e0e7ff' },
  imageCard:        { marginBottom: 8, padding: 6, backgroundColor: '#fff', borderRadius: 6, alignItems: 'center' },
  imagePlaceholder: { fontSize: 12, color: '#6b7280' },
  thumbnail:        { width: 220, height: 160, borderRadius: 6, marginTop: 4 },
});