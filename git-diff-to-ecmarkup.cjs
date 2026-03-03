#!/usr/bin/env node

/** Usage:
git diff origin/main..HEAD --numstat | sed 's/.*\t//' | while read f; do
  t="$(mktemp -p "$(pwd)" "$f.XXXXXX")"
  git diff origin/main..HEAD -U99999 --minimal --word-diff=plain -- "$f" | sed '1,/^@@/d' | ../proposal-intl-keep-trailing-zeros/git-diff-to-ecmarkup.cjs > "$t"
  # chmod --reference="$f" "$t"
  chmod a+r "$t"
  mv -f "$t" "$f"
done
 */

const { createInterface } = require("node:readline");
const ecmaOpenPunc = '(["*|~`';
const ecmaClosePunc = ')]"*|~`';
const isPuncBalanced = str => {
  const stack = [];
  for (const ch of str) {
    const i = ecmaOpenPunc.indexOf(ch);
    if (ecmaClosePunc.includes(ch)) {
      const x = stack.pop();
      if (x === ch) continue;
      if (i < 0) return false;
      if (x !== undefined) stack.push(x);
    }
    if (i >= 0) stack.push(ecmaClosePunc[i]);
  }
  return stack.length === 0;
};
// https://html.spec.whatwg.org/multipage/syntax.html#void-elements
const voidElementNames = new Set(
  "area, base, br, col, embed, hr, img, input, link, meta, source, track, wbr".split(
    ", ",
  ),
);
const tagsWellFormed = arr => {
  const stack = [];
  for (const tag of arr) {
    if (tag.startsWith("</")) {
      if (stack.pop() !== tag.slice(2)) return false;
    } else {
      stack.push(tag.slice(1));
    }
  }
  return stack.length === 0;
};
const collapseTags = arr => {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i].startsWith("</") && arr[i - 1] === `<${arr[i].slice(2)}`)
      arr.splice(--i, 2);
  }
  return arr;
};
const makeTextPart = text => ({
  kind: "",
  text,
  selfContained: true,
  tags: [],
});
const fixupParts = parts => {
  // Move a whitespace or emu-alg step prefix outside of ins/del text.
  const prefixed =
    parts[0]?.text.match(/^ *$/) && parts[1]?.text.match(/^( *(?:1\. ?)?)(.*)/);
  if (prefixed) {
    parts[0].text += prefixed[1];
    parts[1].text = prefixed[2];
    if (!parts[1].text) parts.splice(1, 1);
  }

  for (let i = parts.length - 1; i >= 1; i--) {
    if (!parts[i].kind) continue;
    let a = parts[i - 1].text;
    let b = parts[i].text;

    // Move a whitespace suffix to after ins/del text.
    const wsSuffix = i + 1 < parts.length && b.match(/\s+$/)?.[0];
    if (wsSuffix) {
      if (!parts[i + 1].kind) {
        parts[i + 1].text = `${wsSuffix}${parts[i + 1].text}`;
      } else {
        parts.splice(i + 1, 0, makeTextPart(wsSuffix));
      }
      b = parts[i].text = b.slice(0, -wsSuffix.length);
    }

    // Extract shared suffix punctuation from adjacent ins/del text.
    if (!parts[i - 1].kind) continue;
    let x = -1;
    while (a.at(x) === b.at(x) && a.at(x).match(/\W/)) x--;
    for (x++; x; x++) {
      if (![a, b].every(s => isPuncBalanced(s.slice(0, x)))) continue;
      const tail = a.slice(x);
      if (i + 1 < parts.length && !parts[i + 1].kind) {
        parts[i + 1].text = `${tail}${parts[i + 1].text}`;
      } else {
        parts.splice(i + 1, 0, makeTextPart(tail));
      }
      a = parts[i - 1].text = a.slice(0, x);
      b = parts[i].text = b.slice(0, x);
      break;
    }

    // Extract a shared word-like prefix from adjacent ins/del text.
    const head = a.match(/^\w+/)?.[0];
    if (head && b.match(/^\w+/)?.[0] === head) {
      if (i - 2 >= 0) {
        parts[i - 2].text += head;
      } else {
        parts.unshift(makeTextPart(head));
        i++;
      }
      for (const j of [i, i - 1]) {
        const newText = parts[j].text.slice(head.length);
        if (newText) {
          parts[j].text = newText;
        } else {
          parts.splice(j, 1);
        }
      }
    }
  }
};

