"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { Upload, FileText, Check, Loader2, X } from "lucide-react";

const STEPS = [
  "Uploading PDF…",
  "Running OCR…",
  "Extracting biomarkers…",
  "Mapping to Alpha Base Panel…",
  "Validating reference ranges…",
];

export function LabUploadSim({
  markerCount,
  onComplete,
  label = "Import lab PDF",
}: {
  markerCount: number;
  onComplete?: () => void;
  label?: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const [fileName, setFileName] = useState("Quest_AlphaBasePanel.pdf");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = (name?: string) => {
    if (name) setFileName(name);
    setDone(false);
    setStep(0);
    let i = 0;
    const tick = () => {
      i += 1;
      if (i < STEPS.length) {
        setStep(i);
        timer.current = setTimeout(tick, 620);
      } else {
        setStep(STEPS.length);
        setDone(true);
        toast("Lab PDF parsed", {
          desc: `${markerCount} biomarkers extracted and mapped to the Alpha Base Panel.`,
          tone: "success",
        });
        onComplete?.();
      }
    };
    timer.current = setTimeout(tick, 620);
  };

  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
    setStep(-1);
    setDone(false);
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-3.5 w-3.5" /> {label}
      </Button>

      {open && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center px-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-ink-700 bg-ink-850 p-5 shadow-glow animate-fade-up">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-ink-50">Import lab results (PDF)</h3>
              <button onClick={close} className="text-ink-500 hover:text-ink-200"><X className="h-4 w-4" /></button>
            </div>

            {step < 0 ? (
              <>
                <button
                  onClick={() => inputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-ink-600 bg-ink-900/40 px-6 py-10 text-center transition-colors hover:border-gold-400/50 hover:bg-ink-900/70"
                >
                  <Upload className="h-7 w-7 text-ink-500" />
                  <span className="text-sm font-medium text-ink-200">Drop a lab PDF or click to select</span>
                  <span className="text-[11px] text-ink-500">LabCorp · Quest · Health Gorilla (simulated parser)</span>
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => run(e.target.files?.[0]?.name)}
                />
                <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => run()}>
                  Use sample file
                </Button>
              </>
            ) : (
              <div>
                <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
                  <FileText className="h-4 w-4 text-gold-400" />
                  <span className="truncate text-sm text-ink-200">{fileName}</span>
                </div>
                <div className="space-y-2.5">
                  {STEPS.map((s, i) => {
                    const state = i < step ? "done" : i === step ? "active" : "pending";
                    return (
                      <div key={s} className="flex items-center gap-2.5 text-sm">
                        {state === "done" ? (
                          <Check className="h-4 w-4 text-optimal" />
                        ) : state === "active" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-gold-400" />
                        ) : (
                          <span className="h-4 w-4 rounded-full border border-ink-700" />
                        )}
                        <span className={cn(state === "pending" ? "text-ink-600" : state === "done" ? "text-ink-400" : "text-ink-100")}>
                          {s}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {done && (
                  <div className="mt-4 animate-fade-in rounded-lg border border-optimal/25 bg-optimal/[0.06] px-3 py-2.5 text-sm text-optimal">
                    ✓ Parsed {markerCount} biomarkers. Mapped to Alpha Base Panel — provider review required.
                  </div>
                )}
                <Button variant={done ? "primary" : "ghost"} className="mt-4 w-full" onClick={close} disabled={!done}>
                  {done ? "View results" : "Parsing…"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
