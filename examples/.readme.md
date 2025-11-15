# Examples

This directory contains complete, working examples demonstrating how to use the `realtime-bpm-analyzer` library across different use cases and frameworks.

## Overview

The examples are organized by framework and use case:

### Vanilla JavaScript Examples

- **[01-vanilla-basic](./01-vanilla-basic/)** - Basic offline BPM analysis from uploaded audio files
- **[02-vanilla-streaming](./02-vanilla-streaming/)** - Real-time analysis from streaming audio URLs
- **[03-vanilla-microphone](./03-vanilla-microphone/)** - Real-time analysis from microphone input

### React Examples

- **[04-react-basic](./04-react-basic/)** - Basic offline BPM analysis with React hooks
- **[05-react-streaming](./05-react-streaming/)** - Streaming audio analysis with React
- **[06-react-microphone](./06-react-microphone/)** - Microphone input analysis with React

### Vue 3 Examples

- **[07-vue-basic](./07-vue-basic/)** - Basic offline BPM analysis with Vue Composition API
- **[08-vue-streaming](./08-vue-streaming/)** - Streaming audio analysis with Vue
- **[09-vue-microphone](./09-vue-microphone/)** - Microphone input analysis with Vue

## Use Cases

### 1. Basic / Offline Analysis (`analyzeFullBuffer`)

**When to use:** You have an audio file and want fast, accurate BPM detection without playback.

**Examples:** 01-vanilla-basic, 04-react-basic, 07-vue-basic

**Key Features:**
- Fast offline analysis
- No playback needed
- Returns array of BPM candidates
- Best for file uploads

### 2. Streaming Audio (`createRealtimeBpmAnalyzer` + MediaElementSource)

**When to use:** Analyzing BPM from streaming URLs like internet radio, remote audio files.

**Examples:** 02-vanilla-streaming, 05-react-streaming, 08-vue-streaming

**Key Features:**
- Real-time analysis during playback
- Uses `getBiquadFilter()` for audio processing
- Connection: `source → filter → analyzer.node → destination`
- Listens for `bpmStable` event

### 3. Microphone Input (`createRealtimeBpmAnalyzer` + MediaStreamSource)

**When to use:** Live BPM detection from microphone, instruments, or any audio input.

**Examples:** 03-vanilla-microphone, 06-react-microphone, 09-vue-microphone

**Key Features:**
- Real-time analysis from live input
- Requires microphone permissions
- Connection: `source → analyser` and `source → analyzer.node`
- Proper cleanup with `suspend()` and `disconnect()`

## Running Examples

Each example is a standalone project. To run any example:

```bash
cd examples/<example-name>
npm install
npm run dev
```

Then open the URL shown in the terminal (typically http://localhost:5173).

## Testing All Examples

From the root of the repository:

```bash
# Install dependencies for all examples
npm run examples:install

# Build all examples
npm run examples:build

# Run a specific example
npm run dev --workspace=examples/01-vanilla-basic
```

## Architecture Patterns

All examples follow these best practices from the allegro-project reference implementation:

1. **Proper Audio Graph Connections**
   - Always connect analyzer to the audio graph
   - Use appropriate source types (MediaElementSource, MediaStreamSource)
   - Include AnalyserNode for potential visualizations

2. **Event Handling**
   - Listen for `bpmStable` event for stable BPM detection
   - Use `BpmCandidates` type with array of tempo values
   - Handle multiple BPM candidates when needed

3. **Resource Management**
   - Call `suspend()` before `disconnect()`
   - Stop media streams when done
   - Clean up all audio nodes
   - Properly handle component unmounting

4. **Error Handling**
   - Handle microphone permission errors
   - Catch audio loading failures
   - Provide user-friendly error messages

## Technologies Used

- **Build Tool:** Vite
- **TypeScript:** Full type safety
- **React:** v18.3+ with hooks
- **Vue:** v3.5+ with Composition API
- **Styling:** Inline CSS with consistent design system

## Contributing

When adding new examples:

1. Follow the naming convention: `##-framework-usecase`
2. Include a README.md explaining the example
3. Use the same visual styling (purple gradient theme)
4. Follow the architecture patterns from allegro-project
5. Test the example thoroughly before committing

## Need Help?

- Check the [main documentation](../docs/)
- Review the [API reference](../docs/api/)
- Look at similar examples for your framework
- Compare with the allegro-project reference implementation
