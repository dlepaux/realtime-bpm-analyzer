// swift-tools-version:5.9
// 5.9 is Xcode 15's Swift, older than any Xcode the App Store still takes, so every app's toolchain resolves this
// manifest; `enableExperimentalFeature` needs 5.8. CI builds and tests on 5.9 itself and on the newest Swift, on Linux,
// so the floor is tested rather than claimed.

import PackageDescription

let package = Package(
    name: "RealtimeBpmAnalyzer",
    // The oldest systems Swift concurrency back-deploys to, which is how an app takes this long call off the main
    // thread (every public type is Sendable for it). The library needs nothing newer: Foundation only, no Apple
    // framework, which is also why Linux, needing no entry, builds what these build
    platforms: [
        .macOS(.v10_15),
        .iOS(.v13),
    ],
    products: [
        .library(name: "RealtimeBpmAnalyzer", targets: ["RealtimeBpmAnalyzer"]),
    ],
    targets: [
        .target(
            name: "RealtimeBpmAnalyzer",
            swiftSettings: [.enableExperimentalFeature("StrictConcurrency")]
        ),
        .testTarget(
            name: "RealtimeBpmAnalyzerTests",
            dependencies: ["RealtimeBpmAnalyzer"]
        ),
    ]
)
