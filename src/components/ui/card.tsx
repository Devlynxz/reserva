import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card border border-line bg-surface", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  as: Heading = "h2",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned control, e.g. an "Add resource" button. */
  action?: ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6", className)}>
      <div className="min-w-0 space-y-1">
        <Heading className="text-lg font-bold text-ink">{title}</Heading>
        {description && <p className="text-sm text-ink-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-5 sm:px-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4 sm:px-6", className)}
      {...props}
    />
  );
}
