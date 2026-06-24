import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Flash, IconButton } from '@primer/react';
import { XIcon } from '@primer/octicons-react';
import { ToastContext, type Toast } from './toast';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, number>>({});

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = timers.current[id];
    if (handle) {
      window.clearTimeout(handle);
      delete timers.current[id];
    }
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : String(Date.now() + Math.random());
      setToasts((prev) => [...prev, { ...toast, id }]);
      const ttl = toast.variant === 'danger' ? 9000 : 5000;
      timers.current[id] = window.setTimeout(() => removeToast(id), ttl);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="toaster" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <Flash key={toast.id} variant={toast.variant} className="toast">
            <div className="toast__body">
              <div>
                {toast.title && <strong className="toast__title">{toast.title}</strong>}
                <span>{toast.message}</span>
              </div>
              <IconButton
                icon={XIcon}
                aria-label="Dismiss notification"
                variant="invisible"
                size="small"
                onClick={() => removeToast(toast.id)}
              />
            </div>
          </Flash>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
