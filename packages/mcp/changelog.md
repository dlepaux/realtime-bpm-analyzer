# Changelog

## 0.1.0 (2026-11-01)


### Features

* **cli:** add --detector peaks or tempogram ([8dab6e1](https://github.com/dlepaux/realtime-bpm-analyzer/commit/8dab6e129db685cc4c94368831385533a0b0862f))
* **mcp:** add the detector argument ([8dab6e1](https://github.com/dlepaux/realtime-bpm-analyzer/commit/8dab6e129db685cc4c94368831385533a0b0862f))
* **mcp:** add the realtime-bpm-analyzer-mcp server ([#281](https://github.com/dlepaux/realtime-bpm-analyzer/issues/281)) ([34f00d3](https://github.com/dlepaux/realtime-bpm-analyzer/commit/34f00d3734dfebf471f694a1ae6e07cc50f676df))
* **realtime:** add BpmAnalyzer.input, the node to connect a source to with either detector ([8dab6e1](https://github.com/dlepaux/realtime-bpm-analyzer/commit/8dab6e129db685cc4c94368831385533a0b0862f))
* **realtime:** add tempogramMode 'extension', which refuses any option that would leave those settings, for a browser extension listening to a tab ([8dab6e1](https://github.com/dlepaux/realtime-bpm-analyzer/commit/8dab6e129db685cc4c94368831385533a0b0862f))
* **realtime:** add the opt-in tempogram detector's locked settings, searching 90 to 180 BPM on real-time audio and whole files, where a tempo over 180 reads half ([8dab6e1](https://github.com/dlepaux/realtime-bpm-analyzer/commit/8dab6e129db685cc4c94368831385533a0b0862f))


### Bug Fixes

* **cli:** bound decoded audio, not file size, on every decoder path ([#292](https://github.com/dlepaux/realtime-bpm-analyzer/issues/292)) ([9a71c50](https://github.com/dlepaux/realtime-bpm-analyzer/commit/9a71c50318b53cb874ea6e2aecc36f12a892c9cc))
