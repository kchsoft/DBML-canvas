# IntelliJ JDK 21 Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build DBML Canvas with JDK 21 for IntelliJ IDEA 2025.3 and later, package it with a reproducible Gradle wrapper, and leave a plugin ZIP ready for manual testing in IntelliJ IDEA 2026.2.

**Architecture:** Compile against the oldest supported IntelliJ Platform branch (`2025.3`, build `253`) and emit Java 21 bytecode. Leave `untilBuild` unset so newer IDEs may install the plugin, while treating the local 2026.2 runtime check as a separate manual verification rather than an automatic compatibility claim.

**Tech Stack:** Kotlin 2.2.0, JDK 21, IntelliJ Platform Gradle Plugin 2.18.1, Gradle Wrapper 9.0.0, Vite host webview

## Global Constraints

- The minimum supported IntelliJ Platform is 2025.3, build branch `253`.
- Kotlin and Java compilation use JDK 21.
- No `untilBuild` is declared.
- The Spring project and its Java version are outside this change.
- The shared host webview must be built before packaging the IntelliJ plugin.
- Resolve the target IDE with `useInstaller = false` and provide `jetbrainsRuntime()` explicitly so restricted build environments do not need to mount a DMG.
- Marketplace signing and publishing are outside this change.
- No Git worktree is used, per the user's instruction.

---

### Task 1: JDK 21 IntelliJ compatibility baseline and Gradle wrapper

**Files:**
- Modify: `apps/intellij-plugin/gradle.properties`
- Modify: `apps/intellij-plugin/build.gradle.kts`
- Create: `apps/intellij-plugin/gradlew`
- Create: `apps/intellij-plugin/gradlew.bat`
- Create: `apps/intellij-plugin/gradle/wrapper/gradle-wrapper.jar`
- Create: `apps/intellij-plugin/gradle/wrapper/gradle-wrapper.properties`

**Interfaces:**
- Consumes: IntelliJ Platform version from the `platformVersion` Gradle property.
- Produces: Java 21 plugin classes, `since-build="253"`, and repository-local `./gradlew` commands.

- [ ] **Step 1: Record the failing compatibility baseline**

Run:

```bash
rg -n 'platformVersion=2026\.2|sinceBuild = "262"' \
  apps/intellij-plugin/gradle.properties \
  apps/intellij-plugin/build.gradle.kts
```

Expected: both obsolete 2026.2-only settings are found. This is the configuration-level RED condition.

- [ ] **Step 2: Change the compile platform and minimum build**

Set the exact values below:

```properties
platformVersion=2025.3
```

```kotlin
intellijIdea(providers.gradleProperty("platformVersion")) {
    useInstaller = false
}
jetbrainsRuntime()

kotlin {
    jvmToolchain(21)
}

ideaVersion {
    sinceBuild = "253"
}
```

Do not add `untilBuild`.

- [ ] **Step 3: Generate the Gradle 9.0.0 wrapper**

Run from `apps/intellij-plugin` with the installed Temurin 21 JDK:

```bash
JAVA_HOME=/Users/changhyeonkim/Library/Java/JavaVirtualMachines/temurin-21.0.11/Contents/Home \
  /Users/changhyeonkim/.gradle/wrapper/dists/gradle-9.0.0-bin/d6wjpkvcgsg3oed0qlfss3wgl/gradle-9.0.0/bin/gradle \
  wrapper --gradle-version 9.0.0 --distribution-type bin
```

Expected: wrapper scripts, wrapper JAR, and `distributionUrl=https\://services.gradle.org/distributions/gradle-9.0.0-bin.zip` are generated.

- [ ] **Step 4: Verify the wrapper and JDK**

Run:

```bash
JAVA_HOME=/Users/changhyeonkim/Library/Java/JavaVirtualMachines/temurin-21.0.11/Contents/Home ./gradlew --version
```

Expected: Gradle 9.0.0 and JVM 21.0.11.

- [ ] **Step 5: Verify obsolete compatibility settings are gone**

Run:

```bash
if rg -n 'platformVersion=2026\.2|sinceBuild = "262"|untilBuild' \
  gradle.properties build.gradle.kts; then exit 1; fi
```

