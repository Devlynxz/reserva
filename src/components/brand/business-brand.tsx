import type { BrandMark } from "@/lib/brand-assets";
import { cn } from "@/components/ui";

// The business's own mark for headers: logo, else icon + name, else name (see brandMark).
// Uploaded images are plain <img>: they live on Vercel Blob at unknown sizes.

export function BusinessBrand({ mark, className }: { mark: BrandMark; className?: string }) {
  if (mark.kind === "logo") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logo of unknown size
      <img
        src={mark.src}
        alt={mark.name}
        // A white chip in dark mode so a dark logo never vanishes into the background.
        className={cn("h-8 w-auto max-w-[11rem] object-contain dark:rounded-md dark:bg-white dark:px-1.5 dark:py-1 sm:max-w-[14rem]", className)}
      />
    );
  }
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {mark.kind === "icon" && (
        // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded icon
        <img src={mark.src} alt="" width={32} height={32} className="size-8 shrink-0 rounded-lg" />
      )}
      <span className="truncate font-heading text-lg font-bold tracking-tight sm:text-xl">{mark.name}</span>
    </span>
  );
}
