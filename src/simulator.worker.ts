import { OfflineEngine } from "./engine";
const engine = new OfflineEngine();
self.onmessage = (event: MessageEvent<unknown>) => {
  // An invalid protocol boundary raises a worker error; the main window displays it.
  for (const response of engine.receive(event.data)) self.postMessage(response);
};
setInterval(() => {
  const batch = engine.tick();
  if (batch) self.postMessage(batch);
}, 50);
