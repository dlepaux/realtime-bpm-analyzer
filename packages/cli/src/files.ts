/// <reference types="node" />

import {readdir, stat} from 'node:fs/promises';
import {extname, join} from 'node:path';

export type Target =
  | {readonly kind: 'file'; readonly path: string}
  | {readonly kind: 'error'; readonly path: string; readonly message: string};

/** Deepest folder level --recursive descends to, so a pathological tree cannot run away */
export const maxDepth = 32;

// Folder mode picks files by extension; a file named on the command line is always tried
const audioExtensions = new Set([
  '.mp3', '.wav', '.wave', '.flac', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.aif', '.aiff', '.wma',
]);

/**
 * Expands the command-line paths into the files to analyse, in a stable order: arguments
 * in the order given, folder contents sorted by path. A path that cannot be read becomes
 * an error target instead of stopping the batch.
 * @param paths Files and folders from the command line
 * @param recursive Whether to descend into sub-folders
 * @returns One target per file, or per path that failed
 */
export async function collectTargets(paths: readonly string[], recursive: boolean): Promise<Target[]> {
  const targets: Target[] = [];

  for (const path of paths) {
    try {
      const info = await stat(path);
      if (!info.isDirectory()) {
        targets.push({kind: 'file', path});
        continue;
      }

      const found = await walk(path, recursive ? maxDepth : 0);
      // Code-unit order, not localeCompare: the same on every machine and locale
      found.sort((a, b) => (a.path < b.path ? -1 : (a.path > b.path ? 1 : 0)));
      targets.push(...(found.length > 0 ? found : [{kind: 'error', path, message: 'No audio files found.'} as const]));
    } catch (error: unknown) {
      targets.push({kind: 'error', path, message: errorMessage(error)});
    }
  }

  return targets;
}

/**
 * Lists the audio files of a folder. Symlinked files are followed, symlinked folders are
 * not, so a link loop cannot recurse.
 * @param folder Folder to list
 * @param depthLeft Sub-folder levels still allowed below this one
 * @returns Audio files and unreadable sub-folders, unsorted
 */
async function walk(folder: string, depthLeft: number): Promise<Target[]> {
  const found: Target[] = [];

  for (const entry of await readdir(folder, {withFileTypes: true})) {
    const path = join(folder, entry.name);

    if (entry.isDirectory()) {
      if (depthLeft > 0) {
        found.push(...await walk(path, depthLeft - 1).catch((error: unknown) => [
          {kind: 'error', path, message: errorMessage(error)} as const,
        ]));
      }

      continue;
    }

    if (!audioExtensions.has(extname(entry.name).toLowerCase())) {
      continue;
    }

    const isFile = entry.isFile() || (entry.isSymbolicLink() && await stat(path).then(info => info.isFile(), () => false));
    if (isFile) {
      found.push({kind: 'file', path});
    }
  }

  return found;
}

/**
 * @param error Anything thrown
 * @returns A one-line message for the report
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
