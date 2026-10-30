/// <reference types="node" />

import {readdir, realpath, stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {extname, isAbsolute, join, relative, resolve} from 'node:path';
import {audioExtensions} from 'realtime-bpm-analyzer-cli';

// The server reads the user's disk on a model's request, so every path is checked here
// before a decoder sees it, and every walk is bounded. Nothing is written, nothing is sent.

export const limits = {
  /** Largest file analysed: decoding holds the whole file plus its PCM in memory */
  maxFileBytes: 100 * 1024 * 1024,
  /** Most files one analyze_folder call analyses (about 3 s each), so a call ends within a client's patience */
  maxFolderFiles: 50,
  /** Most directory entries one walk reads, so a walk of a huge tree stays short */
  maxFolderEntries: 10_000,
  /** Deepest sub-folder level a recursive walk descends to */
  maxDepth: 16,
} as const;

export type Checked = {readonly ok: true; readonly path: string} | {readonly ok: false; readonly error: string};

export type FolderEntry = {readonly kind: 'file'; readonly path: string} | {readonly kind: 'error'; readonly path: string; readonly error: string};

export type Folder = {
  /** Every audio file and failed path the walk found, sorted by path */
  readonly entries: readonly FolderEntry[];
  /** Whether the walk stopped at limits.maxFolderEntries, so entries may be incomplete */
  readonly scanTruncated: boolean;
};

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/**
 * Turns a path from the model into an absolute one: `~` is the user's home, and a relative
 * path is relative to the server's working directory (a Claude Code project, for example).
 * @param raw Path as given
 * @returns The absolute path, the one results report
 */
export function absolutePath(raw: string): string {
  const expanded = raw === '~' ? homedir() : (raw.startsWith('~/') ? join(homedir(), raw.slice(2)) : raw);
  return resolve(expanded);
}

/**
 * Describes a filesystem error in one plain line, without the errno prefix.
 * @param error Anything thrown by fs
 * @param path Path the operation was on
 * @returns The message
 */
export function plainError(error: unknown, path: string): string {
  switch ((error as NodeJS.ErrnoException | undefined)?.code) {
    case 'ENOENT': {
      return `No such file or folder: ${path}`;
    }

    case 'EACCES':
    case 'EPERM': {
      return `Permission denied: ${path}`;
    }

    case 'ENOTDIR': {
      return `A part of the path is not a folder: ${path}`;
    }

    case 'ELOOP': {
      return `Too many symbolic links: ${path}`;
    }

    default: {
      return firstLine(error);
    }
  }
}

/**
 * @param error Anything thrown
 * @returns Its message's first line, capped, so no stack trace or dump reaches the model
 */
export function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.split('\n')[0] ?? '').slice(0, 500);
}

/**
 * Checks a file the model named: it must be a regular file (a symbolic link is followed,
 * since the path was named outright), with an audio extension, within the size cap.
 * @param path Absolute path
 * @returns The path, or why it is refused
 */
export async function checkFile(path: string): Promise<Checked> {
  if (!audioExtensions.has(extname(path).toLowerCase())) {
    return {ok: false, error: `Not an audio file this server reads (${[...audioExtensions].join(', ')}): ${path}`};
  }

  try {
    const info = await stat(path);
    if (!info.isFile()) {
      return {ok: false, error: `Not a regular file: ${path}`};
    }

    return sizeError(info.size, path) ?? {ok: true, path};
  } catch (error: unknown) {
    return {ok: false, error: plainError(error, path)};
  }
}

/**
 * @param size File size in bytes
 * @param path Path, for the message
 * @returns The refusal when the file is over the cap
 */
function sizeError(size: number, path: string): Checked | undefined {
  return size > limits.maxFileBytes
    ? {ok: false, error: `File is ${megabytes(size)}, over the ${megabytes(limits.maxFileBytes)} limit: ${path}`}
    : undefined;
}

/**
 * Lists the audio files of a folder in path order, bounded by limits. The caller pages
 * through them, so the order must be stable from one call to the next. Symbolic links to
 * folders are not followed (no loops, no escape). A symbolic link to a file is followed only
 * when its target is inside the folder; otherwise it is reported as refused.
 * @param folder Absolute path of an existing folder
 * @param recursive Whether to descend into sub-folders
 * @returns The entries to analyse, or why the folder itself is refused
 */
export async function listFolder(folder: string, recursive: boolean): Promise<Folder | {readonly error: string}> {
  let root: string;
  try {
    root = await realpath(folder);
    if (!(await stat(root)).isDirectory()) {
      return {error: `Not a folder: ${folder}`};
    }
  } catch (error: unknown) {
    return {error: plainError(error, folder)};
  }

  const found: FolderEntry[] = [];
  // Explicit stack instead of recursion: the depth and the entry count are the only bounds
  const pending: Array<{path: string; depth: number}> = [{path: folder, depth: 0}];
  let entriesRead = 0;
  let truncated = false;

  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    let names;
    try {
      // Sorted, so which entries a truncated walk reads does not depend on the filesystem
      names = (await readdir(current.path, {withFileTypes: true})).sort((a, b) => (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)));
    } catch (error: unknown) {
      found.push({kind: 'error', path: current.path, error: plainError(error, current.path)});
      continue;
    }

    if (entriesRead + names.length > limits.maxFolderEntries) {
      names = names.slice(0, limits.maxFolderEntries - entriesRead);
      truncated = true;
    }

    entriesRead += names.length;
    for (const entry of names) {
      const path = join(current.path, entry.name);
      if (entry.isDirectory()) {
        if (recursive && current.depth < limits.maxDepth) {
          pending.push({path, depth: current.depth + 1});
        }
      } else if (audioExtensions.has(extname(entry.name).toLowerCase())) {
        const checked = await checkFolderFile(path, root, entry.isSymbolicLink());
        if (checked !== undefined) {
          found.push(checked);
        }
      }
    }

    if (truncated) {
      break;
    }
  }

  // Code-unit order, not localeCompare: the same on every machine and locale
  found.sort((a, b) => (a.path < b.path ? -1 : (a.path > b.path ? 1 : 0)));
  return {entries: found, scanTruncated: truncated};
}

/**
 * @param path Audio entry found in the walk
 * @param root Real path of the folder walked
 * @param isLink Whether the entry is a symbolic link
 * @returns The file, a refusal, or undefined for an entry that is not a file (a link to a folder)
 */
async function checkFolderFile(path: string, root: string, isLink: boolean): Promise<FolderEntry | undefined> {
  try {
    if (isLink) {
      const fromRoot = relative(root, await realpath(path));
      if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
        return {kind: 'error', path, error: `Skipped: a symbolic link to a file outside the folder: ${path}`};
      }
    }

    const info = await stat(path);
    if (!info.isFile()) {
      return undefined;
    }

    const refused = sizeError(info.size, path);
    return refused !== undefined && !refused.ok ? {kind: 'error', path, error: refused.error} : {kind: 'file', path};
  } catch (error: unknown) {
    return {kind: 'error', path, error: plainError(error, path)};
  }
}
