"use client";

import { systemLabel } from "@/lib/games";
import { ModalShell } from "./ModalShell";
import { GameEditFields, type EditSubject } from "./GameEditFields";

export type { EditSubject };

type EditGameModalProps = {
  subject: EditSubject;
  existingSystems: string[];
  startWithSession?: boolean;
  onClose: () => void;
};

// Owner-only edit dialog: the conventional panel around GameEditFields, which
// owns every field, the Save and its own error line.
//
// This component is mounted only while open, so the scroll-lock/Escape effect
// runs on mount and cleans up on unmount — no isOpen plumbing needed.
export function EditGameModal({
  subject,
  existingSystems,
  startWithSession = false,
  onClose,
}: EditGameModalProps) {
  const promoting = subject.kind === "promote";
  const source = promoting ? subject.item : subject.game;

  return (
    <ModalShell
      label={promoting ? `Move ${source.name} to your library` : `Edit ${source.name}`}
      title={source.name}
      subtitle={
        promoting ? "Moving from your wishlist to your library" : systemLabel(subject.game.system)
      }
      onClose={onClose}
      error={null}
    >
      <GameEditFields
        subject={subject}
        existingSystems={existingSystems}
        startWithSession={startWithSession}
        onClose={onClose}
      />
    </ModalShell>
  );
}
