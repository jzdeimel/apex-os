"use client";

import { FadeIn } from "@/components/motion";
import { OrderForm } from "@/components/orders/OrderForm";

/**
 * Coach · New Order
 *
 * The screen Apex did not have. Everything else in the product could *watch* an
 * order; nothing could create one, which meant the most consequential action in
 * the clinic still happened in a system nobody could audit.
 *
 * Built phone-first on purpose: coaches place orders standing in a hallway
 * between consults, not sitting at a desk.
 */
export default function CoachNewOrderPage() {
  return (
    <div className="space-y-6">
      <FadeIn>
        <p className="label-eyebrow">COACH CONSOLE</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink-50">
          New Order
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          Pick the member, tap what they need, and see the price move as you go — with every
          problem named before Place turns on, so nothing can be silently dropped on submit.
        </p>
      </FadeIn>

      <OrderForm />
    </div>
  );
}
