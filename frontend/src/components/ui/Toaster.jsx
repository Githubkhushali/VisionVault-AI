import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

export default function Toaster() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleToast = (e) => {
      const id = Date.now();
      const newToast = { id, type: e.detail.type || 'info', message: e.detail.message };
      setToasts((prev) => [...prev, newToast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    };

    window.addEventListener('toast', handleToast);
    return () => window.removeEventListener('toast', handleToast);
  }, []);

  const removeToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const isError = toast.type === 'error';
          const isSuccess = toast.type === 'success';
          const bg = isError ? 'bg-rose-500/10 border-rose-500/20' : isSuccess ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-indigo-500/10 border-indigo-500/20';
          const text = isError ? 'text-rose-400' : isSuccess ? 'text-emerald-400' : 'text-indigo-400';
          const Icon = isError ? XCircle : isSuccess ? CheckCircle : Info;

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-sm border backdrop-blur-xl shadow-2xl bg-gray-950/90 ${bg}`}
            >
              <Icon size={20} className={text} />
              <p className="text-sm font-medium text-gray-100 mr-4">{toast.message}</p>
              <button onClick={() => removeToast(toast.id)} className="text-gray-500 hover:text-white transition-colors ml-auto">
                <X size={16} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
