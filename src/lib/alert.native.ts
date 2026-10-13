import { Alert } from 'react-native';

export const showAlert: typeof Alert.alert = (...args) => Alert.alert(...args);

export function confirmDialog(title: string, message: string, okText: string, cancelText: string) {
  return new Promise<boolean>((resolve) =>
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: okText, onPress: () => resolve(true) },
    ]),
  );
}
