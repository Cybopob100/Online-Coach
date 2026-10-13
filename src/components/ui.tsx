import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { useColors } from '../lib/theme';

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const c = useColors();
  const bg = variant === 'primary' ? c.accent : 'transparent';
  const fg = variant === 'primary' ? c.accentText : variant === 'danger' ? c.danger : c.text;
  const border = variant === 'primary' ? c.accent : variant === 'danger' ? c.danger : c.border;
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border, opacity: inactive ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const c = useColors();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
      <TextInput
        placeholderTextColor={c.muted}
        style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }, style]}
        {...rest}
      />
    </View>
  );
}

export function Badge({ text, tone }: { text: string; tone: 'success' | 'warning' | 'danger' | 'muted' }) {
  const c = useColors();
  const color = tone === 'muted' ? c.muted : c[tone];
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  const c = useColors();
  return <Text style={{ color: c.muted, textAlign: 'center', marginTop: 48, fontSize: 15 }}>{text}</Text>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
});
