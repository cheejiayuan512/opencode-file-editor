// Which filesystem a session's files live on. The window cannot decide this from
// a path: an absolute WSL path and an absolute Windows path look alike, and only
// the server the session runs on can answer for its own disk.

export type SessionServer = {
  /** `true` for the app's own server, the one started with the desktop app. */
  readonly builtin: boolean;
  /** The server's HTTP origin, as the app lists it. */
  readonly url: string;
};

/**
 * Whether the desktop's main process can reach this session's files, which is
 * only true for the app's own server. A session served by WSL, a container, or
 * a remote host reads and writes elsewhere, and asking the main process made a
 * file that exists look missing (issue #10).
 *
 * `ownUrl` is the URL of the app's own server (`sidecar` in the desktop app).
 * When it cannot be read, a builtin server is still treated as local: that is
 * the only server the app starts with this machine's disk.
 */
export function usesLocalDisk(server: SessionServer, ownUrl: string | undefined) {
  if (!server.builtin) return false;
  return !ownUrl || ownUrl === server.url;
}
