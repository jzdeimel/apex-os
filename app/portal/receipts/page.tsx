"use client";

/**
 * Receipts — /portal/receipts
 *
 * Members pay for this care with pre-tax money and then lose an afternoon in
 * March reconstructing a year of charges out of email. Everything is already in
 * the chart; this page just puts it in one place and makes it exportable.
 *
 * Eligibility is flagged, never decided. The plan administrator decides, and the
 * page says so above the totals rather than underneath them.
 */

import { ReceiptVault } from "@/components/portal/ReceiptVault";
import { me, PortalPageHeader } from "@/components/portal/PortalHeader";

export default function PortalReceiptsPage() {
  const client = me();

  return (
    <div className="space-y-8">
      <PortalPageHeader
        eyebrow="Your receipts"
        title="Everything you have paid"
        subtitle="Every charge, itemised, with our honest read on what an HSA or FSA plan usually accepts. Export the year in one file when your administrator asks for it."
      />
      <ReceiptVault client={client} />
    </div>
  );
}
