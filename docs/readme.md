---
head:
  - - meta
    - name: robots
      content: noindex, nofollow
---

# Documentation Development

## Running in Development Mode

The documentation includes **live, interactive examples** embedded via iframes. In development each embed loads its example from that example's own dev server, on ports 3001 to 3009, which `npm run docs:dev` doesn't start. Until that server answers, the embed says so and names the command below, then loads the example by itself.

### Option 1: Quick Start (Run Everything)

Open **two terminals** at the repository root:

**Terminal 1 - Start all example servers:**
```bash
npm run examples:dev
```

**Terminal 2 - Start documentation:**
```bash
npm run docs:dev
```

Then visit `http://localhost:5173` - all embedded examples will be working!

### Option 2: Run Individual Examples

If you only want to test specific examples, you can run them individually:

```bash
# Example: run vanilla basic example, from the repository root
npm run dev -w examples/01-vanilla-basic
```

Then start the docs as normal. The embeds of the examples that are running load them, and the others name the command until their server answers.

## Production Build

To build everything for production:

```bash
cd docs
npm run build
```

This will:
1. Generate API documentation with TypeDoc
2. Build the VitePress documentation
3. Build all 9 examples and copy them to `docs/.vitepress/dist/examples/`

The examples are served as static files alongside the documentation in production.

## Example Port Mapping

Example `NN` runs on port `30NN` in development, `01-vanilla-basic` on 3001 up to `09-vue-microphone` on 3009. The list lives in `docs/.vitepress/tools/example-dev-server.ts`, which both the embed and `npm run examples:dev` read, and a test checks it against each example's vite config.
