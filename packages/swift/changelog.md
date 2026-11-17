# Changelog

## [6.3.0](https://github.com/dlepaux/realtime-bpm-analyzer/compare/swift-v6.2.1...swift-v6.3.0) (2026-11-17)


### Bug Fixes

* **swift:** refuse tempogram sample rates under 122.97509238026915 Hz, as the JS library now does (RBA-261) ([464624c](https://github.com/dlepaux/realtime-bpm-analyzer/commit/464624cda5b2657beadbfac9d934142e11116207))
* **tempogram:** refuse sample rates under its FFT's floor, 122.97509238026915 Hz, in the library and every port (RBA-261) ([61603fc](https://github.com/dlepaux/realtime-bpm-analyzer/commit/61603fc8cc17b967f303f3f3fbf262bdf10ca593))

## [6.2.1](https://github.com/dlepaux/realtime-bpm-analyzer/compare/swift-v6.2.0...swift-v6.2.1) (2026-11-17)


### Bug Fixes

* **peaks:** read quiet and bass-light files that returned no tempo, in the library and its four ports (RBA-221) ([b76386a](https://github.com/dlepaux/realtime-bpm-analyzer/commit/b76386aec8f34895cfd766ecbba522fc05c36e91))
* **swift:** size RBA-221's level window before the empty check again, as JS does ([95591e1](https://github.com/dlepaux/realtime-bpm-analyzer/commit/95591e1314f10d26625f0804d21540b9d6edea2d))

## 6.2.0 (2026-11-17)


### Features

* **swift:** port the offline analysis to Swift, held to the JS readings by the conformance vectors (RBA-265) ([7ea076f](https://github.com/dlepaux/realtime-bpm-analyzer/commit/7ea076fb5ef99910d01eca1654a2a88680dfe24b))
* **swift:** port the offline analysis to Swift, held to the JS readings by the conformance vectors (RBA-265) ([1528221](https://github.com/dlepaux/realtime-bpm-analyzer/commit/15282217f46c366a117adaa3143ddf55e0c56264))
* **swift:** ship the Swift port through its mirror, dlepaux/realtime-bpm-analyzer-swift (RBA-272) ([13675b9](https://github.com/dlepaux/realtime-bpm-analyzer/commit/13675b9fc1abaf1a6312f4df672598845deeb07f))


### Bug Fixes

* **swift:** write the calibration tables in millionths, as Swift 5.9 on x86_64 misread one literal (RBA-265) ([769833a](https://github.com/dlepaux/realtime-bpm-analyzer/commit/769833af945411e4ae417df93e4446dedc879d4a))
