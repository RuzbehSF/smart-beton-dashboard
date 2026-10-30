import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { wrapSelection, prefixLines, numberLines, linkSelection, codeBlock } from '../src/markdownEdit.ts';

test('bold wraps the selection and unwraps it again', () => {
  const wrapped = wrapSelection('say hello now', 4, 9, '**');
  assert.equal(wrapped.text, 'say **hello** now');
  assert.equal(wrapped.text.slice(wrapped.start, wrapped.end), 'hello');
  const again = wrapSelection(wrapped.text, wrapped.start, wrapped.end, '**');
  assert.equal(again.text, 'say hello now');
  assert.equal(again.text.slice(again.start, again.end), 'hello');
  assert.equal(wrapSelection('say **hello** now', 4, 13, '**').text, 'say hello now');
  // Unwraps when double-clicking just the inner word without the asterisks
  const innerUnwrap = wrapSelection('say **hello** now', 6, 11, '**');
  assert.equal(innerUnwrap.text, 'say hello now');
  assert.equal(innerUnwrap.start, 4);
  assert.equal(innerUnwrap.end, 9);
  // Unwraps empty markers when cursor is right in the middle
  assert.equal(wrapSelection('****', 2, 2, '**').text, '');
});
test('italic and code toggle using the selection returned by the first edit', () => {
  for (const marker of ['*', '`']) {
    const on = wrapSelection('hello', 0, 5, marker);
    const off = wrapSelection(on.text, on.start, on.end, marker);
    assert.equal(off.text, 'hello');
  }
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
  // Selecting from line 1 to the first character of line 2 includes line 2
  const multi = prefixLines('line 1\nline 2', 0, 7, '- ');
  assert.equal(multi.text, '- line 1\n- line 2');
});
test('numbering counts from one and toggles off', () => {
  const on = numberLines('a\nb\nc', 0, 5);
  assert.equal(on.text, '1. a\n2. b\n3. c');
  assert.equal(numberLines(on.text, 0, on.text.length).text, 'a\nb\nc');
  // Selecting from line 1 to the start of line 2 includes line 2
  const multiNumber = numberLines('first\nsecond', 0, 6);
  assert.equal(multiNumber.text, '1. first\n2. second');
});
test('formatting an empty first line does not duplicate the newline', () => {
  assert.equal(prefixLines('\nnext', 0, 0, '> ').text, '> \nnext');
  assert.equal(numberLines('\nnext', 0, 0).text, '1. \nnext');
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
