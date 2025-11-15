# Documentation Development

## Running in Development Mode

The documentation includes **live, interactive examples** embedded via iframes. To see them working locally:

### Option 1: Quick Start (Run Everything)

Open **two terminals**:

**Terminal 1 - Start all example servers:**
```bash
cd docs
npm run dev:examples
```

**Terminal 2 - Start documentation:**
```bash
cd docs
npm run dev
```

Then visit `http://localhost:5173` - all embedded examples will be working!

### Option 2: Run Individual Examples

If you only want to test specific examples, you can run them individually:

```bash
# Example: run vanilla basic example
cd examples/01-vanilla-basic
npm run dev
```

Then start the docs as normal. The iframe will connect to whichever examples are running.

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

Each example runs on its own port in development:

- `01-vanilla-basic`: 3001
- `02-vanilla-streaming`: 3002
- `03-vanilla-microphone`: 3003
- `04-react-basic`: 3004
- `05-react-streaming`: 3005
- `06-react-microphone`: 3006
- `07-vue-basic`: 3007
- `08-vue-streaming`: 3008
- `09-vue-microphone`: 3009
