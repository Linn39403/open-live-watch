import { initialSim, step, type Sim } from "./model";
let state: Sim = initialSim();
self.onmessage = (event: MessageEvent<Sim>) => {
  state = event.data;
};
setInterval(() => {
  if (!state.running) return;
  state = step(state);
  self.postMessage(state);
}, 50);
