"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pb-3", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-base font-semibold text-ink-50", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "success";
type ButtonSize = "sm" | "md" | "icon";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-gold-500 text-white hover:bg-gold-400 font-medium",
  secondary: "bg-ink-700 text-ink-50 hover:bg-ink-600",
  ghost: "text-ink-300 hover:text-ink-50 hover:bg-ink-800",
  outline: "border border-ink-600 text-ink-200 hover:border-ink-500 hover:bg-ink-800",
  danger: "bg-high/15 text-high border border-high/30 hover:bg-high/25",
  success: "bg-optimal/15 text-optimal border border-optimal/30 hover:bg-optimal/25",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  icon: "h-9 w-9",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-lg transition-colors focus-ring disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "gold" | "optimal" | "watch" | "low" | "high" | "info";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-ink-700/60 text-ink-200 border-ink-600/60",
    gold: "bg-gold-400/12 text-gold-300 border-gold-400/30",
    optimal: "bg-optimal/12 text-optimal border-optimal/30",
    watch: "bg-watch/12 text-watch border-watch/30",
    low: "bg-low/12 text-low border-low/30",
    high: "bg-high/12 text-high border-high/30",
    info: "bg-low/10 text-ink-200 border-ink-600/60",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Input / Select / Textarea
// ---------------------------------------------------------------------------
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-lg border border-ink-700 bg-ink-900/70 px-3 text-sm text-ink-100 placeholder:text-ink-500 focus-ring",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-9 w-full rounded-lg border border-ink-700 bg-ink-900/70 px-3 text-sm text-ink-100 focus-ring appearance-none",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-ink-700 bg-ink-900/70 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus-ring",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------
export function Progress({ value, className, tone = "gold" }: { value: number; className?: string; tone?: "gold" | "optimal" | "high" | "low" }) {
  const tones = { gold: "bg-gold-400", optimal: "bg-optimal", high: "bg-high", low: "bg-low" };
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-ink-700/70", className)}>
      <div className={cn("h-full rounded-full", tones[tone])} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------
export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("font-display text-lg font-semibold text-ink-50", className)}>{children}</h2>;
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
export function EmptyState({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-700 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-500">{icon}</div>}
      <p className="text-sm font-medium text-ink-300">{title}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
