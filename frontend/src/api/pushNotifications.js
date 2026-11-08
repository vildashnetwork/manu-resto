import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { registerExpoPushToken } from './repo';

let handlerConfigured = false;

async function getNotificationsModule() {
  try {
    return await import('expo-notifications');
  } catch (error) {
    throw new Error(`Native notifications are unavailable in this app build. Rebuild the app with EAS: ${error.message || error}`);
  }
}

export async function configurePushNotifications() {
  if (Platform.OS === 'web' || handlerConfigured) return;
  const Notifications = await getNotificationsModule();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  handlerConfigured = true;
}

export async function registerForPushNotifications() {
  if (Platform.OS === 'web') throw new Error('Push notifications are only available in the mobile app.');
  const Notifications = await getNotificationsModule();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Business alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Allow notifications in your device settings to receive business alerts.');

  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) throw new Error('The Expo project ID is missing from this app configuration.');
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  if (!token.data) throw new Error('Expo did not return a push token. Check your internet connection and try again.');
  return token.data;
}

export async function getCurrentExpoPushToken() {
  if (Platform.OS === 'web') return null;
  const Notifications = await getNotificationsModule();
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) throw new Error('The Expo project ID is missing from this app configuration.');
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data || null;
}

export async function syncExistingPushToken() {
  const token = await getCurrentExpoPushToken();
  if (token) await registerExpoPushToken(token);
  return token;
}
