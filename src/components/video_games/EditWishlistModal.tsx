"use client";

import type { WishlistGame } from "@/lib/wishlist";
import { ModalShell } from "./ModalShell";
import { WishlistEditFields } from "./WishlistEditFields";
import { systemLabel } from "@/lib/games";

type EditWishlistModalProps = {
  item: WishlistGame;
  existingSystems: string[];
  onPlayed: () => void;
  onClose: () => void;
};

// Owner-only wishlist edit dialog (the wishlist-view counterpart of
// EditGameModal): the conventional panel around WishlistEditFields. Same
// mount-only lifecycle: scroll lock and Escape bind on mount, focus returns to
// the opener on unmount.
export function EditWishlistModal({
  item,
  existingSystems,
  onPlayed,
  onClose,
}: EditWishlistModalProps) {
  return (
    <ModalShell
      label={`Edit wishlist entry ${item.name}`}
      title={item.name}
      subtitle={
        <>
          {item.system ? systemLabel(item.system) : "System undecided"}
          {item.dateAdded && ` · wishlisted ${item.dateAdded}`}
        </>
      }
      onClose={onClose}
      error={null}
    >
      <WishlistEditFields
        item={item}
        existingSystems={existingSystems}
        onPlayed={onPlayed}
        onClose={onClose}
      />
    </ModalShell>
  );
}
