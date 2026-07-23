/**
 * CSRF origin check that remains correct behind Azure's reverse proxy.
 *
 * `request.url` may contain the container's internal host (`localhost`) while
 * the browser Origin contains the public Container Apps host. Host and
 * X-Forwarded-Host preserve the host the browser actually reached.
 */
export function requestIsSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost || request.headers.get("host");
  if (!requestHost) return false;
  try {
    return new URL(origin).host.toLowerCase() === requestHost.toLowerCase();
  } catch {
    return false;
  }
}
