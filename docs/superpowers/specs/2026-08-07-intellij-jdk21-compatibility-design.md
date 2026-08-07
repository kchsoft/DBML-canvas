# IntelliJ JDK 21 Compatibility Design

## Goal

Build DBML Canvas with JDK 21 while supporting IntelliJ IDEA 2025.3 and later, including the locally installed IntelliJ IDEA 2026.2.

## Compatibility Strategy

- Compile against IntelliJ Platform 2025.3, whose branch number is `253` and whose required Java version is 21.
- Keep Kotlin and Java compilation on a JDK 21 toolchain.
- Set the plugin's minimum compatible IDE build to `253`.
- Do not declare an `untilBuild`, so newer IDE builds can install the plugin.
- Treat compatibility with newer IDEs as something to verify, not assume. The initial verification target is the locally installed IntelliJ IDEA 2026.2 (`IU-262.8665.337`).

This keeps the plugin bytecode compatible with Java 21. IntelliJ IDEA 2026.2 runs on its bundled JBR 25, which can load the older Java 21 bytecode; it does not require the Spring project or the system default JDK to move to Java 25.

## Build Tooling

- Add and commit a Gradle 9.0.0 wrapper, the minimum supported version for IntelliJ Platform Gradle Plugin 2.18.1.
- Use the wrapper for all documented commands instead of relying on a globally installed Gradle.
- Resolve IntelliJ Platform as a multi-OS archive (`useInstaller = false`) and add `jetbrainsRuntime()` explicitly. This avoids macOS DMG mounting in restricted build environments while still providing the JBR required by IDE tasks.
- Keep the shared webview build as an explicit prerequisite for IntelliJ plugin builds. The Gradle resource task copies the already-built `apps/host-webview/dist` output into the plugin.

## Files to Change

- `apps/intellij-plugin/gradle.properties`: change the target platform from 2026.2 to 2025.3.
- `apps/intellij-plugin/build.gradle.kts`: change `sinceBuild` from `262` to `253`, keep `jvmToolchain(21)`, omit `untilBuild`, and use an archive platform dependency with an explicit JBR.
- `apps/intellij-plugin/gradlew`, `gradlew.bat`, and `gradle/wrapper/*`: add the Gradle wrapper.
- Root and IntelliJ adapter READMEs: document the JDK 21 workflow, minimum IDE version, webview prerequisite, sandbox run, and plugin packaging commands.

## Verification

1. Build the shared host webview from the repository root.
2. Run the Gradle wrapper with JDK 21 and confirm its JVM/toolchain environment.
3. Build the plugin distribution with `./gradlew buildPlugin`.
4. Confirm the generated plugin descriptor has `since-build="253"` and no upper build restriction.
5. Confirm the development IDE task can start the 2025.3 sandbox; stop it after the startup signal instead of treating it as an automated UI test.
6. Leave the generated ZIP for the user's manual installation test in the locally installed IntelliJ IDEA 2026.2. Do not claim runtime compatibility with 2026.2 until that manual check is completed.

Because this change is build configuration rather than application behavior, verification is build- and artifact-based instead of adding an application unit test.

## Non-Goals

- Moving the Spring project to Java 25.
- Using IntelliJ 2026.2-only APIs.
- Adding Marketplace signing or publishing credentials.
- Expanding support below IntelliJ IDEA 2025.3 in this change.
