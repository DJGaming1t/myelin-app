import { Platform } from 'react-native';

import {
  PlannedReminder,
  ReminderSettings,
} from './reminder-engine';

export type ReminderPermission =
  | 'unsupported'
  | 'undetermined'
  | 'granted'
  | 'denied';

const GENTLE_CHANNEL = 'myelin-gentle';
const SOUND_CHANNEL = 'myelin-sound';

type ExpoNotificationsModule = typeof import('expo-notifications');
type NotificationPermissionsStatus =
  import('expo-notifications').NotificationPermissionsStatus;

async function module(): Promise<ExpoNotificationsModule> {
  return import('expo-notifications');
}

export async function configureNotificationRuntime() {
  if (Platform.OS === 'web') return;

  const Notifications = await module();

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelGroupAsync('myelin-study', {
      name: 'MYELIN study reminders',
      description: 'Study reminders you explicitly enable inside MYELIN.',
    });

    await Notifications.setNotificationChannelAsync(GENTLE_CHANNEL, {
      name: 'Gentle study nudges',
      description: 'Quiet review and exam reminders without sound.',
      groupId: 'myelin-study',
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      enableVibrate: false,
      enableLights: true,
      lightColor: '#FF805B',
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PRIVATE,
    });

    await Notifications.setNotificationChannelAsync(SOUND_CHANNEL, {
      name: 'Study reminders with sound',
      description: 'Review and exam reminders using the normal system sound.',
      groupId: 'myelin-study',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 90],
      enableLights: true,
      lightColor: '#FF805B',
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
}

function permissionFrom(
  status: NotificationPermissionsStatus,
  Notifications: ExpoNotificationsModule,
): ReminderPermission {
  if (status.granted) return 'granted';

  if (
    status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    status.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL
  ) {
    return 'granted';
  }

  if (status.status === 'denied' || status.canAskAgain === false) {
    return 'denied';
  }

  return 'undetermined';
}

export async function getReminderPermission(): Promise<ReminderPermission> {
  if (Platform.OS === 'web') return 'unsupported';
  const Notifications = await module();
  return permissionFrom(await Notifications.getPermissionsAsync(), Notifications);
}

export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (Platform.OS === 'web') return 'unsupported';

  await configureNotificationRuntime();
  const Notifications = await module();
  const status = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });

  return permissionFrom(status, Notifications);
}

export async function cancelReminderIds(ids: string[]) {
  if (Platform.OS === 'web' || !ids.length) return;

  const Notifications = await module();
  await Promise.all(
    ids.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined),
    ),
  );
}

export async function scheduleReminderPlan(
  plan: PlannedReminder[],
  settings: ReminderSettings,
) {
  if (Platform.OS === 'web') return [] as string[];

  await configureNotificationRuntime();
  const Notifications = await module();
  const channelId = settings.sound ? SOUND_CHANNEL : GENTLE_CHANNEL;
  const scheduled: string[] = [];

  try {
    for (const item of plan) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: item.title,
          subtitle: item.kind === 'review' ? 'REVIEW WINDOW' : 'EXAM CHECK-IN',
          body: item.body,
          sound: settings.sound ? 'default' : undefined,
          color: '#FF805B',
          data: {
            myelin: true,
            kind: item.kind,
            href: item.href,
            reminderKey: item.key,
            ...item.data,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(item.at),
          channelId,
        },
      });
      scheduled.push(id);
    }

    return scheduled;
  } catch (error) {
    await cancelReminderIds(scheduled);
    throw error;
  }
}

export async function sendReminderPreview(settings: ReminderSettings) {
  if (Platform.OS === 'web') return;

  const Notifications = await module();
  const channelId = settings.sound ? SOUND_CHANNEL : GENTLE_CHANNEL;

  const content =
    settings.voice === 'signal'
      ? {
          title: '3 reviews ready',
          body: 'Start with Refraction. One focused recall round is enough.',
        }
      : settings.voice === 'spark'
        ? {
            title: 'A small win is ready ✦',
            body: 'Refraction + 2 more are waiting in your review queue.',
          }
        : {
            title: 'A quiet review window',
            body: '3 reviews are ready. Refraction can be your first stop.',
          };

  await Notifications.scheduleNotificationAsync({
    content: {
      ...content,
      subtitle: 'MYELIN PREVIEW',
      sound: settings.sound ? 'default' : undefined,
      color: '#FF805B',
      data: {
        myelin: true,
        kind: 'review',
        href: '/(app)/review',
        preview: true,
      },
    },
    trigger: null,
  });
}

export async function subscribeToReminderResponses(
  onOpen: (kind: 'review' | 'exam') => void,
) {
  if (Platform.OS === 'web') return () => undefined;

  const Notifications = await module();

  const handle = (response: {
    notification: {
      request: {
        content: {
          data?: Record<string, unknown>;
        };
      };
    };
  }) => {
    const data = response.notification.request.content.data;
    if (!data || data.myelin !== true) return;
    if (data.kind === 'review' || data.kind === 'exam') {
      onOpen(data.kind);
      // Consuming the response prevents the same old notification tap from
      // routing the user again on a later ordinary app launch.
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    }
  };

  const last = await Notifications.getLastNotificationResponseAsync();
  if (last) handle(last);

  const subscription =
    Notifications.addNotificationResponseReceivedListener(handle);

  return () => subscription.remove();
}
