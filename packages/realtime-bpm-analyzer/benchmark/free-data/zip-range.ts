/**
 * Reads FMA's archive by range request: 943 GB to take a few thousand members. Only the two records
 * needed are parsed, and only what this archive uses: a zip64 directory, members in bzip2.
 */

export type ZipMember = {
  readonly name: string;
  readonly method: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly headerOffset: number;
};

const unset32 = 0xFF_FF_FF_FF;
const directoryEntrySize = 46;

/** How much of the file's tail holds both end records, whatever the comment's length */
export const tailBytes = 65_536 + 22 + 76;

function lastIndexOfSignature(view: DataView, signature: number): number {
  for (let i = view.byteLength - 4; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === signature) {
      return i;
    }
  }

  return -1;
}

/**
 * Finds the central directory from the file's tail
 * @param tail The last `tailBytes` of the file
 * @returns Where the directory is
 * @throws {Error} When this is not a zip64 archive
 */
export function directoryLocation(tail: Uint8Array): {readonly offset: number; readonly size: number} {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const record = lastIndexOfSignature(view, 0x06_06_4B_50);

  if (record < 0) {
    throw new Error('no zip64 end record');
  }

  return {offset: Number(view.getBigUint64(record + 48, true)), size: Number(view.getBigUint64(record + 40, true))};
}

function readZip64Extra(view: DataView, start: number, length: number, values: {size: number; compressedSize: number; headerOffset: number}): void {
  let at = start;

  while (at + 4 <= start + length) {
    const id = view.getUint16(at, true);
    const fieldLength = view.getUint16(at + 2, true);

    if (id === 1) {
      let field = at + 4;
      const next = () => {
        const value = Number(view.getBigUint64(field, true));

        field += 8;
        return value;
      };

      // The field holds only the values whose 32-bit slot is unset, in this order
      values.size = values.size === unset32 ? next() : values.size;
      values.compressedSize = values.compressedSize === unset32 ? next() : values.compressedSize;
      values.headerOffset = values.headerOffset === unset32 ? next() : values.headerOffset;
    }

    at += 4 + fieldLength;
  }
}

/**
 * Parses the central directory
 * @param directory Its bytes
 * @returns Every member
 * @throws {Error} When an entry's signature is wrong, which means the range was wrong
 */
export function parseDirectory(directory: Uint8Array): ZipMember[] {
  const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
  const decoder = new TextDecoder();
  const members: ZipMember[] = [];
  let at = 0;

  while (at + directoryEntrySize <= directory.byteLength) {
    if (view.getUint32(at, true) !== 0x02_01_4B_50) {
      throw new Error(`bad directory entry at ${at}`);
    }

    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const nameStart = at + directoryEntrySize;
    const values = {
      compressedSize: view.getUint32(at + 20, true),
      size: view.getUint32(at + 24, true),
      headerOffset: view.getUint32(at + 42, true),
    };

    readZip64Extra(view, nameStart + nameLength, extraLength, values);
    members.push({
      name: decoder.decode(directory.subarray(nameStart, nameStart + nameLength)),
      method: view.getUint16(at + 10, true),
      crc32: view.getUint32(at + 16, true),
      ...values,
    });
    at = nameStart + nameLength + extraLength + commentLength;
  }

  return members;
}

/**
 * Where a member's data starts, from the first bytes of its local header. Its name and extra field
 * can differ from the directory's, so the directory's lengths are not enough.
 * @param header At least 30 bytes from the member's header offset
 * @returns Bytes to skip from the header offset
 * @throws {Error} When this is not a local header
 */
export function dataStart(header: Uint8Array): number {
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);

  if (view.getUint32(0, true) !== 0x04_03_4B_50) {
    throw new Error('bad local header');
  }

  return 30 + view.getUint16(26, true) + view.getUint16(28, true);
}
