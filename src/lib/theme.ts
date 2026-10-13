import { useColorScheme } from 'react-native';

const light = {
  bg: '#F4F3EF',
  card: '#FFFFFF',
  text: '#141414',
  muted: '#6B6B6B',
  border: '#E2E0D9',
  accent: '#D9481C', // цвет «железа и мела» — поменяйте под свой бренд
  accentText: '#FFFFFF',
  success: '#1F8A4C',
  warning: '#B7791F',
  danger: '#C0392B',
};

const dark: typeof light = {
  bg: '#0F0F0F',
  card: '#1A1A1A',
  text: '#F2F2F2',
  muted: '#9A9A9A',
  border: '#2A2A2A',
  accent: '#F05A28',
  accentText: '#FFFFFF',
  success: '#3FB871',
  warning: '#E0A43A',
  danger: '#E5584A',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
