// @vitest-environment jsdom
import React from 'react';
import {afterEach, expect, test} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import {Markdown} from '../src/Markdown';
afterEach(cleanup);
test('markup in notes is shown as text, never executed', () => {
  const {container} = render(<Markdown source={'<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>'}/>);
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toContain('<script>alert(1)</script>');
});
test('only http and https links become anchors', () => {
  const {container} = render(<Markdown source={'[ok](https://example.test/a) and [bad](javascript:alert(1))'}/>);
  const links = container.querySelectorAll('a');
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute('href')).toBe('https://example.test/a');
  expect(container.textContent).toContain('[bad](javascript:alert(1))');
});
test('headings, lists, checklists and code blocks render', () => {
  const {container} = render(<Markdown source={'# Title\n\n- one\n- [x] done\n\n1. first\n\n```ts\nconst a = 1;\n```'}/>);
  expect(screen.getByRole('heading', {name: 'Title'})).toBeTruthy();
  expect(container.querySelectorAll('ul li')).toHaveLength(2);
  expect((container.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(true);
  expect(container.querySelector('ol li')?.textContent).toBe('first');
  expect(container.querySelector('pre code')?.textContent).toBe('const a = 1;');
});
test('malformed markdown always terminates', () => {
  render(<Markdown source={'####### x\n#\n1. \n- \n>\n```'}/>);
});
