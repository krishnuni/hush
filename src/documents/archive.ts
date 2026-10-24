/** Validate ZIP central-directory resource budgets before decompressing an EPUB. ZIP64 is explicitly unsupported. */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
export const MAX_INFLATED_BYTES = 256 * 1024 * 1024;
export const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
export const MAX_ENTRIES = 5000;

export function safeArchivePath(path: string): boolean {
  return (
    !!path &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.includes('\0') &&
    !/^[a-z]:/i.test(path) &&
    !path.split('/').includes('..')
  );
}
export function validateArchive(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_DOCUMENT_BYTES)
    throw new Error('This development build supports documents up to 50 MiB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('The EPUB archive is incomplete or corrupt.');
  const count = view.getUint16(eocd + 10, true),
    offset = view.getUint32(eocd + 16, true);
  if (
    view.getUint16(eocd + 4, true) ||
    view.getUint16(eocd + 6, true) ||
    count === 65535 ||
    offset === 0xffffffff
  )
    throw new Error('Multipart and ZIP64 EPUB archives are not supported.');
  if (count > MAX_ENTRIES) throw new Error('This EPUB contains too many resources.');
  let cursor = offset,
    total = 0;
  for (let entry = 0; entry < count; entry++) {
    if (cursor + 46 > eocd || view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error('The EPUB resource directory is invalid.');
    const expanded = view.getUint32(cursor + 24, true),
      nameLength = view.getUint16(cursor + 28, true),
      extraLength = view.getUint16(cursor + 30, true),
      commentLength = view.getUint16(cursor + 32, true);
    if (cursor + 46 + nameLength + extraLength + commentLength > eocd)
      throw new Error('The EPUB resource directory is incomplete.');
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (!safeArchivePath(name)) throw new Error('This EPUB contains an unsafe resource path.');
    if (view.getUint16(cursor + 8, true) & 1)
      throw new Error('Encrypted EPUB archives are not supported.');
    if (expanded > MAX_ENTRY_BYTES || (total += expanded) > MAX_INFLATED_BYTES)
      throw new Error('The EPUB expands beyond this build’s memory budget.');
    cursor += 46 + nameLength + extraLength + commentLength;
  }
}
