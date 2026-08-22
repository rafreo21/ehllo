"use client";

import { memo, useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

type InlineEditFieldProps = {
  defaultValue: string;
  onConfirm: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  multiline?: boolean;
  maxLength?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  suffix?: ReactNode;
};

// Native contentEditable, not a custom input-swapping state machine. The
// earlier version toggled between a read view and a mounted <input>, which
// meant an unmount/remount (and a focus effect) on every edit - that whole
// class of timing issue goes away when there is only ever one persistent
// DOM node.
//
// Wrapped in memo(..., () => true) below - "props are always equal, never
// re-render" - and that part is load-bearing, not an optimization. This
// component's own text content lives in committedValue, which is seeded
// once from defaultValue and never updated by a setter; the DOM node's
// actual displayed text instead drifts via the browser's own typing, which
// React never observes. If this component re-rendered for any reason
// (e.g. the page-level draft state changing because a *different* field
// was just confirmed), React would reconcile children back to that stale
// committedValue - fighting the browser for ownership of a node's text
// while focus is actively moving between fields on blur. That fight is
// what was hanging the tab on every "click out or click to the next one."
// memo makes the parent's re-renders never reach this component at all,
// so nothing ever touches this node's DOM after the first paint except
// its own ref-driven handlers below.
function InlineEditFieldImpl({
  defaultValue,
  onConfirm,
  placeholder,
  ariaLabel,
  multiline = false,
  maxLength,
  as = "span",
  className = "",
  style,
  suffix,
}: InlineEditFieldProps) {
  const [committedValue] = useState(defaultValue);
  const ref = useRef<HTMLElement | null>(null);
  const beforeEditRef = useRef(defaultValue);
  const pendingCommitFrameRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (pendingCommitFrameRef.current !== null) {
      cancelAnimationFrame(pendingCommitFrameRef.current);
    }
  }, []);

  function handleFocus() {
    // innerText (not textContent) reflects visible line breaks - the
    // browser renders each Enter as a separate <div>, which textContent
    // would silently concatenate with no newline between them at all.
    beforeEditRef.current = ref.current?.innerText ?? "";
  }

  function syncEmptyState() {
    const node = ref.current;
    if (!node) return;
    // Browsers often leave a <br> or an empty <div> behind after all text is
    // deleted, so the CSS :empty selector alone cannot reliably restore the
    // prompt. Track visible text instead without rewriting the editing host.
    node.dataset.empty = String(!(node.innerText ?? "").trim());
  }

  function commit() {
    const node = ref.current;
    if (!node) return;
    let next = node.innerText ?? "";
    next = multiline ? next.trim() : next.replace(/\s+/g, " ").trim();
    if (maxLength && next.length > maxLength) next = next.slice(0, maxLength);
    syncEmptyState();
    if (next === beforeEditRef.current) return;

    // Let the browser finish its blur -> focus transition before React updates
    // the card editor. In particular, do not write normalized text back into
    // this contentEditable node from inside its blur event: doing so changes
    // the active editing host while the browser is still moving the selection.
    if (pendingCommitFrameRef.current !== null) {
      cancelAnimationFrame(pendingCommitFrameRef.current);
    }
    beforeEditRef.current = next;
    pendingCommitFrameRef.current = requestAnimationFrame(() => {
      pendingCommitFrameRef.current = null;
      onConfirm(next);
    });
  }

  function revert() {
    const node = ref.current;
    if (!node) return;
    node.textContent = beforeEditRef.current;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      revert();
      ref.current?.blur();
    } else if (event.key === "Enter" && !multiline) {
      event.preventDefault();
      ref.current?.blur();
    }
  }

  const Tag = as;

  return (
    <>
      <Tag
        ref={ref}
        className={`inline-edit-field ${multiline ? "is-multiline" : ""} ${className}`}
        style={style}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline={multiline}
        data-placeholder={placeholder}
        data-empty={committedValue.trim() ? "false" : "true"}
        onFocus={handleFocus}
        onInput={syncEmptyState}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      >
        {committedValue}
      </Tag>
      {suffix}
    </>
  );
}

// suffix is the one prop this freezes that could otherwise change live -
// e.g. the role field's " · Company" suffix, if company is edited
// elsewhere while role stays mounted. It'll go stale until this field's
// own key changes (switching cards) or the page reloads. Deliberate
// trade-off: a static suffix beats a hung tab.
export const InlineEditField = memo(InlineEditFieldImpl, () => true);
