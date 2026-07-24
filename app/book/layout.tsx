/**
 * `/book` is authoritative lead capture, not self-booking.
 *
 * It records a request against an active database clinic and makes no slot,
 * confirmation, SMS, or calendar promise. The separate `self-booking` feature
 * remains unavailable until staffing hours and live calendar controls pass.
 */
export default function BookLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
