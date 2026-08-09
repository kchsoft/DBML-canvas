import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { generateThirdPartyNotices } from '../scripts/generate-third-party-notices.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

test('generates notices for shipped runtime dependencies only', async () => {
  const notices = await generateThirdPartyNotices(repoRoot);

  assert.match(notices, /@dbml\/core 9\.1\.1/);
  assert.match(notices, /Apache-2\.0/);
  assert.match(notices, /Copyright 2019 Holistics Software Pte Ltd\./);
  assert.match(notices, /@xyflow\/react 12\.11\.2/);
  assert.match(notices, /@tisoap\/react-flow-smart-edge 4\.13\.1/);
  assert.match(notices, /Custom React Flow Edge that never intersects with other nodes|MIT License/i);
  assert.match(notices, /react 19\.2\.8/);
  assert.doesNotMatch(notices, /lightningcss/);
  assert.doesNotMatch(notices, /did not include a standalone license file/);
  assert.match(notices, /not affiliated with or endorsed by Holistics or dbdiagram\.io/i);
});
