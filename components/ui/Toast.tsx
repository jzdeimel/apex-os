"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "info" | "warn";
interface Toast {
  id: number;
  title: string;
  desc?: string;
  tone: ToastTone;
}

interface ToastApi {
  toast: (title: string, opts?: { desc?: string; tone?: ToastTone }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let tid = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((title: string, opts?: { desc?: string; tone?: ToastTone }) => {
    const id = ++tid;
    setToasts((t) => [...t, { id, title, desc: opts?.desc, tone: opts?.tone ?? "success" }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "warn" ? AlertTriangle : Info;
          const color = t.tone === "success" ? "text-optimal" : t.tone === "warn" ? "text-high" : "text-gold-300";
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-850/95 p-3 shadow-card backdrop-blur animate-fade-up"
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", color)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-50">{t.title}</p>
                {t.desc && <p className="mt-0.5 text-xs text-ink-400">{t.desc}</p>}
              </div>
              <button onClick={() => dismiss(t.id)} className="text-ink-500 hover:text-ink-200">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  // Safe no-op fallback so components can call toast() even outside the provider.
  return ctx ?? { toast: () => {} };
}
