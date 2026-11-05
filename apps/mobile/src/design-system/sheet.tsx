import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space, useTheme } from './theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** Bottom sheet: the single overlay pattern in Daily (menus, date picker). */
export function Sheet({ visible, onClose, children }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[styles.sheet, { backgroundColor: t.background, paddingBottom: insets.bottom + space.l }]}>
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: {
    paddingHorizontal: space.l,
    paddingTop: space.l,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    gap: space.l,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
});
