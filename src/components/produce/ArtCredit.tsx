import { Fragment } from "react";
import { ART_SOURCES } from "@/lib/produce/art";

// One line crediting every registered art source, whether or not an item on screen uses it, so a
// new source credits itself the moment it is registered.
export function ArtCredit() {
  if (ART_SOURCES.length === 0) return null;
  return (
    <p className="produce-credit">
      Illustrations:{" "}
      {ART_SOURCES.map((source, i) => (
        <Fragment key={source.id}>
          {i > 0 && ", "}
          <a href={source.credit.url} target="_blank" rel="noopener noreferrer">
            {source.credit.name}
          </a>
        </Fragment>
      ))}
      .
    </p>
  );
}
