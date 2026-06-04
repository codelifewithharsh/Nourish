import { DeviceEventEmitter } from 'react-native';

export const TOAST_EVENT = '__nourish_toast__';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastPayload {
  message: string;
  type: ToastType;
}

export function showToast(message: string, type: ToastType = 'info') {
  DeviceEventEmitter.emit(TOAST_EVENT, { message, type } as ToastPayload);
}
