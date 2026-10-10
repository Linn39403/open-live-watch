import type { Workspace, Sim } from "./model";
import { Instrument } from "./Instruments";
import { Graph } from "./Graph";
import { readBinding } from "./provider";
/** Docked secondary screen keeps its requested identity while the main canvas switches. */
export function ScreenView({
  workspace,
  sim,
  screenId,
  onCommand,
}: {
  workspace: Workspace;
  sim: Sim;
  screenId: string;
  onCommand: (command: any) => void;
}) {
  const screen = workspace.screens.find((s) => s.id === screenId);
  if (!screen) return <p>This screen was removed.</p>;
  return (
    <div className="secondary-screen">
      <strong>{screen.name} • independent view</strong>
      <p>
        Select an instrument to edit it in Properties; layout gestures are
        available in its native floating view or the main canvas.
      </p>
      <div className="secondary-screen-viewport">
        <div
          className="canvas"
          style={{
            width: screen.canvas.width,
            height: screen.canvas.height,
            position: "relative",
            backgroundSize: `${screen.canvas.grid}px ${screen.canvas.grid}px`,
          }}
        >
          {screen.widgets.map((w) => (
            <div
              className="widget"
              key={w.id}
              style={{
                left: w.rect.x,
                top: w.rect.y,
                width: w.rect.width,
                height: w.rect.height,
                transform: `rotate(${w.rect.rotation}deg)`,
              }}
              onClick={() =>
                onCommand({
                  type: "select",
                  id: w.id,
                  screenId,
                  epoch: sim.epoch,
                })
              }
            >
              {w.kind === "graph" ? (
                <Graph w={w} sim={sim} workspace={workspace} />
              ) : (
                <Instrument
                  w={w}
                  value={readBinding(workspace, sim, w)}
                  running={sim.running}
                  sessionEpoch={sim.epoch}
                  onWrite={(value, safetyRelease, finalRelease) =>
                    onCommand({
                      type: "write",
                      id: w.id,
                      screenId,
                      epoch: sim.epoch,
                      value,
                      safetyRelease,
                      finalRelease,
                    })
                  }
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
