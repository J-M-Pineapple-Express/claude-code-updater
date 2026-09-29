// Tiny Markdown renderer for release notes and summaries. Escapes everything first,
// then adds back only headings, bullets, bold, inline code and https links.
'use strict';

(function () {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="#" data-href="$2">$1</a>');
  }

  function render(md) {
    const out = [];
    const stack = []; // open <ul> indent levels
    const closeTo = (depth) => { while (stack.length > depth) { out.push('</ul>'); stack.pop(); } };
    let para = [];
    const flush = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };

    for (const raw of String(md || '').replace(/\r/g, '').split('\n')) {
      const line = raw.replace(/\s+$/, '');
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      const li = line.match(/^(\s*)[-*]\s+(.*)$/);
      if (!line.trim()) { flush(); continue; }
      if (h) {
        flush(); closeTo(0);
        const level = Math.min(h[1].length + 1, 4);
        out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      } else if (li) {
        flush();
        const depth = Math.floor(li[1].replace(/\t/g, '  ').length / 2) + 1;
        if (depth > stack.length) { while (stack.length < depth) { out.push('<ul>'); stack.push(1); } } else closeTo(depth);
        out.push('<li>' + inline(li[2]) + '</li>');
      } else {
        closeTo(0);
        para.push(line.trim());
      }
    }
    flush(); closeTo(0);
    return out.join('\n');
  }

  window.renderMarkdown = render;
})();
