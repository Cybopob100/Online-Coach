// Веб-версия: push-уведомления доступны только в приложении на телефоне (push.native.ts).
export type PushStatus = 'enabled' | 'denied' | 'unsupported';

export async function registerForPush(_userId: string, _ask: boolean): Promise<PushStatus> {
  return 'unsupported';
}
