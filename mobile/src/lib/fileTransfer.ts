import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Hands a generated file to the user on a phone.
 *
 * Split out of exporters.ts because both halves of this are native-only: the new
 * `File` API resolves a real path under the app's cache, and `expo-sharing` opens a
 * platform share sheet. Neither exists in a browser, and expo-file-system's web
 * implementation does not provide `Paths.cache`, so importing it directly made the
 * web bundle depend on an API that cannot work there. fileTransfer.web.ts replaces
 * it with a Blob download.
 */
export const saveAndShare = async (
  contents: string,
  fileName: string,
  mimeType: string
): Promise<void> => {
  const file = new File(Paths.cache, fileName);
  // BOM for UTF-8 so the CSV opens correctly in Excel.
  file.write(mimeType === 'text/csv' ? '\uFEFF' + contents : contents);
  try {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Sharing is not available on this device');
    }
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
  } finally {
    file.delete();
  }
};

/** Reads a picked file as text, refusing anything over `maxBytes`. */
export const readTextFile = async (uri: string, maxBytes: number): Promise<string> => {
  let text: string;
  try {
    text = await new File(uri).text();
  } catch (error) {
    // Expo's own message for an oversized read is the most useful thing we can show.
    if (error instanceof Error && error.message.includes('large')) throw error;
    throw new Error('Failed to read backup file');
  }
  if (text.length > maxBytes) {
    throw new Error('That backup file is too large to open (over 25 MB).');
  }
  return text;
};