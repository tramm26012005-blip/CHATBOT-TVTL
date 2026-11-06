/** Separate customer appointments from the expert/admin work portals. */
export function roleDestination(role: string | undefined, path: string): string | null {
  if (!role || ["/login", "/register", "/forgot-password", "/reset-password", "/privacy"].includes(path)) return null;
  if (role === "admin") return path === "/admin" ? null : "/admin";
  if (role === "expert") return path === "/expert" ? null : "/expert";
  if (role === "student") {
    if (path === "/expert" || path.startsWith("/expert/")) return "/bookings";
    if (path === "/admin" || path.startsWith("/admin/")) return "/";
    return null; // /experts is the customer's verified expert directory.
  }
  return "/login";
}
