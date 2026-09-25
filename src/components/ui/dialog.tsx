"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "./cn";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Action buttons; the primary action goes last. */
  footer?: ReactNode;
  className?: string;
};

/**
 * Modal built on the native <dialog>: the browser handles focus trapping, Escape,
 * inertness of the page behind it and returning focus to the trigger.
 */
export function Dialog({ open, onClose, title, description, children, footer, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Escape key and form[method=dialog] both land here.
      onClose={onClose}
      // Clicking the backdrop (the dialog element itself, outside the panel) closes it.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-lg rounded-card border border-line bg-surface p-0 text-ink shadow-2xl",
        className,
      )}
    >
      <div className="space-y-4 p-5 sm:p-6">
        <div className="space-y-1.5">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="text-sm text-ink-muted">
              {description}
            </p>
          )}
        </div>
        {children}
      </div>
      {footer && (
        <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          {footer}
        </div>
      )}
    </dialog>
  );
}
