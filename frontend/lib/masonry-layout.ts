/**
 * Small Pinterest-style layout with one deliberate rule: the final incomplete
 * row is placed from the left edge. CSS columns balance the last card into the
 * rightmost column, which leaves the 1-0-0 / 1-1-0 shape broken.
 *
 * Cards are absolutely positioned into the shortest column; the tail
 * (items % columns) is moved to a fresh left-aligned row.
 */

const GAP = 12;
const MIN = 300;

type State = { height: string };

const known = new Set<HTMLElement>();
let frame = 0;

function elements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && !child.hasAttribute("data-masonry-skip"),
  );
}

function reset(container: HTMLElement): void {
  for (const child of elements(container)) {
    child.style.position = "";
    child.style.width = "";
    child.style.left = "";
    child.style.top = "";
  }
  container.style.position = "";
  container.style.display = "";
  container.style.height = "";
}

function layout(container: HTMLElement): void {
  if (!container.hasAttribute("data-masonry")) {
    reset(container);
    return;
  }
  const children = elements(container);
  if (children.length === 0) {
    container.style.height = "";
    return;
  }

  const width = container.clientWidth;
  if (width <= 0) return;
  const min = Number(container.dataset.masonryMin) || MIN;
  const gap = GAP;
  const columns = Math.max(1, Math.floor((width + gap) / (min + gap)));
  const columnWidth = (width - gap * (columns - 1)) / columns;

  container.style.position = "relative";
  container.style.display = "block";
  for (const child of children) {
    child.style.position = "absolute";
    child.style.width = `${columnWidth}px`;
    child.style.left = "0";
    child.style.top = "0";
  }

  const heights = Array<number>(columns).fill(0);
  const place = (child: HTMLElement, column: number, top: number) => {
    child.style.left = `${column * (columnWidth + gap)}px`;
    child.style.top = `${top}px`;
    heights[column] = top + child.offsetHeight;
  };

  const total = children.length;
  const tail = total % columns || columns;
  const regular = tail === columns ? total : total - tail;

  for (let index = 0; index < regular; index += 1) {
    // Leftmost minimum keeps ties stable and avoids rightward drift.
    let column = 0;
    for (let candidate = 1; candidate < columns; candidate += 1) {
      if (heights[candidate] < heights[column]) column = candidate;
    }
    place(children[index], column, heights[column]);
  }

  if (tail !== columns) {
    // Start the tail under its own left columns, not under the tallest card
    // in the whole grid. The latter created a huge empty band whenever the
    // right column was taller than the left ones.
    const top = Math.max(...heights.slice(0, tail));
    for (let index = 0; index < tail; index += 1) {
      place(children[regular + index], index, top);
    }
  }

  container.style.height = `${Math.max(...heights)}px`;
}

function schedule(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const current = new Set(document.querySelectorAll<HTMLElement>("[data-masonry]"));
    for (const element of current) layout(element);
    for (const element of known) {
      if (!current.has(element) || !element.isConnected) reset(element);
    }
    known.clear();
    for (const element of current) known.add(element);
  });
}

export function installMasonryLayout(): () => void {
  if (typeof window === "undefined") return () => {};
  const resize = new ResizeObserver(schedule);
  const observe = () => {
    for (const container of document.querySelectorAll<HTMLElement>("[data-masonry]")) {
      resize.observe(container);
      for (const child of elements(container)) resize.observe(child);
    }
  };
  const mutation = new MutationObserver(() => {
    observe();
    schedule();
  });
  mutation.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-masonry"],
  });
  observe();
  schedule();
  return () => {
    mutation.disconnect();
    resize.disconnect();
    known.clear();
  };
}
