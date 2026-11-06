// Listen in both documents: pointer and keyboard events do not cross an iframe.
export function observeControlVisibility({ controls, frame, hostWindow, menuShortcut, onVisible }) {
  let timer;
  let nearTop = false;
  let menuPinned = false;
  let frameDocument;
  const hostDocument = controls.ownerDocument;
  const listeners = [];
  const listenerOptions = { capture: true };
  const listen = (target, type, callback) => {
    target.addEventListener(type, callback, listenerOptions);
    listeners.push(() => target.removeEventListener(type, callback, listenerOptions));
  };
  const cancelHide = () => {
    hostWindow.clearTimeout(timer);
    timer = undefined;
  };
  const focused = () => controls.contains(hostDocument.activeElement);
  const scheduleHide = (delay = 1000) => {
    if (timer !== undefined || nearTop || menuPinned || focused()) return;
    timer = hostWindow.setTimeout(() => {
      timer = undefined;
      if (!nearTop && !menuPinned && !focused()) onVisible(false);
    }, delay);
  };
  const reveal = () => {
    cancelHide();
    onVisible(true);
  };
  const pointerLocked = () => frameDocument?.pointerLockElement || hostDocument.pointerLockElement;
  const move = (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    // Locked pointer coordinates stay fixed and cannot reveal the toolbar.
    if (pointerLocked()) return;
    const inFrame = event.view === frame?.contentWindow;
    const offset = inFrame ? frame.getBoundingClientRect().top : 0;
    const canvas = frameDocument?.getElementById("canvas");
    const bounds = canvas?.getBoundingClientRect();
    // The iframe fills the viewport; its letterbox margins are outside gameplay.
    const outsideGame = !inFrame || (bounds && (
      event.clientX < bounds.left || event.clientX >= bounds.right ||
      event.clientY < bounds.top || event.clientY >= bounds.bottom
    ));
    nearTop = controls.contains(event.target) || outsideGame || event.clientY + offset <= 80;
    if (nearTop) reveal();
    else scheduleHide();
  };
  const leave = (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    if (pointerLocked()) return;
    if (event.target !== hostDocument.documentElement && event.target !== frameDocument?.documentElement &&
      event.target !== frameDocument?.getElementById("canvas")) return;
    nearTop = true;
    reveal();
  };
  const keydown = (event) => {
    if (event.key === "Escape") {
      menuPinned = false;
      nearTop = false;
      reveal();
      scheduleHide(3000);
      const lockedDocument = frameDocument?.pointerLockElement ? frameDocument : hostDocument;
      if (lockedDocument.pointerLockElement) lockedDocument.exitPointerLock?.();
    } else if (event.key === "Tab") {
      reveal();
      scheduleHide(3000);
    } else if (menuShortcut && event.key === menuShortcut.key &&
      ["ctrlKey", "altKey", "metaKey", "shiftKey"].every((key) => Boolean(event[key]) === Boolean(menuShortcut[key]))) {
      holdForMenu();
    }
  };
  const pointerLockChanged = () => {
    nearTop = false;
    if (frameDocument?.pointerLockElement || hostDocument.pointerLockElement) {
      menuPinned = false;
      // Capture takes priority over :focus-within keeping the toolbar visible.
      if (focused()) hostDocument.activeElement.blur();
      cancelHide();
      onVisible(false);
    } else {
      reveal();
      scheduleHide(3000);
    }
  };
  const holdForMenu = () => {
    menuPinned = true;
    reveal();
  };
  let removeFrameListeners = () => {};
  const attachFrame = () => {
    removeFrameListeners();
    frameDocument = frame?.contentDocument;
    if (!frameDocument) return;
    const document = frameDocument;
    const events = [["pointermove", move], ["pointerleave", leave], ["keydown", keydown], ["pointerlockchange", pointerLockChanged]];
    for (const [type, callback] of events) document.addEventListener(type, callback, listenerOptions);
    removeFrameListeners = () => {
      for (const [type, callback] of events) document.removeEventListener(type, callback, listenerOptions);
    };
    pointerLockChanged();
  };
  listen(hostDocument, "pointermove", move);
  listen(hostDocument, "keydown", keydown);
  listen(hostDocument, "pointerlockchange", pointerLockChanged);
  listen(hostDocument.documentElement, "pointerleave", leave);
  listen(controls, "focusin", reveal);
  listen(controls, "focusout", () => {
    // focusout runs before activeElement moves to its next target.
    cancelHide();
    timer = hostWindow.setTimeout(() => { timer = undefined; scheduleHide(); }, 0);
  });
  if (frame) listen(frame, "load", attachFrame);
  if (frame?.contentDocument) attachFrame();
  else pointerLockChanged();
  return {
    holdForMenu,
    dispose() {
      cancelHide();
      removeFrameListeners();
      for (const remove of listeners) remove();
    },
  };
}
