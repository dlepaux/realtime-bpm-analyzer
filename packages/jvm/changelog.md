# Changelog

## [6.2.1](https://github.com/dlepaux/realtime-bpm-analyzer/compare/jvm-v6.2.0...jvm-v6.2.1) (2026-11-17)


### Bug Fixes

* **jvm:** name the level-relative peaks reading where confidence() documents its null (RBA-221) ([32a36cb](https://github.com/dlepaux/realtime-bpm-analyzer/commit/32a36cb9e89f616700b77d7540a4a81991d412c2))
* **jvm:** read quiet and bass-light files with the peaks engine, as the JS library now does (RBA-221) ([aa7a15e](https://github.com/dlepaux/realtime-bpm-analyzer/commit/aa7a15eabf3eb9e638ba1d79c5805982944afd20))
* **peaks:** read quiet and bass-light files that returned no tempo, in the library and its four ports (RBA-221) ([b76386a](https://github.com/dlepaux/realtime-bpm-analyzer/commit/b76386aec8f34895cfd766ecbba522fc05c36e91))

## 6.2.0 (2026-11-16)


### Features

* 6.2, the BPM engine in Java and Python, held to the JS readings by shared conformance vectors ([a040a22](https://github.com/dlepaux/realtime-bpm-analyzer/commit/a040a22eff70aa137050da1bb633d5a1f579592c))
* **jvm:** port the offline analysis to pure Java (RBA-256) ([53593a4](https://github.com/dlepaux/realtime-bpm-analyzer/commit/53593a44c19033c114959025a4f1ad1a226d372a))
* **jvm:** port the offline analysis to pure Java, held to the JS readings by the conformance vectors (RBA-256) ([7a88bec](https://github.com/dlepaux/realtime-bpm-analyzer/commit/7a88becc3ffc01d1bc1c158892b5db9eaa3bcaa0))


### Bug Fixes

* **jvm:** check the peaks floor after the lowpass, the JS library's order ([7c7039c](https://github.com/dlepaux/realtime-bpm-analyzer/commit/7c7039cf8d7a5f229cf6ea51c30e432eeec618a8))
* **jvm:** fail CI on any Maven failure and state the port's limits as they are (RBA-256) ([a97442d](https://github.com/dlepaux/realtime-bpm-analyzer/commit/a97442d5f19df96e63db7ff02526b456fff5dc7c))
* **jvm:** refuse what the JS library now refuses, so the port passes the RBA-260 vectors ([2c50bbf](https://github.com/dlepaux/realtime-bpm-analyzer/commit/2c50bbf6fc7f627714f024e1b75e6a9160e3fc0e))
* refuse peaks under 2 Hz, bound tempoRange, refuse non-finite samples, and pin the edges in the vectors (RBA-260) ([1407ee7](https://github.com/dlepaux/realtime-bpm-analyzer/commit/1407ee7c5d1568bd8ccacf3e14506ad6ebbcdc37))


### Documentation

* **analyze:** wrap TempoRange's doc, and say why Java's peaks floor follows its lowpass ([e6d9ff9](https://github.com/dlepaux/realtime-bpm-analyzer/commit/e6d9ff98314c9235df4f11d443bb14f3b058ad32))
