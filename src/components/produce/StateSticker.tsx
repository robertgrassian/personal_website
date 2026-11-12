import { chooseProduceState } from "@/app/produce/actions";
import { caveat } from "@/lib/fonts";
import type { ProduceSketch } from "@/lib/produce/sketch";
import { BORDER_VIEWBOX } from "@/lib/produce/sketchBoxes";
import { STATES } from "@/lib/produce/states";
import type { UsState } from "@/lib/produce/types";
import { RoughFrame } from "./RoughFrame";

// A Server Component: <details> opens without JavaScript, and a <form> whose action is a Server
// Action posts without it too (React progressive enhancement), so this ships no client code.
export function StateSticker({
  state,
  regionName,
  sketch,
}: {
  state: UsState;
  regionName: string | null;
  sketch: ProduceSketch;
}) {
  return (
    <div className="produce-sticker-row">
      <span className={`produce-sticker ${caveat.className}`}>
        <RoughFrame d={sketch.borders[0]} viewBox={BORDER_VIEWBOX} />
        {state.name}
      </span>
      <details className="produce-change">
        <summary>Change state</summary>
        <form action={chooseProduceState} className="produce-change-form">
          <label htmlFor="produce-state" className="sr-only">
            State
          </label>
          <select id="produce-state" name="state" defaultValue={state.code}>
            {STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="submit">Show this state</button>
        </form>
      </details>
      {regionName && <p className="produce-region-line">Season data for {regionName}</p>}
    </div>
  );
}
