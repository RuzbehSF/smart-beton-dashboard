import React from 'react';
import {invoke} from './native';

// Markdown is rendered to React elements, never to an HTML string, so note content cannot inject markup or scripts.
// Links are limited to http(s) and are opened through the backend in the default browser, not inside this window.
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g;

function inline(text:string, key:string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0, n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0, token = m[0], k = `${key}-${n++}`;
    if (at > last) out.push(text.slice(last, at));
    if (m[1]) out.push(<code key={k}>{token.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{token.slice(2, -2)}</strong>);
    else if (m[3]) out.push(<em key={k}>{token.slice(1, -1)}</em>);
    else {
      const close = token.indexOf(']('), label = token.slice(1, close), href = token.slice(close + 2, -1);
      out.push(<a key={k} href={href} title={href} onClick={e => {e.preventDefault(); invoke('open_external_url', {url: href}).catch(() => {});}}>{label}</a>);
    }
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const BLOCK_START = /^(```|#{1,6}\s|>\s?|\s*[-*]\s+|\s*\d+\.\s+)/;

export function Markdown({source}:{source:string}) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim(), code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      nodes.push(<pre key={k++} data-lang={lang || undefined}><code>{code.join('\n')}</code></pre>);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const Tag = `h${heading[1].length}` as 'h1';
      nodes.push(<Tag key={k++}>{inline(heading[2], `h${k}`)}</Tag>);
      i++; continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { nodes.push(<hr key={k++}/>); i++; continue; }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, '')); i++; }
      nodes.push(<blockquote key={k++}>{inline(quote.join(' '), `q${k}`)}</blockquote>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const entries: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { entries.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      const listKey = k++;
      nodes.push(<ul key={listKey}>{entries.map((entry, j) => {
        const check = /^\[( |x|X)\]\s*(.*)$/.exec(entry);
        return check
          ? <li key={j} className="task-item"><input type="checkbox" checked={check[1] !== ' '} disabled readOnly aria-label={check[2] || 'Checklist item'}/> {inline(check[2], `l${listKey}-${j}`)}</li>
          : <li key={j}>{inline(entry, `l${listKey}-${j}`)}</li>;
      })}</ul>);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const entries: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { entries.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; }
      const listKey = k++;
      nodes.push(<ol key={listKey}>{entries.map((entry, j) => <li key={j}>{inline(entry, `o${listKey}-${j}`)}</li>)}</ol>);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i]) && !/^\s*([-*_])\1{2,}\s*$/.test(lines[i])) { paragraph.push(lines[i]); i++; }
    if (!paragraph.length) { paragraph.push(lines[i]); i++; } // always make progress
    nodes.push(<p key={k++}>{inline(paragraph.join('\n'), `p${k}`)}</p>);
  }
  return <div className="markdown">{nodes}</div>;
}
