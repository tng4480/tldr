function unwrapExistingMarks(container: HTMLElement) {
  container.querySelectorAll("[data-docx-highlight='true']").forEach((node) => {
    const parent = node.parentNode;
    if (!parent) {
      return;
    }
    while (node.firstChild) {
      parent.insertBefore(node.firstChild, node);
    }
    parent.removeChild(node);
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyDocxHighlights(
  container: HTMLElement,
  terms: string[],
  style: "highlight" | "bold" = "highlight",
): number {
  unwrapExistingMarks(container);
  const uniqueTerms = Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean)));
  if (!uniqueTerms.length) {
    return 0;
  }

  const regex = new RegExp(`\\b(${uniqueTerms.map(escapeRegExp).join("|")})\\b`, "gi");
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    textNodes.push(node as Text);
    node = walker.nextNode();
  }

  let applied = 0;
  textNodes.forEach((textNode) => {
    const value = textNode.nodeValue ?? "";
    if (!value.trim()) {
      return;
    }
    regex.lastIndex = 0;
    let match = regex.exec(value);
    if (!match) {
      return;
    }

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    while (match) {
      const matchStart = match.index;
      const matchValue = match[0] ?? "";
      const matchEnd = matchStart + matchValue.length;
      if (matchStart > cursor) {
        fragment.appendChild(document.createTextNode(value.slice(cursor, matchStart)));
      }
      if (style === "bold") {
        const strong = document.createElement("strong");
        strong.setAttribute("data-docx-highlight", "true");
        strong.className = "font-semibold text-inherit";
        strong.textContent = matchValue;
        fragment.appendChild(strong);
      } else {
        const mark = document.createElement("mark");
        mark.setAttribute("data-docx-highlight", "true");
        mark.className = "rounded-[2px] bg-amber-300/40 px-[1px] text-inherit";
        mark.textContent = matchValue;
        fragment.appendChild(mark);
      }
      cursor = matchEnd;
      applied += 1;
      match = regex.exec(value);
    }
    if (cursor < value.length) {
      fragment.appendChild(document.createTextNode(value.slice(cursor)));
    }

    const parent = textNode.parentNode;
    if (!parent) {
      return;
    }
    parent.replaceChild(fragment, textNode);
  });

  return applied;
}
