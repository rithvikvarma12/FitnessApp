import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return;

  await PushNotifications.register();

  PushNotifications.addListener('registration', async (token) => {
    console.log('FCM Token:', token.value);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase
          .from('user_profiles')
          .update({ fcm_token: token.value })
          .eq('auth_id', session.user.id);
      }
    } catch (e) {
      console.error('Failed to save FCM token:', e);
    }
  });

  PushNotifications.addListener('registrationError', (error) => {
    console.error('Push registration error:', error);
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Notification received:', notification);
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('Notification tapped:', action);
  });
}
