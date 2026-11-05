import { Pressable, Text, type TextStyle } from 'react-native';
import { type, useTheme } from './theme';

interface Props {
  label: string;
  onPress: () => void;
  tone?: 'muted' | 'accent' | 'danger';
  disabled?: boolean;
  style?: TextStyle;
}

/** The only button style Daily needs: quiet text with a generous hit area. */
export function PressableText({ label, onPress, tone = 'muted', disabled, style }: Props) {
  const t = useTheme();
  const color = tone === 'accent' ? t.accent : tone === 'danger' ? t.danger : t.muted;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.5 : 1 })}
    >
      <Text style={[type.ui, { color }, style]}>{label}</Text>
    </Pressable>
  );
}
