"use client";
import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              className={`pointer-events-auto flex w-80 items-start gap-3 p-4 rounded-xl shadow-xl border backdrop-blur-md ${
                toast.type === 'error'
                  ? 'bg-destructive/10 border-destructive/20 text-destructive'
                  : toast.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                  : 'bg-card/80 border-border text-card-foreground'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {toast.type === 'error' && <AlertCircle size={20} />}
                {toast.type === 'success' && <CheckCircle size={20} />}
                {toast.type === 'info' && <Info size={20} className="text-primary" />}
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <span className="text-sm font-semibold">{
                  toast.type === 'error' ? 'Error' : toast.type === 'success' ? 'Success' : 'Information'
                }</span>
                <span className="text-sm opacity-90">{toast.message}</span>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 rounded-md p-1 opacity-50 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
