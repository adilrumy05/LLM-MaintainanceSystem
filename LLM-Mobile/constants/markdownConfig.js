import { View, ScrollView, StyleSheet, Text, Platform } from 'react-native';
import { C } from '../theme';
import { FEATURES } from './featureFlags';

export const markdownStyles = {
  body:         { color: C.text, fontSize: 14, lineHeight: 20 },
  strong:       { fontWeight: '700' },
  bullet_list:  { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  code_inline:  { backgroundColor: '#f3f4f6', borderRadius: 4, paddingHorizontal: 4, fontFamily: 'monospace', fontSize: 12 },
  fence:        { backgroundColor: '#f3f4f6', borderRadius: 8, padding: 10, fontSize: 12, fontFamily: 'monospace' },
  heading1:     { fontSize: 18, fontWeight: '700', marginVertical: 6 },
  heading2:     { fontSize: 16, fontWeight: '700', marginVertical: 4 },
  table:        { borderWidth: 1, borderColor: C.cardBorder, borderRadius: 8, marginVertical: 4 },
  thead:        { backgroundColor: C.primaryLight },
  th:           { padding: 8, fontWeight: '700', fontSize: 12, color: C.primaryText, borderRightWidth: 1, borderColor: C.cardBorder, minWidth: 100 },
  tr:           { borderBottomWidth: 1, borderColor: C.cardBorder, flexDirection: 'row' },
  td:           { padding: 8, fontSize: 12, color: C.text, borderRightWidth: 1, borderColor: C.cardBorder, minWidth: 100 },
};

// Whether answer paragraphs are selectable in place. Not on iOS, for two
// reasons. A selectable <Text> there only offers "copy the whole paragraph"
// (facebook/react-native#13938), so it adds little. And with it on, the iPhone
// sometimes did not draw the last line of a wrapped list item: the space was
// reserved but the text was missing. Selectable text is the suspected cause,
// not a confirmed one. iOS uses the "Select text" sheet and the Copy button.
export const selectsInline = (os = Platform.OS) => FEATURES.CHAT_SELECT && os !== 'ios';

export const makeMarkdownRules = (tableScrollStyle) => ({
  // Each paragraph renders as its own <Text>, so selection works within a
  // paragraph but not across paragraphs.
  ...(selectsInline() && {
    textgroup: (node, children, parent, styles) => (
      <Text key={node.key} style={styles.textgroup} selectable>
        {children}
      </Text>
    ),
  }),
  table: (node, children) => (
    <ScrollView key={node.key} horizontal nestedScrollEnabled directionalLockEnabled showsHorizontalScrollIndicator style={tableScrollStyle}>
      <View>{children}</View>
    </ScrollView>
  ),
});