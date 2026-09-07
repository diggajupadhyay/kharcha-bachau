import { useEffect, useRef, RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab focus within `ref` while `active`, focuses the first
 * focusable element on open, and restores focus to the previously
 * focused element (the trigger) on close. Improves keyboard /
 * screen-reader usability and keeps Tab from escaping the modal.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement>,
  active: boolean,
  onEscape?: () => void
) {
  // Kept in a ref so changing the handler does not tear down and rebuild the trap,
  // which would steal focus back to the first element mid-interaction.
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!active || !ref.current) return;
    const container = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getItems = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    // Move focus into the dialog without scrolling: the app shell is a
    // smooth-scrolling container, so a focus-induced scroll would glide
    // visibly for ~a second on every modal open.
    const initial = getItems()[0];
    initial?.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      // Escape closes the dialog. Nothing in the app handled it before, so a keyboard
      // user could enter any modal and had no way to dismiss it without a mouse.
      if (e.key === 'Escape' && escapeRef.current) {
        e.preventDefault();
        e.stopPropagation();
        escapeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = getItems();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;

      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (activeEl === last || !container.contains(activeEl)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      // Only restore focus to an element that is still in the document. After a route
      // change the trigger has been unmounted, and focusing a detached node silently
      // moves focus to <body> — losing the caret position for keyboard users.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus?.();
      }
    };
  }, [ref, active]);
}
