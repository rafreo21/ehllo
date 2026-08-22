"use client";

import { useState, type ImgHTMLAttributes, type ReactNode } from "react";

type CardImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
  fallback?: ReactNode;
};

/**
 * Shared card image boundary. A failed stored image is removed from layout so
 * the initials/brand fallback underneath remains visible. Changing `src`
 * automatically retries without an effect or an extra render loop.
 */
export function CardImage({ src, fallback = null, alt = "", onError, ...props }: CardImageProps) {
  const [failedSrc, setFailedSrc] = useState("");

  if (!src || failedSrc === src) return fallback;

  return (
    <img
      {...props}
      src={src}
      alt={alt}
      onError={(event) => {
        onError?.(event);
        setFailedSrc(src);
      }}
    />
  );
}
