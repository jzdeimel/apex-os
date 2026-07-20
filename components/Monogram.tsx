import type { Client } from "@/lib/types";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function Monogram({ client, size = "md" }: { client: Client; size?: "sm" | "md" | "lg" }) {
  const dims = size === "sm" ? "h-8 w-8 text-detail" : size === "lg" ? "h-12 w-12 text-body" : "h-9 w-9 text-body";
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold text-ink-950", dims)}
      style={{ background: `linear-gradient(135deg, ${client.avatarColor}, ${client.avatarColor}aa)` }}
    >
      {initials(client.firstName, client.lastName)}
    </span>
  );
}
