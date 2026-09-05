'use client';
import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isDestructive = false,
}: ConfirmDialogProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap + ESC to close
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);

    // Focus modal on open
    modalRef.current?.focus();

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [isOpen, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-description"
        >
          {/* Overlay */}
          <motion.div
            className="absolute inset-0 bg-black/80"
            onClick={onCancel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            tabIndex={-1}
            className="relative bg-card text-card-foreground border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden outline-none flex flex-col"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card/95">
              <div className="flex items-center gap-3">
                {isDestructive && (
                  <div className="p-1.5 rounded-lg bg-destructive/10 text-destructive">
                    <AlertTriangle size={18} aria-hidden="true" />
                  </div>
                )}
                <h3 id="confirm-dialog-title" className="text-base font-semibold text-card-foreground">
                  {title}
                </h3>
              </div>
              <button
                onClick={onCancel}
                aria-label="Close dialog"
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary outline-none"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Content */}
            <div className="px-5 py-6">
              <div id="confirm-dialog-description" className="text-sm text-muted-foreground leading-relaxed">
                {message}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-border bg-card/95 flex justify-end gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-foreground bg-secondary hover:bg-secondary/80 rounded-xl transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {cancelText}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                }}
                className={`px-4 py-2 text-sm font-medium rounded-xl transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 ${
                  isDestructive
                    ? 'bg-destructive text-destructive-foreground hover:opacity-90 focus-visible:ring-destructive shadow-sm shadow-destructive/20'
                    : 'bg-primary text-primary-foreground hover:opacity-90 focus-visible:ring-primary shadow-sm shadow-primary/20'
                }`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
