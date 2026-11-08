import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import ExpandableImage from './ExpandableImage';

export default function SourceItem({ source }) {
  const [expanded, setExpanded]       = useState(false);
  const hasImages = source.images && source.images.length > 0;

  return (
    <View style={s.sourceContainer}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)} style={s.sourceRow}>
        <Text style={s.sourceItem}>
          • {source.filename || source.document_group_id}{source.page ? ` — p.${source.page}` : ''}
        </Text>
      </TouchableOpacity>

      {expanded && hasImages && (
        <View style={s.imageDropdown}>
          {source.images.map((img, imgIdx) => (
            <View key={imgIdx} style={s.imageCard}>
              <ExpandableImage uri={img.url} style={s.thumbnail}
                accessibilityLabel={img.caption || `Manual picture, page ${source.page}`} />
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
