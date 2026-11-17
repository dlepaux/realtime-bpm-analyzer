# Changelog

## [6.2.2](https://github.com/dlepaux/realtime-bpm-analyzer/compare/python-v6.2.1...python-v6.2.2) (2026-11-17)


### Bug Fixes

* **peaks:** read quiet and bass-light files that returned no tempo, in the library and its four ports (RBA-221) ([b76386a](https://github.com/dlepaux/realtime-bpm-analyzer/commit/b76386aec8f34895cfd766ecbba522fc05c36e91))
* **python:** read quiet and bass-light files with the peaks engine, as the JS library now does (RBA-221) ([233d119](https://github.com/dlepaux/realtime-bpm-analyzer/commit/233d11980e0aa3a6bdfb0b826dcab13cbf271bf1))

## [6.2.1](https://github.com/dlepaux/realtime-bpm-analyzer/compare/python-v6.2.0...python-v6.2.1) (2026-11-17)


### Bug Fixes

* **python:** ship PyPI's project page without 6.2.0's "not on PyPI yet" note (RBA-262) ([fef6753](https://github.com/dlepaux/realtime-bpm-analyzer/commit/fef675329126c348836369e0760a6d47d95b19ff))

## 6.2.0 (2026-11-16)


### Features

* 6.2, the BPM engine in Java and Python, held to the JS readings by shared conformance vectors ([a040a22](https://github.com/dlepaux/realtime-bpm-analyzer/commit/a040a22eff70aa137050da1bb633d5a1f579592c))
* **python:** port the offline analysis to Python, held to the JS readings by the conformance vectors (RBA-257) ([6a568bc](https://github.com/dlepaux/realtime-bpm-analyzer/commit/6a568bc46e02d95b92353856d5f93443e7a15c4b))
* **python:** port the offline analysis to Python, held to the JS readings by the conformance vectors (RBA-257) ([03116a2](https://github.com/dlepaux/realtime-bpm-analyzer/commit/03116a22b1969c35dc5e755a9e6c5dc331f78679))


### Bug Fixes

* **python:** check the peaks floor where the JS library does, and state the new refusals ([1563a13](https://github.com/dlepaux/realtime-bpm-analyzer/commit/1563a1373a3156ec51bdf901f6e647b43194bdc3))
* **python:** refuse integer PCM and the two inputs the JS library can't finish, and tighten the harness (RBA-257) ([59ac8bf](https://github.com/dlepaux/realtime-bpm-analyzer/commit/59ac8bf0649ffa3500570f723e52c3e795c7ba65))
* **python:** refuse integer samples whatever holds them (RBA-257) ([cc97a57](https://github.com/dlepaux/realtime-bpm-analyzer/commit/cc97a5718336efb8e572057c241e75e4c6afa882))
* **python:** refuse non-finite samples and the new tempoRange bounds, as JS 6.2.0 does ([6c54b30](https://github.com/dlepaux/realtime-bpm-analyzer/commit/6c54b30f77035a282f3f15feea254653db7958ed))
* refuse peaks under 2 Hz, bound tempoRange, refuse non-finite samples, and pin the edges in the vectors (RBA-260) ([1407ee7](https://github.com/dlepaux/realtime-bpm-analyzer/commit/1407ee7c5d1568bd8ccacf3e14506ad6ebbcdc37))


### Documentation

* **python:** make the readme read right as the PyPI page, and link the changelog (RBA-259) ([6ec0566](https://github.com/dlepaux/realtime-bpm-analyzer/commit/6ec05665da60a6bb7538128e874d0a49bf927b5b))
