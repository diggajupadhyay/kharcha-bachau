/**
 * Browser equivalents of the native file handoff.
 *
 * A browser has no share sheet and no cache directory, so the two native calls are
 * replaced by the platform's own primitives: a temporary object URL behind a
 * synthetic download link, and `fetch` for reading a picked blob.
 *
 * Both keep the native module's contract exactly — same names, same arguments, same
 * errors — so exporters.ts stays platform-agnostic and neither build carries the
 * other's code.
 */

/** Saves by downloading. The browser's download tray is its share sheet. */
export const saveAndShare = async (
  contents: string,
  fileName: string,
  mimeType: string
): Promise<void> => {
  // Same BOM as the native path so a CSV opens correctly in Excel here too.
  const body = mimeType === 'text/csv' ? '\uFEFF' + contents : contents;
  const blob = new Blob([body], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    // Safari ignores a detached click in some versions, so it goes in the document.
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Releasing the object URL immediately can cancel the download in Firefox.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
};

/** Reads a picked file as text, refusing anything over `maxBytes`. */
export const readTextFile = async (uri: string, maxBytes: number): Promise<string> => {
  let text: string;
  try {
    const response = await fetch(uri);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    text = await response.text();
  } catch {
    throw new Error('Failed to read backup file');
  }
  if (text.length > maxBytes) {
    throw new Error('That backup file is too large to open (over 25 MB).');
  }
  return text;
};