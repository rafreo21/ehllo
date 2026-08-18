/**
 * The minimum of a DOM element these capture helpers actually touch.
 *
 * Recursive on purpose: the code queries inside the elements it finds, so an
 * element has to be able to describe its own children. The previous shape
 * declared only `textContent`, which meant every nested querySelector was a type
 * error - and they went unnoticed because this project was not typechecking these
 * files against a config that could see them.
 *
 * Deliberately structural rather than the real DOM lib types: these run against
 * both a live document and scraped fragments, and only need the handful of
 * members below.
 */
export type CapturedNode = {
  textContent: string | null;
  getAttribute?: (name: string) => string | null;
  querySelector?: (selector: string) => CapturedNode | null;
  querySelectorAll?: (selector: string) => ArrayLike<CapturedNode>;
};

/** ArrayLike is not iterable, so spreading it fails; this is the honest read. */
export function capturedNodes(
  value: ArrayLike<CapturedNode> | null | undefined,
): CapturedNode[] {
  return value ? Array.from(value) : [];
}
