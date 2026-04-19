/**
 * Background Timer Worker
 *
 * Browsers throttle setInterval in background tabs to 1 message/sec or less.
 * Web Workers are not subject to this same UI-thread throttling,
 * providing the 12 FPS heartbeat needed for consistent metrics.
 */

let timerId = null;

self.onmessage = (e) => {
  const { action, interval } = e.data;

  if (action === "start") {
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
      self.postMessage("tick");
    }, interval || 83); // default ~12 FPS
  } else if (action === "stop") {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }
};
