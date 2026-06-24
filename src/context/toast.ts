import { createContext, useContext } from 'react';

export type ToastVariant = 'success' | 'danger' | 'warning' | 'default';

export interface Toast {
  id: string;
  message: string;
  title?: string;
  variant: ToastVariant;
}

export interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