Expected: exit code 0 with no matches.

- [ ] **Step 6: Commit the compatibility baseline**

```bash
git add apps/intellij-plugin/build.gradle.kts \
  apps/intellij-plugin/gradle.properties \
  apps/intellij-plugin/gradlew \
  apps/intellij-plugin/gradlew.bat \
  apps/intellij-plugin/gradle/wrapper
git commit -m "build: target IntelliJ 2025.3 with JDK 21"
```

---

### Task 2: Developer workflow documentation and plugin artifact verification

**Files:**
- Modify: `README.md`
- Modify: `apps/intellij-plugin/README.md`
- Generated and ignored: `apps/host-webview/dist/**`
- Generated and ignored: `apps/intellij-plugin/build/distributions/*.zip`

**Interfaces:**
- Consumes: the Gradle wrapper and compatibility baseline from Task 1, plus `npm run build:webview` output.
- Produces: reproducible run/package instructions and a plugin ZIP whose descriptor declares `since-build="253"` without `until-build`.

- [ ] **Step 1: Document the root IntelliJ workflow**

Replace the global `gradle runIde` instructions with these commands and explain that JDK 21 is required for the plugin build:

```bash
npm run build:webview
cd apps/intellij-plugin
./gradlew runIde
```

Also document packaging:

```bash
./gradlew buildPlugin
```

State that the ZIP is written to `apps/intellij-plugin/build/distributions/` and can be installed with IntelliJ's **Install Plugin from Disk** action.

- [ ] **Step 2: Document compatibility and testing boundaries in the adapter README**

State all of the following explicitly:

- Minimum IDE: IntelliJ IDEA 2025.3 (`253`).
- Build JDK: 21.
- Newer IDEs have no declared upper bound but must be tested before release.
- Local manual target: IntelliJ IDEA 2026.2.
- Webview assets must be rebuilt after frontend changes.
- Marketplace verification, signing, and publishing remain future work.

- [ ] **Step 3: Build the shared host webview**

Run from the repository root:

```bash
npm run build:webview
```

Expected: Vite production build exits 0 and creates `apps/host-webview/dist/index.html` plus assets.

- [ ] **Step 4: Build the plugin ZIP with JDK 21**

Run from `apps/intellij-plugin`:

```bash
JAVA_HOME=/Users/changhyeonkim/Library/Java/JavaVirtualMachines/temurin-21.0.11/Contents/Home ./gradlew clean buildPlugin
```

Expected: `BUILD SUCCESSFUL` and a ZIP under `build/distributions/`.

- [ ] **Step 5: Inspect the packaged plugin descriptor**

Extract the distribution into a temporary directory, locate the plugin JAR, and print `META-INF/plugin.xml`:

```bash
artifact_dir=$(mktemp -d)
unzip -q build/distributions/dbml-canvas-intellij-0.1.0.zip -d "$artifact_dir"
plugin_jar=$(find "$artifact_dir" -path '*/lib/dbml-canvas-intellij-*.jar' -print -quit)
unzip -p "$plugin_jar" META-INF/plugin.xml
```

Expected: `<idea-version since-build="253"/>` and no `until-build` attribute. Also confirm `webview/index.html` and its bundled assets exist in the plugin JAR.

- [ ] **Step 6: Run final repository checks**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only the intended README and plan changes remain before the final commit.

- [ ] **Step 7: Commit documentation and the verified workflow**

```bash
git add README.md apps/intellij-plugin/README.md \
  docs/superpowers/plans/2026-08-07-intellij-jdk21-compatibility.md
git commit -m "docs: add IntelliJ plugin development workflow"
```

- [ ] **Step 8: Hand off manual IntelliJ 2026.2 verification**

Provide the absolute ZIP path and these steps:

1. IntelliJ IDEA 2026.2 → Settings → Plugins.
2. Gear menu → Install Plugin from Disk.
3. Select the generated ZIP and restart.
4. Open a project containing a `.dbml` file.
5. Open the **DBML Canvas** tool window and verify rendering, dragging, dark mode controls, and sidecar layout saving.

Do not report IntelliJ 2026.2 runtime compatibility as verified until the user completes this manual check.
