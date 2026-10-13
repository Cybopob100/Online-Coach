// Регистрация телефона тренера для push-уведомлений о новых записях.
// Работает в development/production-сборке (не в Expo Go) и только на реальном устройстве.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { DEMO, supabase } from './supabase';

// Показывать уведомление, даже если приложение открыто
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushStatus = 'enabled' | 'denied' | 'unsupported';

/** Запрашивает разрешение, получает токен Expo и сохраняет его в профиль. */
export async function registerForPush(userId: string, ask: boolean): Promise<PushStatus> {
  if (DEMO || !Device.isDevice) return 'unsupported';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('bookings', {
      name: 'Bookings',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask) {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return 'denied';

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('Нет EAS projectId: выполните `npx eas-cli@latest init`');
    return 'unsupported';
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
  return 'enabled';
}
