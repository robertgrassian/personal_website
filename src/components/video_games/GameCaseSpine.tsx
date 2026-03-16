// Spine edge of the game case — a thin strip connecting front and back faces,
// visible mid-rotation during the 3D flip. Colored per-console via --system-fallback.

import { SpineText } from "./SpineText";

type GameCaseSpineProps = {
  name: string;
  system: string;
  side: "left" | "right";
};

// Transform values position the spine flush with the card edge and rotate it
// perpendicular so its width fills the Z gap between front and back faces.
const SPINE_TRANSFORMS = {
  left: "translateX(-6px) rotateY(-90deg)",
  right: "translateX(6px) rotateY(90deg)",
} as const;

export function GameCaseSpine({ name, system, side }: GameCaseSpineProps) {
  return (
    <div
      className="game-case-spine"
      data-system={system}
      style={{
        [side]: 0,
        transform: SPINE_TRANSFORMS[side],
      }}
    >
      <SpineText name={name} />
    </div>
  );
}
