"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { Button } from "./Button";

export type DropdownItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  href?: string;
  external?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
};

type DropdownButtonProps = {
  label: ReactNode;
  icon?: ReactNode;
  items: DropdownItem[];
  size?: "small" | "normal";
  fullWidth?: boolean;
  loading?: boolean;
};

// Portaled to <body> rather than absolutely positioned inside its own
// wrapper — a few places this renders (e.g. the follow-ups table) have an
// `overflow-x: auto` ancestor, which would otherwise clip the menu.
export function DropdownButton({ label, icon, items, size = "small", fullWidth = false, loading = false }: DropdownButtonProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        wrapperRef.current?.querySelector("button")?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function selectItem(item: DropdownItem) {
    if (item.disabled) return;
    setOpen(false);
    item.onSelect?.();
    if (item.href) {
      if (item.external) window.open(item.href, "_blank", "noreferrer");
      else window.location.assign(item.href);
    }
  }

  return (
    <span ref={wrapperRef} className={fullWidth ? "block" : "inline-block"} style={{ position: "relative" }}>
      <Button
        type="button"
        size={size}
        fullWidth={fullWidth}
        loading={loading}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
        {label}
        <CaretDownIcon size={14} weight="bold" />
      </Button>
      {open && position ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: "absolute", top: position.top, left: position.left, minWidth: position.width, zIndex: 1000 }}
          className="grid gap-1 rounded-md border border-[#e5e9e2] bg-white p-1.5 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => selectItem(item)}
              className="flex items-center gap-2 whitespace-nowrap rounded px-3 py-2 text-left text-sm font-semibold text-[#163300] hover:bg-[#f2f5f0] disabled:cursor-not-allowed disabled:text-[#a4aba0] disabled:hover:bg-transparent"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </span>
  );
}
