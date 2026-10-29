// Every URL an earlier version of the site served that the current build no longer
// does, mapped to its closest current page. Keys are the files the stub is written
// to (relative to the dist root, as the old URL named them); values are clean-URL
// paths that must resolve to a page VitePress built (checked by check-redirects.ts).
//
// Reconstructed for RBA-6 without a Search Console export, from: every commit of
// the gh-pages branch (TypeDoc v2/v3/v4 output and the 2018 example pages), the
// HTML pages once committed under docs/ on main, the TypeDoc markdown output of
// every v5 minor, and every site link in the README and docs history.
//
// Served before, deliberately left as 404 (no successor page):
// - docs/google4e3a3e9414465dcf.html, public/… — stray copies of the Search Console
//   verification file. The root one is served again from docs/public: Google re-checks
//   it, and a redirect would not verify.
// - favicons/index.html — a favicon generator's manifest page, never content.
// - dist/404.html, docs/404.html — old not-found pages.
export const legacyRedirects: Readonly<Record<string, string>> = {
  // TypeDoc v4 (2023–2025), served at the site root.
  'modules.html': '/api/',

  'classes/RealTimeBpmAnalyzer.html': '/api/classes/RealTimeBpmAnalyzer',

  'functions/analyzeFullBuffer.html': '/api/functions/analyzeFullBuffer',
  'functions/getBiquadFilter.html': '/api/functions/getBiquadFilter',
  'functions/getBiquadFilters.html': '/api/functions/getBiquadFilter',
  'functions/createRealTimeBpmProcessor.html': '/api/functions/createRealtimeBpmAnalyzer',

  'types/BiquadFilterOptions.html': '/api/type-aliases/BiquadFilterOptions',
  'types/BpmCandidates.html': '/api/type-aliases/BpmCandidates',
  'types/Peaks.html': '/api/type-aliases/Peaks',
  'types/ValidPeaks.html': '/api/type-aliases/Peaks',
  'types/Tempo.html': '/api/type-aliases/Tempo',
  'types/Threshold.html': '/api/type-aliases/Threshold',
  'types/RealTimeBpmAnalyzerParameters.html': '/api/type-aliases/RealTimeBpmAnalyzerParameters',
  'types/RealTimeBpmAnalyzerOptions.html': '/api/type-aliases/RealTimeBpmAnalyzerParameters',
  'types/OnThresholdFunction.html': '/api/type-aliases/Threshold',
  'types/PeaksAndThreshold.html': '/api/type-aliases/Peaks',

  // Event-related types collapsed into ProcessorInputEvent / ProcessorOutputEvent / BpmAnalyzerEventMap in v5.
  'types/RealtimeBpmAnalyzerEvents.html': '/api/type-aliases/BpmAnalyzerEventMap',
  'types/EventBuilder.html': '/api/type-aliases/BpmAnalyzerEventMap',
  'types/EventMessageBuilder.html': '/api/type-aliases/BpmAnalyzerEventMap',
  'types/BpmEvent.html': '/api/type-aliases/ProcessorOutputEvent',
  'types/BpmEventData.html': '/api/type-aliases/ProcessorOutputEvent',
  'types/BpmEventMessage.html': '/api/type-aliases/ProcessorOutputEvent',
  'types/AnalyzeChunkEvent.html': '/api/type-aliases/ProcessorInputEvent',
  'types/AnalyzeChunkEventData.html': '/api/type-aliases/ProcessorInputEvent',
  'types/AnalyzeChunkEventMessage.html': '/api/type-aliases/ProcessorInputEvent',
  'types/AsyncConfigurationEvent.html': '/api/type-aliases/ProcessorInputEvent',
  'types/AsyncConfigurationEventData.html': '/api/type-aliases/ProcessorInputEvent',
  'types/StopEvent.html': '/api/type-aliases/ProcessorInputEvent',
  'types/StopEventData.html': '/api/type-aliases/ProcessorInputEvent',
  'types/ResetEvent.html': '/api/type-aliases/ProcessorInputEvent',
  'types/ResetEventData.html': '/api/type-aliases/ProcessorInputEvent',
  'types/DebugEvent.html': '/api/type-aliases/ProcessorOutputEvent',
  'types/DebugEventDataMessage.html': '/api/type-aliases/ProcessorOutputEvent',
  'types/AnalyzerResetedEvent.html': '/api/type-aliases/ProcessorOutputEvent',
  'types/AnalyzerResetedEventData.html': '/api/type-aliases/ProcessorOutputEvent',
  'types/AnalyzerResetedEventMessage.html': '/api/type-aliases/ProcessorOutputEvent',
  'types/ValidPeakEvent.html': '/api/type-aliases/ProcessorOutputEvent',
  'types/ValidPeakEventData.html': '/api/type-aliases/ProcessorOutputEvent',
  'types/ValidPeakEventMessage.html': '/api/type-aliases/ProcessorOutputEvent',
  'types/PostMessageEvents.html': '/api/type-aliases/ProcessorOutputEvent',
  'types/PostMessageEventData.html': '/api/type-aliases/ProcessorOutputEvent',

  // Internal types removed in v5 — no direct successor, point at the API index.
  'types/AnalyzerComputeBpmOptions.html': '/api/',
  'types/AnalyzerGroupByTempoOptions.html': '/api/',
  'types/AnalyzerFindPeaksAtTheshold.html': '/api/',
  'types/AnalyzerFindPeaksOptions.html': '/api/',
  'types/RealtimeAnalyzeChunkOptions.html': '/api/',
  'types/RealtimeFindPeaksOptions.html': '/api/',
  'types/AggregateData.html': '/api/',
  'types/Group.html': '/api/',
  'types/Interval.html': '/api/',
  'types/NextIndexPeaks.html': '/api/',
  'types/NormalizedFilters.html': '/api/',

  // TypeDoc markdown pages of v5.0–v5.3 whose types were since removed or renamed.
  'api/type-aliases/RealTimeBpmAnalyzerOptions.html': '/api/type-aliases/RealTimeBpmAnalyzerParameters',
  'api/type-aliases/PeaksAndThreshold.html': '/api/type-aliases/Peaks',
  'api/type-aliases/ProcessorInputMessage.html': '/api/type-aliases/ProcessorInputEvent',
  'api/type-aliases/Group.html': '/api/',
  'api/type-aliases/Interval.html': '/api/',

  // TypeDoc v3 (versioned under api/v3, also once published under docs/).
  'api/v3/index.html': '/api/',
  'api/v3/modules.html': '/api/',
  'api/v3/classes/RealTimeBpmAnalyzer.html': '/api/classes/RealTimeBpmAnalyzer',
  'api/v3/interfaces/BpmCandidates.html': '/api/type-aliases/BpmCandidates',
  'api/v3/interfaces/Interval.html': '/api/',
  'api/v3/interfaces/PeaksAndThreshold.html': '/api/type-aliases/Peaks',
  'api/v3/interfaces/RealTimeBpmAnalyzerOptions.html': '/api/type-aliases/RealTimeBpmAnalyzerParameters',
  'api/v3/interfaces/RealTimeBpmAnalyzerParameters.html': '/api/type-aliases/RealTimeBpmAnalyzerParameters',
  'api/v3/interfaces/Tempo.html': '/api/type-aliases/Tempo',
  'docs/api/v3/index.html': '/api/',
  'docs/api/v3/modules.html': '/api/',
  'docs/api/v3/classes/RealTimeBpmAnalyzer.html': '/api/classes/RealTimeBpmAnalyzer',
  'docs/api/v3/interfaces/BpmCandidates.html': '/api/type-aliases/BpmCandidates',
  'docs/api/v3/interfaces/Interval.html': '/api/',
  'docs/api/v3/interfaces/PeaksAndThreshold.html': '/api/type-aliases/Peaks',
  'docs/api/v3/interfaces/RealTimeBpmAnalyzerOptions.html': '/api/type-aliases/RealTimeBpmAnalyzerParameters',
  'docs/api/v3/interfaces/RealTimeBpmAnalyzerParameters.html': '/api/type-aliases/RealTimeBpmAnalyzerParameters',
  'docs/api/v3/interfaces/Tempo.html': '/api/type-aliases/Tempo',

  // JSDoc v2 (unversioned under api/, then api/v2; also under docs/ and public/).
  // The Analyzer class became analyzeFullBuffer; Utils has no public successor.
  'api/Analyzer.html': '/api/functions/analyzeFullBuffer',
  'api/analyzer.js.html': '/api/functions/analyzeFullBuffer',
  'api/RealTimeBPMAnalyzer.html': '/api/classes/RealTimeBpmAnalyzer',
  'api/realtime-bpm-analyzer.js.html': '/api/classes/RealTimeBpmAnalyzer',
  'api/Utils.html': '/api/',
  'api/utils.js.html': '/api/',
  'api/v2/index.html': '/api/',
  'api/v2/Analyzer.html': '/api/functions/analyzeFullBuffer',
  'api/v2/analyzer.js.html': '/api/functions/analyzeFullBuffer',
  'api/v2/RealTimeBPMAnalyzer.html': '/api/classes/RealTimeBpmAnalyzer',
  'api/v2/realtime-bpm-analyzer.js.html': '/api/classes/RealTimeBpmAnalyzer',
  'api/v2/Utils.html': '/api/',
  'api/v2/utils.js.html': '/api/',
  'docs/api/index.html': '/api/',
  'docs/api/Analyzer.html': '/api/functions/analyzeFullBuffer',
  'docs/api/analyzer.js.html': '/api/functions/analyzeFullBuffer',
  'docs/api/RealTimeBPMAnalyzer.html': '/api/classes/RealTimeBpmAnalyzer',
  'docs/api/realtime-bpm-analyzer.js.html': '/api/classes/RealTimeBpmAnalyzer',
  'docs/api/Utils.html': '/api/',
  'docs/api/utils.js.html': '/api/',
  'docs/api/v2/index.html': '/api/',
  'docs/api/v2/Analyzer.html': '/api/functions/analyzeFullBuffer',
  'docs/api/v2/analyzer.js.html': '/api/functions/analyzeFullBuffer',
  'docs/api/v2/RealTimeBPMAnalyzer.html': '/api/classes/RealTimeBpmAnalyzer',
  'docs/api/v2/realtime-bpm-analyzer.js.html': '/api/classes/RealTimeBpmAnalyzer',
  'docs/api/v2/Utils.html': '/api/',
  'docs/api/v2/utils.js.html': '/api/',
  'public/api/index.html': '/api/',
  'public/api/Analyzer.html': '/api/functions/analyzeFullBuffer',
  'public/api/analyzer.js.html': '/api/functions/analyzeFullBuffer',
  'public/api/RealTimeBPMAnalyzer.html': '/api/classes/RealTimeBpmAnalyzer',
  'public/api/realtime-bpm-analyzer.js.html': '/api/classes/RealTimeBpmAnalyzer',
  'public/api/Utils.html': '/api/',
  'public/api/utils.js.html': '/api/',

  // Pre-VitePress hand-written pages (2018–2023), at the root and under docs/ and dist/.
  'how-it-works.html': '/guide/how-it-works',
  'audio-node.html': '/examples/basic-usage',
  'stream.html': '/examples/streaming-audio',
  'user-media.html': '/examples/microphone-input',
  'docs/index.html': '/',
  'docs/how-it-works.html': '/guide/how-it-works',
  'docs/audio-node.html': '/examples/basic-usage',
  'docs/stream.html': '/examples/streaming-audio',
  'docs/user-media.html': '/examples/microphone-input',
  'dist/index.html': '/',
  'dist/how-it-works.html': '/guide/how-it-works',
  'dist/audio-node.html': '/examples/basic-usage',
  'dist/stream.html': '/examples/streaming-audio',
  'dist/user-media.html': '/examples/microphone-input',
  'public/index.html': '/',
  'example/app/assets/index.html': '/examples/basic-usage',
  'example/public/index.html': '/examples/basic-usage',

  // VitePress-era paths: bare directories, and a page the README linked that was never built.
  'guide/index.html': '/guide/getting-started',
  'guide/quick-start.html': '/guide/getting-started',
  'examples/index.html': '/examples/basic-usage',
};
