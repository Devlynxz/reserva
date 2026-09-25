import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * Tables scroll sideways inside their own region on narrow screens instead of
 * breaking the page. The region is focusable and labelled so keyboard users can scroll it.
 * `relative` keeps absolutely positioned descendants (sr-only labels) inside the scroller;
 * without it they widen the whole page.
 */
export function Table({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn("relative overflow-x-auto rounded-card border border-line bg-surface", className)}
    >
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function THead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="border-b border-line bg-surface-muted" {...props} />;
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className="divide-y divide-line" {...props} />;
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-surface-muted/60", className)} {...props} />;
}

export function Th({ className, scope = "col", ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope={scope} className={cn("px-4 py-3 font-semibold text-ink-muted", className)} {...props} />;
}

/** Use `numeric` for money, times and counts: right-aligned, tabular figures. */
export function Td({
  numeric = false,
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={cn("px-4 py-3 text-ink", numeric && "text-right tabular-nums", className)} {...props} />;
}

/** Full-width row for "no bookings yet" style messages. */
export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-ink-muted">
        {children}
      </td>
    </tr>
  );
}
