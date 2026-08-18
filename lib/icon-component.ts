import type { ComponentType } from "react";

/**
 * An icon component, whichever library it came from.
 *
 * The app renders icons from two sets - react-feather and Phosphor - whose prop
 * types do not overlap: Phosphor takes a constrained `weight`, react-feather
 * takes SVG attributes and no weight at all. Every slot holding a mix of them
 * was typed `ComponentType<any>`, which silenced the mismatch by giving up on
 * checking these components' props entirely.
 *
 * Naming the props the app actually passes keeps both libraries assignable -
 * every field is optional on both sides - while still catching a typo or a prop
 * the underlying icon cannot accept.
 */
export type IconComponent = ComponentType<{
  size?: number | string;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  color?: string;
  className?: string;
  strokeWidth?: number | string;
}>;
