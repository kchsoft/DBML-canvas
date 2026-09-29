<div align="center">

<img src="dbml-canvas-logo.svg" alt="DBML Canvas 로고" width="96" />

# DBML Canvas

**Git 친화적이고 AI가 읽을 수 있는 DBML 기반 ERD 워크플로우 — 브라우저, VS Code, JetBrains IDE에서.**

[English](README.md) | 한국어

[![VS Code Marketplace](https://vsmarketplacebadges.dev/version-short/thinkgrowstudio.dbml-canvas-vscode.svg?label=VS%20Code%20Marketplace&colorB=007ACC)](https://marketplace.visualstudio.com/items?itemName=thinkgrowstudio.dbml-canvas-vscode)
[![VS Code Installs](https://vsmarketplacebadges.dev/installs-short/thinkgrowstudio.dbml-canvas-vscode.svg?colorB=007ACC)](https://marketplace.visualstudio.com/items?itemName=thinkgrowstudio.dbml-canvas-vscode)
[![JetBrains Plugin](https://img.shields.io/jetbrains/plugin/v/33410?label=JetBrains%20Marketplace&logo=jetbrains&color=000000)](https://plugins.jetbrains.com/plugin/33410-dbml-canvas)
[![JetBrains Downloads](https://img.shields.io/jetbrains/plugin/d/33410?label=downloads&color=000000)](https://plugins.jetbrains.com/plugin/33410-dbml-canvas)

![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![React Flow](https://img.shields.io/badge/React%20Flow-12-FF0072)
![Kotlin](https://img.shields.io/badge/Kotlin-IntelliJ%20Platform-7F52FF?logo=kotlin&logoColor=white)
![Node](https://img.shields.io/badge/Node-%3E%3D22-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-Proprietary-lightgrey)

<img src="screen-capture/image2.png" alt="DBML Canvas로 렌더링한 대규모 스키마" width="900" />

</div>

---

## 목차

- [왜 DBML Canvas인가?](#왜-dbml-canvas인가)
- [주요 기능](#주요-기능)
- [스크린샷](#스크린샷)
- [설치](#설치)
- [사용법](#사용법)
- [개발 환경](#개발-환경)
- [IDE 플러그인 빌드](#ide-플러그인-빌드)
- [레이아웃 파일 포맷](#레이아웃-파일-포맷)
- [아키텍처](#아키텍처)
- [기술 스택](#기술-스택)
- [로드맵](#로드맵)
- [기여하기](#기여하기)
- [라이선스](#라이선스)
- [감사의 말](#감사의-말)

## 왜 DBML Canvas인가?

대부분의 ERD 도구는 다이어그램을 독자 포맷, 바이너리, 혹은 클라우드에만 저장합니다. 그래서 PR에서 스키마 변경을 리뷰하기 어렵고, 코딩 에이전트가 읽을 수도 없습니다.

DBML Canvas는 스키마의 **내용**과 **모양**을 분리합니다.

| 파일 | 역할 |
| --- | --- |
| `schema.dbml` | 테이블·컬럼·관계·enum·Note에 대한 유일한 원본(Source of Truth) |
| `schema.dbml.layout.json` | 테이블 위치, 색상, 뷰포트만 담은 작은 사이드카 파일 |

두 파일 모두 평문 텍스트라 Git diff가 깔끔하고, 사람과 AI 에이전트 모두 읽고 수정할 수 있습니다. 동일한 렌더러가 웹 샌드박스, VS Code 웹뷰, JetBrains JCEF 툴 윈도우에서 그대로 동작합니다.

## 주요 기능

- **DBML → 인터랙티브 ERD** — `@dbml/core`(`dbmlv2` 파서)와 React Flow 기반. 테이블 드래그, 줌, 팬, 미니맵 지원.
- **컬럼 단위 관계선** — FK 선이 정확한 컬럼 핸들에 연결되며, 카디널리티 라벨(`*:1`, `1:1` 등)과 테이블을 피해 가는 직각 라우팅을 제공합니다.
- **풍부한 호버 상세 카드** — 테이블/컬럼 Note, 인덱스, 기본값, 제약조건(`PRIMARY KEY`, `AUTO INCREMENT`, `NOT NULL` 등), FK 대상, enum 값과 값별 Note.
- **캔버스에서 안전한 Note 편집** — 테이블·컬럼 `Note`를 캔버스에서 바로 수정합니다. DBML을 재파싱해 검증한 뒤 최소 텍스트 범위만 IDE 네이티브 API로 적용하므로 **실행 취소/다시 실행이 그대로 동작**합니다.
- **테이블·컬럼 검색** — 스키마 탐색기로 원하는 테이블/컬럼을 찾아 캔버스에서 바로 포커스.
- **이식 가능한 Git 친화적 레이아웃** — 위치와 테마 대응 5가지 테이블 색상을 결정적(deterministic) JSON 사이드카에 저장하며, DBML 자체는 건드리지 않습니다.
- **실시간 반영** — IDE 외부에서 수정한 경우를 포함해 DBML 파일이 바뀌면 ERD가 즉시 갱신됩니다.
- **라이트/다크 테마** — 호스트 IDE 테마를 따르며, 수동 전환도 가능합니다.
- **대규모 스키마 대응** — FK 라우팅을 드래그 세션 단위로 관리해 드래그 중에는 영향받는 선만 갱신합니다.
- **소스 이동** — 캔버스에서 에디터의 DBML 정의 위치로 바로 이동.

## 스크린샷

<table>
  <tr>
    <td align="center" width="50%">
      <img src="screen-capture/image1.png" alt="컬럼 상세 카드" /><br />
      <sub><b>컬럼 상세 카드</b> — 호버 시 제약조건, Note 편집, 인덱스 표시</sub>
    </td>
    <td align="center" width="50%">
      <img src="screen-capture/image3.png" alt="테이블·컬럼 검색" /><br />
      <sub><b>스키마 검색</b> — 테이블·컬럼을 검색하고 캔버스에서 포커스</sub>
    </td>
  </tr>
  <tr>
    <td align="center" colspan="2">
      <img src="screen-capture/image2.png" alt="대규모 스키마 전체 보기" /><br />
      <sub><b>대규모 스키마 전체 보기</b> — 수십 개 테이블과 컬럼 단위 FK 라우팅</sub>
    </td>
  </tr>
</table>

## 설치

| 플랫폼 | 설치 방법 |
| --- | --- |
| **VS Code** | [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=thinkgrowstudio.dbml-canvas-vscode) — 또는 확장(Extensions) 뷰에서 **"DBML Canvas"** 검색 |
| **JetBrains IDE** | [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/33410-dbml-canvas) — **Settings → Plugins → Marketplace**에서 **"DBML Canvas"** 검색 |

JetBrains 플러그인은 IntelliJ IDEA, WebStorm, PyCharm, GoLand, DataGrip 등 **2025.3 이상**의 JetBrains IDE를 지원합니다.

> **성능 팁 (JetBrains):** 다이어그램 조작을 더 부드럽게 하려면 JCEF를 in-process로 실행할 수 있습니다. **Help → Edit Custom VM Options**에서 `-Dide.browser.jcef.out-of-process.enabled=false`를 추가한 뒤 IDE를 완전히 재시작하세요.

## 사용법

1. `.dbml` 파일을 엽니다.
2. **VS Code:** 에디터 툴바의 **DBML Canvas: Open Preview**를 클릭합니다(커맨드 팔레트에서도 실행 가능).
   **JetBrains:** **DBML Canvas** 툴 윈도우를 엽니다.
3. 테이블을 드래그해 배치하면 레이아웃이 스키마 파일 옆에 자동 저장됩니다.

```text
schema.dbml
schema.dbml.layout.json   ← 위치, 색상, 뷰포트 (자동 생성)
```

두 파일을 함께 커밋하면 팀원(과 AI 에이전트)이 같은 다이어그램을 보게 됩니다.

## 개발 환경

### 요구 사항

- Node.js **22** 이상
- (IntelliJ 플러그인만) JDK **21**

### 브라우저 샌드박스 실행

```bash
npm install
npm run dev
```

Vite가 출력한 URL을 열면 됩니다. 바로 열어볼 수 있는 예제는 [`examples/schema.dbml`](examples/schema.dbml)에 있습니다.

### 빌드, 타입 체크, 테스트

```bash
npm run build       # 모든 JS/TS 패키지와 앱 빌드
npm run typecheck   # 워크스페이스 타입 체크
npm test            # 단위 테스트 (core, renderer, apps, 라이선스 고지)
```

## IDE 플러그인 빌드

### VS Code

```bash
npm run build:vscode
```

VS Code에서 `apps/vscode-extension`을 열고 Extension Development Host를 실행한 뒤, `.dbml` 파일을 열고 다음 명령을 실행합니다.

```text
DBML Canvas: Open Preview
```

레이아웃은 DBML 파일 옆에 저장됩니다.

```text
schema.dbml
schema.dbml.layout.json
```

배포용 `.vsix` 빌드:

```bash
cd apps/vscode-extension
npm run package
```

### JetBrains (IntelliJ Platform)

```bash
npm run build:webview          # 공용 호스트 웹뷰 빌드
cd apps/intellij-plugin
./gradlew runIde               # 플러그인이 설치된 샌드박스 IDE 실행
./gradlew buildPlugin          # 설치용 ZIP 패키징
```

IntelliJ Platform 2025.3(`253`) 이상을 대상으로 합니다. Gradle 빌드가 `apps/host-webview/dist`를 플러그인 리소스로 자동 복사하므로, 프론트엔드를 수정했다면 웹뷰를 다시 빌드하세요. `build/distributions/`의 ZIP은 **Settings → Plugins → ⚙ → Install Plugin from Disk**로 설치합니다.

## 레이아웃 파일 포맷

```json
{
  "version": 1,
  "nodes": {
    "public.member": { "x": 80, "y": 120, "color": "blue" },
    "public.answer": { "x": 520, "y": 120 }
  },
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```

테이블 ID는 `schema.table`, 컬럼 ID는 `schema.table.column` 형태로 결정적으로 생성됩니다. Note는 항상 DBML에만 존재하며 레이아웃 파일에 중복 저장되지 않습니다.

## 아키텍처

```text
@dbml/core
    ↓  DbmlCoreSchemaParser (어댑터)
ErdSchema  ← 자체 안정 내부 모델
    ↓  applyLayout
React 렌더러 (React Flow)
    ↓  HostBridge 메시지
웹 샌드박스 / VS Code 웹뷰 / IntelliJ JCEF
```

```text
packages/
├── core/            # 순수 TS: 파서 어댑터, ErdSchema, 레이아웃 병합, Note 편집, 호스트 프로토콜
└── renderer/        # React + React Flow: 테이블, FK 선, 상세 카드, 검색
apps/
├── web-sandbox/     # 로컬 레이아웃 저장을 지원하는 브라우저 플레이그라운드
├── host-webview/    # IDE에 임베드되는 공용 웹뷰 앱
├── vscode-extension/# VS Code 어댑터 (TypeScript)
└── intellij-plugin/ # JetBrains 어댑터 (Kotlin, JCEF)
```

핵심 설계 원칙:

1. **DBML만이 스키마 편집의 원본입니다.** 캔버스는 Note만 수정합니다.
2. **렌더러는 파일을 직접 다루지 않으며**, 어떤 호스트에서 실행 중인지도 알지 못합니다.
3. **파서 격리** — UI는 `SchemaParser` 인터페이스만 사용하므로 `@dbml/core`의 변경이 렌더러로 새지 않고, 추후 Prisma·SQL DDL·JPA 파서도 추가할 수 있습니다.
4. **레이아웃 포맷은 React Flow가 아닌 DBML Canvas의 것** — 위치, 뷰포트, 색상 토큰만 저장합니다.

자세한 내용은 [`docs/architecture.md`](docs/architecture.md), 검증 내역은 [`VALIDATION.md`](VALIDATION.md)를 참고하세요.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Core | TypeScript, `@dbml/core` |
| 렌더링 | React 19, React Flow (`@xyflow/react`), `react-flow-smart-edge` |
| 웹 | Vite |
| VS Code | VS Code Extension API, Webview |
| JetBrains | Kotlin, IntelliJ Platform, JCEF, Gradle |
| 도구 | npm workspaces, Node test runner |

## 로드맵

- [x] DBML 파싱 및 인터랙티브 ERD 렌더링
- [x] 호버 상세 카드 및 enum 값 표시
- [x] 네이티브 undo/redo를 지원하는 안전한 테이블·컬럼 Note 편집
- [x] 테이블·컬럼 검색
- [x] 외부 DBML 변경 실시간 반영
- [x] 대규모 스키마 드래그 성능 최적화
- [ ] 관계선 경로 편집
- [ ] 이름 있는 다중 뷰
- [ ] 다중 파일 DBML 프로젝트
- [ ] 통합 파서 에러 모델

## 기여하기

버그 제보와 기능 제안은 [GitHub Issues](https://github.com/kchsoft/DBML-canvas/issues)로 부탁드립니다. DBML Canvas는 독점 라이선스(아래 참고)로 배포되므로, Pull Request를 보내기 전에 먼저 이슈로 논의해 주세요.

커밋 메시지는 [Conventional Commits](https://www.conventionalcommits.org/ko/) 규칙(`feat:`, `fix:`, `perf:`, `docs:`, `chore:` 등)을 따릅니다.

## 라이선스

Copyright © 2026 thinkgrowstudio. All rights reserved.

DBML Canvas는 **독점(Proprietary) 소프트웨어**입니다. 소스 코드는 공개되어 열람할 수 있지만, [최종 사용자 라이선스 계약(EULA)](EULA.md)에서 허용하는 경우를 제외하고 복제·수정·재배포·2차 저작물 작성 권한은 부여되지 않습니다. 전문은 [`LICENSE`](LICENSE)를 참고하세요.

포함된 서드파티 오픈소스 컴포넌트는 각자의 라이선스를 따릅니다. [`THIRD_PARTY_NOTICES.txt`](THIRD_PARTY_NOTICES.txt)를 참고하세요.

## 감사의 말

- Holistics의 [DBML](https://dbml.dbdiagram.io/)과 [`@dbml/core`](https://github.com/holistics/dbml) — 이 프로젝트의 기반이 되는 언어와 파서
- xyflow의 [React Flow](https://reactflow.dev/) — 캔버스 엔진
- [react-flow-smart-edge](https://github.com/tisoap/react-flow-smart-edge) — 엣지 라우팅

> DBML Canvas는 독립 프로젝트이며 Holistics 또는 dbdiagram.io와 제휴하거나 보증받지 않았습니다.

---

<div align="center">

문의: <a href="mailto:studiothinkgrow@gmail.com">studiothinkgrow@gmail.com</a>

</div>
