// Link routing for the window half of the plugin. Plain string checks only:
// the browser bundle has no node:path.

// Window code cannot use node:path, so keep link math to plain string checks.
export function hrefPath(href: string) {
  if (!href.startsWith("file://")) return href;
  let p = decodeURIComponent(href.slice("file://".length));
  if (/^\/[A-Za-z]:[\\/]/.test(p)) p = p.slice(1);
  return p;
}

// A bare filename typed in chat (`README.md`) has no slash, so the host marks
// it a guess rather than an `exact` workspace path. Accept the shape here and
// let `exists` decide whether it is really a link.
export function looksLikeFileName(href: string) {
  return /^[A-Za-z0-9._@+-]+\.[A-Za-z0-9]+$/.test(href);
}

export function isFileLink(link: { href: string; exact?: boolean }) {
  const href = link.href;
  if (!href || href.startsWith("#")) return false;
  // `C:\...` and `C:/...` are drive paths, not URI schemes.
  const drive = /^[a-z]:[\\/]/i.test(href);
  if (
    !drive &&
    /^[a-z][a-z0-9+.-]*:/i.test(href) &&
    !href.startsWith("file://")
  )
    return false;
  return (
    link.exact === true ||
    drive ||
    /[\\/]/.test(href) ||
    href.startsWith("file://") ||
    looksLikeFileName(href)
  );
}

export function linkBase(link: { base?: string }, fallback: string) {
  const base = link.base;
  if (!base) return fallback;
  if (/^([A-Za-z]:[\\/]|[\\/])/.test(base) || base.startsWith("~/"))
    return base;
  return fallback ? `${fallback}/${base}` : base;
}

// Extensions the app's own preview handles better than a textarea. The list is
// space separated so it stays readable without one string per line.
const BINARY = `png jpg jpeg jpe gif webp bmp ico cur tif tiff avif heic heif svg psd mp4 m4v mov avi mkv webm flv wmv mpg mpeg mpe 3gp 3g2 ogv mts m2ts vob mp3 wav wave flac aac m4a ogg oga opus wma aiff aif mid midi amr woff woff2 ttf otf eot zip gz gzip tar tgz rar 7z bz2 xz zst lz lzma jar war apk aab deb rpm dmg iso img cab pdf doc docx xls xlsx xlsm ppt pptx pps ppsx odt ods odp epub mobi azw3 exe dll so dylib bin obj o a lib class pyc pyo pyd wasm node msi app pkg sqlite sqlite3 db db3 mdb accdb p12 pfx der`;

export const BINARY_EXTENSIONS = new Set(BINARY.trim().split(/\s+/));

export function extension(path: string) {
  const name = path.slice(
    Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1,
  );
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function isTextPath(path: string) {
  return !BINARY_EXTENSIONS.has(extension(path));
}

export function isMarkdown(path: string) {
  return /\.(md|markdown|mdown|mdx)$/i.test(path);
}

export function basenameOf(path: string) {
  return (
    path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1) ||
    path
  );
}

/** Everything before the file name, for the recent list's muted column. */
export function folderOf(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}
