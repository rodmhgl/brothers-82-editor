// The small slice of Markdown the help files use (SPEC.md §5.10): ## and ### headings, paragraphs,
// "-" and "1." lists, **bold**, `code`, and {{action}} placeholders on their own line for in-app buttons.

export type Inline = { type: 'text' | 'strong' | 'code'; text: string };

export type HelpBlock =
  | { type: 'heading'; level: 2 | 3; text: Inline[] }
  | { type: 'paragraph'; text: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'action'; id: string };

const HEADING = /^(#{2,3})\s+(.*)$/;
const ORDERED_ITEM = /^\d+\.\s+(.*)$/;
const UNORDERED_ITEM = /^-\s+(.*)$/;
const ACTION = /^\{\{([\w-]+)\}\}$/;
const INLINE = /\*\*(.+?)\*\*|`(.+?)`/g;

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    out.push(m[1] !== undefined ? { type: 'strong', text: m[1] } : { type: 'code', text: m[2]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

export function parseHelp(markdown: string): HelpBlock[] {
  const blocks: HelpBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: parseInline(paragraph.join(' ')) });
    if (list) blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) });
    paragraph = [];
    list = null;
  };

  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    const heading = HEADING.exec(line);
    const action = ACTION.exec(line);
    const ordered = ORDERED_ITEM.exec(line);
    const unordered = UNORDERED_ITEM.exec(line);
    const item = ordered ?? unordered;

    if (!line) {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1]!.length as 2 | 3, text: parseInline(heading[2]!) });
    } else if (action) {
      flush();
      blocks.push({ type: 'action', id: action[1]! });
    } else if (item) {
      if (paragraph.length || (list && list.ordered !== !!ordered)) flush();
      list ??= { ordered: !!ordered, items: [] };
      list.items.push(item[1]!);
    } else if (list) {
      // A continuation line belongs to the list item above it.
      list.items[list.items.length - 1] += ` ${line}`;
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}
