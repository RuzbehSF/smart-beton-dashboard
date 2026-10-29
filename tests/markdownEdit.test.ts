import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { wrapSelection, prefixLines, numberLines, linkSelection, codeBlock } from '../src/markdownEdit.ts';

test('bold wraps the selection and unwraps it again', () => {
  const wrapped = wrapSelection('say hello now', 4, 9, '**');
  assert.equal(wrapped.text, 'say **hello** now');
  assert.equal(wrapped.text.slice(wrapped.start, wrapped.end), 'hello');
  const again = wrapSelection(wrapped.text, 4, 13, '**');
  assert.equal(again.text, 'say hello now');
});
test('an empty selection gets a placeholder that is selected', () => {
  const edit = wrapSelection('ab', 1, 1, '*');
  assert.equal(edit.text, 'a*text*b');
  assert.equal(edit.text.slice(edit.start, edit.end), 'text');
});
test('list buttons prefix every selected line and toggle off', () => {
  const text = 'one\ntwo\nthree';
  const on = prefixLines(text, 0, text.length, '- ');
  assert.equal(on.text, '- one\n- two\n- three');
  assert.equal(prefixLines(on.text, 0, on.text.length, '- ').text, text);
  assert.equal(prefixLines('a\nb', 2, 2, '> ').text, 'a\n> b');
});
test('numbering counts from one and toggles off', () => {
  const on = numberLines('a\nb\nc', 0, 5);
  assert.equal(on.text, '1. a\n2. b\n3. c');
  assert.equal(numberLines(on.text, 0, on.text.length).text, 'a\nb\nc');
});
test('links select the address so it can be typed over', () => {
  const edit = linkSelection('see docs', 4, 8);
  assert.equal(edit.text, 'see [docs](https://)');
  assert.equal(edit.text.slice(edit.start, edit.end), 'https://');
});
test('code blocks sit on their own lines', () => {
  const edit = codeBlock('x = 1', 0, 5);
  assert.equal(edit.text, '```\nx = 1\n```\n');
  assert.equal(edit.text.slice(edit.start, edit.end), 'x = 1');
  assert.ok(codeBlock('before', 6, 6).text.startsWith('before\n```'));
});
