/** Inertial wheel scrolling for WebKitGTK, where native wheel steps look choppy. */
export function installDesktopSmoothScroll() {
  if (!(window as unknown as { __TAURI__?: unknown }).__TAURI__) return;

  let target = window.scrollY;
  let current = target;
  let frame = 0;

  const max = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  function tick() {
    current += (target - current) * 0.28;
    if (Math.abs(target - current) < 0.5) {
      current = target;
      window.scrollTo(0, current);
      frame = 0;
      return;
    }
    window.scrollTo(0, current);
    frame = window.requestAnimationFrame(tick);
  }

  function scrollableParent(node: EventTarget | null): Element | null {
    let element = node instanceof Element ? node : null;
    while (element && element !== document.body) {
      const style = getComputedStyle(element);
      if ((style.overflowY === "auto" || style.overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1) {
        return element;
      }
      element = element.parentElement;
    }
    return null;
  }

  window.addEventListener("wheel", (event) => {
    if (event.ctrlKey || event.metaKey || Math.abs(event.deltaY) < 0.5) return;
    if (scrollableParent(event.target)) return;
    if (max() <= 0) return;
    event.preventDefault();
    const delta = Math.sign(event.deltaY) * Math.min(140, Math.abs(event.deltaY));
    target = Math.max(0, Math.min(max(), target + delta));
    if (!frame) frame = window.requestAnimationFrame(tick);
  }, { passive: false });

  window.addEventListener("resize", () => { target = Math.min(target, max()); });
  // Anchor links and back-to-top keep the native smooth behaviour.
  document.documentElement.style.scrollBehavior = "auto";
}
