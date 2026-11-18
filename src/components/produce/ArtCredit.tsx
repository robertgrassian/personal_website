import { Fragment } from "react";
import { ART_SOURCES } from "@/lib/produce/art";
import { PUBLIC_DOMAIN } from "@/lib/produce/validate";

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
          {/* CC BY asks for the licence, a link to it, and a note that the work was changed (every
              picture is cropped, some tinted). The validator guarantees licenseUrl here. */}
          {source.license !== PUBLIC_DOMAIN && (
            <>
              {" ("}
              <a href={source.licenseUrl} target="_blank" rel="noopener noreferrer license">
                {source.license}
              </a>
              {", adapted)"}
            </>
          )}
        </Fragment>
      ))}
      .
    </p>
  );
}
