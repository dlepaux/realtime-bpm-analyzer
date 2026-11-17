/// <reference types="node" />

import {readFileSync} from 'node:fs';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {firstLine} from './paths';
import {createServer} from './tools';

// `npx -y realtime-bpm-analyzer-mcp`, the package's bin: a local MCP server over stdio.
// stdout carries the protocol, so anything else goes to stderr. No network, no telemetry.

/**
 * @returns The installed package version, read at run time because the release bumps
 * package.json after the build
 */
function packageVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const version = (manifest as {version?: unknown}).version;
  return typeof version === 'string' ? version : 'unknown';
}

const version = packageVersion();
serveStdio(() => createServer(version), {
  onerror: error => process.stderr.write(`realtime-bpm-analyzer-mcp: ${firstLine(error)}\n`),
});
