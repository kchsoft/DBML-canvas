import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DetailsCard } from '../dist/DetailsCard.js';

const baseColumn = {
  kind: 'column',
  id: 'public.members.status',
  name: 'status',
  type: 'member_status',
  indexes: [],
  compactLabels: [],
  fullConstraints: [],
  foreignKeys: [],
};

test('renders enum values and notes in declaration order', async () => {
  const markup = renderToStaticMarkup(createElement(DetailsCard, {
    detail: {
      ...baseColumn,
      enum: {
        id: 'public.member_status',
        name: 'member_status',
        values: [
          { name: 'pending', note: 'Awaiting review' },
          { name: 'active' },
          {
            name: 'archived_after_extended_compliance_review',
            note: 'Retained for historical records after a long compliance review.',
          },
        ],
      },
    },
    mode: 'view',
  }));
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(markup, /<h4>Allowed values<\/h4>/);
  assert.match(
    markup,
    /<code>pending<\/code>[\s\S]*Awaiting review[\s\S]*<code>active<\/code>/,
  );
  assert.match(markup, /<ul class="dbml-details-list dbml-enum-values"/);
  assert.match(markup, /aria-label="member_status values"/);
  assert.match(markup, /tabindex="0"/);
  assert.match(markup, /archived_after_extended_compliance_review/);
  assert.match(css, /\.dbml-enum-values\s*\{[^}]*max-height:/s);
  assert.match(css, /\.dbml-enum-values\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.dbml-enum-values:focus-visible\s*\{[^}]*outline:/s);
  assert.match(css, /\.dbml-enum-values li\s*\{[^}]*flex-wrap:\s*wrap;/s);
});

test('omits allowed values for a normal column', () => {
  const markup = renderToStaticMarkup(createElement(DetailsCard, {
    detail: baseColumn,
    mode: 'view',
  }));

  assert.doesNotMatch(markup, /Allowed values/);
});
