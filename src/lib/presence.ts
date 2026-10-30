/** How often an open dashboard reports that its user is still there. */
export const PRESENCE_HEARTBEAT_MS = 60_000;

/** An account counts as online when its last heartbeat is newer than this. */
export const ONLINE_WINDOW_MS = 3 * 60_000;

export function isOnline(lastSeenAt: string | null | undefined, now = Date.now()) {
  if (!lastSeenAt) return false;
  return now - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

export function lastSeenLabel(lastSeenAt: string | null | undefined, now = Date.now()) {
  if (isOnline(lastSeenAt, now)) return "Online";
  if (!lastSeenAt) return "Offline";
  const mins = Math.floor((now - new Date(lastSeenAt).getTime()) / 60_000);
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  return `Last seen ${Math.floor(hours / 24)}d ago`;
}
