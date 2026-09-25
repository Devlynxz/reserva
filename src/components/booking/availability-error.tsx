import { Button } from "@/components/ui";

export function AvailabilityError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-card border border-line bg-danger-soft p-4">
      <p className="text-sm font-medium text-danger">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
