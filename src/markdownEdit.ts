/** Pure text edits for the note editor's formatting buttons. Each returns the new text and the selection to restore. */
export type TextEdit = {text: string; start: number; end: number};

/** Wraps the selection (or a placeholder) in markers, or removes them when the selection is already wrapped. */
export function wrapSelection(text: string, start: number, end: number, before: string, after: string = before, placeholder = 'text'): TextEdit {
  const selected = text.slice(start, end);
  if (selected.length >= before.length + after.length && selected.startsWith(before) && selected.endsWith(after)) {
    const inner = selected.slice(before.length, selected.length - after.length);
    return {text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length};
  }
  if (start >= before.length && text.slice(start - before.length, start) === before && text.slice(end, end + after.length) === after) {
    return {text: text.slice(0, start - before.length) + selected + text.slice(end + after.length), start: start - before.length, end: end - before.length};
  }
  const body = selected || placeholder;
  return {text: text.slice(0, start) + before + body + after + text.slice(end), start: start + before.length, end: start + before.length + body.length};
}

function lineRange(text: string, start: number, end: number): [number, number] {
  const from = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  const stop = text.indexOf('\n', end);
  return [from, stop === -1 ? text.length : stop];
}

/** Adds a prefix to every selected line, or removes it when every line already has it. */
export function prefixLines(text: string, start: number, end: number, prefix: string): TextEdit {
  const [from, to] = lineRange(text, start, end);
  const lines = text.slice(from, to).split('\n');
  const all = lines.every(line => line.startsWith(prefix));
  const next = lines.map(line => all ? line.slice(prefix.length) : prefix + line).join('\n');
  return {text: text.slice(0, from) + next + text.slice(to), start: from, end: from + next.length};
}

/** Numbers the selected lines (1. 2. 3.), or removes numbering when every line is already numbered. */
export function numberLines(text: string, start: number, end: number): TextEdit {
  const [from, to] = lineRange(text, start, end);
  const lines = text.slice(from, to).split('\n');
  const numbered = /^\d+\.\s/;
  const all = lines.every(line => numbered.test(line));
  const next = lines.map((line, i) => all ? line.replace(numbered, '') : `${i + 1}. ${line}`).join('\n');
  return {text: text.slice(0, from) + next + text.slice(to), start: from, end: from + next.length};
}

/** Turns the selection into a link whose address is selected so it can be typed over. */
export function linkSelection(text: string, start: number, end: number): TextEdit {
  const label = text.slice(start, end) || 'link text';
  const url = 'https://';
  const result = text.slice(0, start) + `[${label}](${url})` + text.slice(end);
  const urlStart = start + label.length + 3;
  return {text: result, start: urlStart, end: urlStart + url.length};
}

/** A fenced code block on its own lines around the selection. */
export function codeBlock(text: string, start: number, end: number): TextEdit {
  const selected = text.slice(start, end) || 'code';
  const lead = start > 0 && text[start - 1] !== '\n' ? '\n' : '';
  const open = lead + '```\n';
  return {text: text.slice(0, start) + open + selected + '\n```\n' + text.slice(end), start: start + open.length, end: start + open.length + selected.length};
}
