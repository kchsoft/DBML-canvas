# IntelliJ adapter status

This directory contains a runnable MVP Tool Window adapter.

## Compatibility

- Minimum IDE: IntelliJ IDEA 2025.3 (`253`)
- Build JDK: 21
- Gradle: repository wrapper 9.0.0
- Current manual test target: IntelliJ IDEA 2026.2

The plugin intentionally has no declared upper IDE build limit. Newer IDE versions can install it, but each target version must be tested before release. IntelliJ IDEA 2026.2 uses its bundled JBR 25 at runtime; the plugin and unrelated Spring projects can remain compiled with their own Java versions.

Implemented:

- Declarative Tool Window registration
- JCEF support check
- Shared Vite webview copied into plugin resources
- CSS and JavaScript assets inlined into `loadHTML`, avoiding an external web server
- JavaScript-to-Kotlin message bridge
- Active DBML loading and editor-selection refresh
- Debounced live refresh for IntelliJ editor changes and external file changes after a DBML is selected
- `<schema>.dbml.layout.json` reading and writing
- Double-click source navigation
- Light/dark theme message

## Development

Build the shared webview whenever its frontend or renderer changes:

```bash
# From the repository root
npm run build:webview
```

Then start a sandbox IDE with JDK 21:

```bash
cd apps/intellij-plugin
./gradlew runIde
```

Package an installable plugin ZIP with:

```bash
./gradlew buildPlugin
```

The ZIP is written to `build/distributions/`. Install it from IntelliJ IDEA's **Settings → Plugins → gear menu → Install Plugin from Disk** action.

## Legal resources

The plugin ZIP includes the proprietary DBML Canvas EULA and notices for runtime
open-source dependencies under `META-INF/`. Gradle generates those notices from the
installed production dependency graph during `processResources`.

Whenever production dependencies change, regenerate the checked-in notice file from
the repository root:

```bash
npm run legal:notices
```

Before publishing, use a clean build and run the JetBrains Plugin Verifier:

```bash
./gradlew clean verifyPlugin
```

Before Marketplace release:

1. Add parser and UI integration tests.
2. Add signing and publishing credentials through environment variables.
3. Add a visible refresh/error toolbar and polished empty state.
4. Confirm compatibility across IntelliJ IDEA Community, Ultimate, and DataGrip targets.
