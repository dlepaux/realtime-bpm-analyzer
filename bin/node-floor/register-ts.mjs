// Test-only, for main.yml's node-floor job. The Node tests import two shared .ts fixtures,
// which Node strips the types of only from 22.18.0 (22.6.0 behind a flag). The CLI and the
// MCP server ship no TypeScript and need none of that, so the job tests them on 22.0.0, their
// floor, and this hook lets the harness load its fixtures there. Loaded with
// NODE_OPTIONS=--import, so the bins the tests spawn get it too: it touches only .ts URLs.
import {register} from 'node:module';

register('./ts-hooks.mjs', import.meta.url);
