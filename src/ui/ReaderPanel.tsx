import { useEffect, useRef, type ReactNode } from 'react';

/** Native modal focus containment, Escape and focus return, shared by all reader tools. */
export function ReaderPanel({
  children,
  label,
  className = '',
  onClose,
}: {
  children: ReactNode;
  label: string;
  className?: string;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    // A StrictMode cleanup can queue a close event before the modal is reopened.
    const dismiss = () => {
      if (!node.open) close.current();
    };
    node.addEventListener('close', dismiss);
    return () => {
      node.removeEventListener('close', dismiss);
      node.close();
      queueMicrotask(() => {
        if (!node.open && !document.querySelector('dialog[open]') && opener.current?.isConnected)
          opener.current.focus();
      });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`drawer ${className}`}
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
          ),
        ).filter((node) => node.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === event.currentTarget)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      {children}
    </dialog>
  );
}