(async () => {
  let delTags = [];
  let delLines = [];
  let insTags = [];
  let insLines = [];
  const kindFrom2Chars = new Map(Object.entries({ "[-": "del", "{+": "ins" }));
  for await (const line of createInterface({ input: process.stdin })) {
    const parts = line
      // Split on `git diff --word-diff=plain` markers.
      .split(/(\[-.*?-\]|\{\+.*?\+\})/g)
      // Remove empty text, except at start of line.
      .filter((x, i) => x || i === 0)
      .map(strPart => {
        const kind = kindFrom2Chars.get(strPart.slice(0, 2)) || "";
        const text = kind ? strPart.slice(2, -2) : strPart;
        const tags =
          strPart
            // https://html.spec.whatwg.org/multipage/parsing.html#tag-open-state
            .match(/<[/]?[a-z][^\t\n\f >]*/g)
            ?.filter(tag => !voidElementNames.has(tag.replace(/^<\/*/, ""))) ||
          [];
        const selfContained = tagsWellFormed(tags);
        return { kind, text, selfContained, tags };
      });
    const delLine = parts
      .map(part => (part.kind === "ins" ? "" : part.text))
      .join("");
    const insLine = parts
      .map(part => (part.kind === "del" ? "" : part.text))
      .join("");
    const byLine = parts.some(part => part.kind && !part.selfContained);
    const isDel = parts.some(part => part.kind === "del");
    const isIns = parts.some(part => part.kind === "ins");
    // Ecmarkup rejects operation parameter name changes, so detect those
    // for line-level ins/del.
    const isOpParam =
      parts.some(part => part.kind) &&
      [delLine, insLine].every(L => /^ *(\w+ )*_\w+_: .*,$/.test(L)) &&
      !parts[0].kind &&
      !parts[0].text.includes(":");

    if (byLine || isOpParam || delLines.length || insLines.length) {
      // When possible, emit a single pair of ins/del lines.
      const unbuffered =
        isOpParam || [delLine, insLine].every(L => !L || /^ *1\. /.test(L));
      if (unbuffered && !delLines.length && !insLines.length) {
        const insDelLines = { del: delLine, ins: insLine };
        for (const [tag, line] of Object.entries(insDelLines)) {
          const taggedLine = line.replace(/\S.*/, s => {
            const i = s.startsWith("1. ") ? 3 : 0;
            return `${s.slice(0, i)}<${tag}>${s.slice(i).replace(/ {2,}/g, " ")}</${tag}>`;
          });
          if (line) console.log(taggedLine);
        }
        continue;
      }

      // Otherwise buffer the lines, but pure deletions ["", del:"..."] skip the
      // insert buffer and pure inserts ["", ins:"..."] skip the delete buffer.
      if (delLine || parts.length < 2) delLines.push(delLine);
      if (insLine || parts.length < 2) insLines.push(insLine);

      // Flush the buffer once the tag structure is well-formed.
      delTags = collapseTags([
        ...delTags,
        ...parts.flatMap(p => (p.kind === "del" && p.tags) || []),
      ]);
      insTags = collapseTags([
        ...insTags,
        ...parts.flatMap(p => (p.kind === "ins" && p.tags) || []),
      ]);
      if (!delTags.length && !insTags.length) {
        // Longest indentation wins.
        const indentation = [delLines, insLines]
          .map(lines => lines[0]?.match(/^\s*/)?.[0] || "")
          .sort((a, b) => b.length - a.length)[0];
        for (const L of [
          `${indentation}<del class="block">`,
          ...delLines,
          `${indentation}</del>`,
          `${indentation}<ins class="block">`,
          ...insLines,
          `${indentation}</ins>`,
        ]) {
          console.log(L);
        }
        delLines = [];
        insLines = [];
      }
      continue;
    }

    // Any ins/del content is confined to this single line.
    fixupParts(parts);
    console.log(
      parts
        .map(({ kind, text }) => (!kind ? text : `<${kind}>${text}</${kind}>`))
        .join(""),
    );
  }
})();
