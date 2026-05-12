// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DetexifyNextMac",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "DetexifyNextMac", targets: ["DetexifyNextMac"]),
    ],
    dependencies: [
        .package(url: "https://github.com/sindresorhus/KeyboardShortcuts", from: "2.3.0"),
    ],
    targets: [
        .executableTarget(
            name: "DetexifyNextMac",
            dependencies: ["KeyboardShortcuts"],
            resources: [.copy("Resources")]
        ),
    ]
)
