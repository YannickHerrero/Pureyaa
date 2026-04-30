/**
 * Minimal tar extractor for single-file archives. The tarballs from
 * scriptin/jmdict-simplified contain exactly one .json file each, so we don't
 * need a general-purpose tar parser — just enough to read the size out of the
 * 512-byte header and slice out the payload.
 *
 * Tar format reference: https://www.gnu.org/software/tar/manual/html_node/Standard.html
 */

const HEADER_SIZE = 512;
const SIZE_OFFSET = 124;
const SIZE_LENGTH = 12;
const NAME_OFFSET = 0;
const NAME_LENGTH = 100;

function readNullTerminated(bytes: Uint8Array, offset: number, maxLength: number): string {
  let end = offset;
  const limit = offset + maxLength;
  while (end < limit && bytes[end] !== 0) end++;
  return new TextDecoder().decode(bytes.subarray(offset, end));
}

function parseOctal(bytes: Uint8Array, offset: number, length: number): number {
  const text = readNullTerminated(bytes, offset, length).trim();
  if (text.length === 0) return 0;
  return parseInt(text, 8);
}

export interface TarEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Extract the first regular-file entry from an uncompressed tar buffer.
 * Throws if the buffer is malformed or contains no regular file.
 */
export function extractFirstFile(tar: Uint8Array): TarEntry {
  if (tar.length < HEADER_SIZE) {
    throw new Error('tar buffer too short to contain a header');
  }
  const name = readNullTerminated(tar, NAME_OFFSET, NAME_LENGTH);
  if (name.length === 0) {
    throw new Error('tar header has empty name (likely end-of-archive marker)');
  }
  const size = parseOctal(tar, SIZE_OFFSET, SIZE_LENGTH);
  if (size <= 0) {
    throw new Error(`tar header has non-positive size: ${size}`);
  }
  if (tar.length < HEADER_SIZE + size) {
    throw new Error(
      `tar buffer truncated: expected ${HEADER_SIZE + size} bytes, got ${tar.length}`,
    );
  }
  return { name, data: tar.subarray(HEADER_SIZE, HEADER_SIZE + size) };
}
