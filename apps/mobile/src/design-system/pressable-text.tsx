import { Text, type TextStyle } from 'react-native';
import { PressScale } from './press-scale';
import { type, useTheme } from './theme';

interface Props {
  label: string;
  onPress: () => void;
  tone?: 'muted' | 'accent' | 'danger';
  disabled?: boolean;
  style?: TextStyle;
}

/** The only button style Daily needs: quiet text with a generous hit area and physical press feedback. */
export function PressableText({ label, onPress, tone = 'muted', disabled, style }: Props) {
  const t = useTheme();
  const color = tone === 'accent' ? t.accent : tone === 'danger' ? t.danger : t.muted;
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text style={[type.ui, { color }, style]}>{label}</Text>
    </PressScale>
  );
}
