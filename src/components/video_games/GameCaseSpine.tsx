// Spine edge of the game case — a thin strip connecting front and back faces,
// visible mid-rotation during the 3D flip. Colored per-console via --system-fallback.
// Positioning and transforms are handled by CSS classes (game-case-spine-left/right)
// which reference the --case-depth custom property defined on .game-case-scene.

import { SpineText } from "./SpineText";

type GameCaseSpineProps = {
  name: string;
  system: string | undefined;
  side: "left" | "right";
  darkBackground?: boolean;
};

export function GameCaseSpine({ name, system, side, darkBackground = true }: GameCaseSpineProps) {
  return (
    <div className={`game-case-spine game-case-spine-${side}`} data-system={system}>
      <SpineText name={name} darkBackground={darkBackground} />
    </div>
  );
}
