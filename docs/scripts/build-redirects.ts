import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Old TypeDoc URLs (pre-VitePress) → closest current page.
// Indexed by Google before the docs site moved to VitePress, surfacing as 404
// in Search Console. We serve them as static meta-refresh pages so Google can
// follow the redirect and consolidate the canonical signal onto the new URL.
const redirects: Record<string, string> = {
  'modules.html': '/api/',

  'classes/RealTimeBpmAnalyzer.html': '/api/classes/RealTimeBpmAnalyzer',

  'functions/analyzeFullBuffer.html': '/api/functions/analyzeFullBuffer',
  'functions/getBiquadFilter.html': '/api/functions/getBiquadFilter',
  'functions/createRealTimeBpmProcessor.html': '/api/functions/createRealtimeBpmAnalyzer',

  'types/BiquadFilterOptions.html': '/api/type-aliases/BiquadFilterOptions',
  'types/BpmCandidates.html': '/api/type-aliases/BpmCandidates',
  'types/Peaks.html': '/api/type-aliases/Peaks',
  'types/Tempo.html': '/api/type-aliases/Tempo',
  'types/RealTimeBpmAnalyzerParameters.html': '/api/type-aliases/RealTimeBpmAnalyzerParameters',
  'types/RealTimeBpmAnalyzerOptions.html': '/api/type-aliases/RealTimeBpmAnalyzerParameters',
  'types/OnThresholdFunction.html': '/api/type-aliases/Threshold',
  'types/PeaksAndThreshold.html': '/api/type-aliases/Peaks',

  // Event-related types collapsed into ProcessorInputEvent / ProcessorOutputEvent / BpmAnalyzerEventMap in v5.
  'types/RealtimeBpmAnalyzerEvents.html': '/api/type-aliases/BpmAnalyzerEventMap',
  'types/EventMessageBuilder.html': '/api/type-aliases/BpmAnalyzerEventMap',
  'types/BpmEventMessage.html': '/api/type-aliases/ProcessorOutputEvent',
  'types/AnalyzeChunkEvent.html': '/api/type-aliases/ProcessorInputEvent',
  'types/AnalyzeChunkEventMessage.html': '/api/type-aliases/ProcessorInputEvent',
  'types/StopEvent.html': '/api/type-aliases/ProcessorInputEvent',
  'types/ResetEvent.html': '/api/type-aliases/ProcessorInputEvent',
  'types/DebugEvent.html': '/api/type-aliases/ProcessorOutputEvent',
  'types/DebugEventDataMessage.html': '/api/type-aliases/ProcessorOutputEvent',
  'types/AnalyzerResetedEvent.html': '/api/type-aliases/ProcessorOutputEvent',

  // Internal types removed in v5 — no direct successor, point at the API index.
  'types/AnalyzerComputeBpmOptions.html': '/api/',
  'types/AnalyzerGroupByTempoOptions.html': '/api/',
  'types/AnalyzerFindPeaksAtTheshold.html': '/api/',
  'types/RealtimeAnalyzeChunkOptions.html': '/api/',
  'types/AggregateData.html': '/api/',
  'types/Group.html': '/api/',
  'types/Interval.html': '/api/',

  // Bare directory URLs from the old site root.
  'guide/index.html': '/guide/getting-started',
  'examples/index.html': '/examples/basic-usage',
};

const distDir = join(__dirname, '../.vitepress/dist');

function html(target: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Redirecting…</title>
<link rel="canonical" href="https://www.realtime-bpm-analyzer.com${target}">
<meta http-equiv="refresh" content="0; url=${target}">
<script>location.replace(${JSON.stringify(target)} + location.search + location.hash);</script>
</head>
<body>
<p>This page has moved. <a href="${target}">Continue to the new page</a>.</p>
</body>
</html>
`;
}

console.log('Generating legacy URL redirects…');

let count = 0;
for (const [from, to] of Object.entries(redirects)) {
  const outPath = join(distDir, from);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html(to));
  count++;
}

console.log(`Wrote ${count} redirect pages to ${distDir}`);
