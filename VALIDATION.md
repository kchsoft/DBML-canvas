# Validation notes

Validation completed on 2026-08-07:

- `npm test` passed 26 tests:
  - core: 7 tests for schema mapping, layout handling, and DBML Note edits;
  - renderer: 10 tests for theme propagation, detail content, focus behavior, five-color settings, FK derivation, annotations, and trackpad controls;
  - browser sandbox: 5 tests for source editing and split-pane behavior;
  - shared host webview: 4 tests for Note edit request correlation and theme preferences.
- `npm run typecheck` passed for core, renderer, browser sandbox, host webview, and the VS Code extension.
- `npm run build` completed all JavaScript/TypeScript production builds. Vite reported only the existing large-chunk advisory.
- IntelliJ plugin Kotlin source compiled successfully against IntelliJ IDEA 2025.3 with Temurin JDK 21:

```bash
JAVA_HOME=/Users/changhyeonkim/Library/Java/JavaVirtualMachines/temurin-21.0.11/Contents/Home \
  ./gradlew --no-daemon --console=plain compileKotlin
```

- No IntelliJ plugin distribution was built or installed during this change.

The automated browser visual smoke test was not completed because no controllable browser was connected to the environment. Manually verify these interactions before publishing:

- hover a table header and move into its Note/index card;
- hover a column and confirm its constraints, default, indexes, and FK target;
- edit, create, and clear table and column DBML Notes;
- open the gear menu and select/reset each of the five colors;
- repeat the card checks in light and dark modes and near both canvas edges;
- confirm native Undo/Redo after Note edits in VS Code and IntelliJ.
