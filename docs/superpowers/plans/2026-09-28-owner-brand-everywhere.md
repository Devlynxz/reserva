# Owner's Brand Everywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every deployment looks like the one business that owns it. The owner's logo, app icon and color appear on the public site, admin, staff sign-in, emails, favicon, home-screen icon and share image. Reserva appears only as an optional "Powered by Reserva" line.

**Architecture:** The app stays single-tenant (one deployment and database per business). `Settings` gains an app icon (`iconUrl`) and a `showPoweredBy` switch. Pure helpers in `src/lib` do the work:
- which mark to show (`brandMark`);
- which icon files to link (`siteIcons`);
- whether a stored URL is safe to use (`isStoredAssetUrl`);
- whether an uploaded icon is valid (`checkAppIcon`).

Pages, metadata, the manifest, the OG image and emails only render what those helpers return. Uploads reuse the existing Vercel Blob logo pipeline.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4, Prisma 7 (Postgres/Neon), zod, Vitest, react-email, `next/og`, Vercel Blob.

**Spec:** The "Decisions" section below. It records the direction the user chose in chat on 2026-09-28 ("Owner's brand everywhere"); there is no separate spec file. Project rules come from `CLAUDE.md`.

## Decisions (the spec)

1. **Single-tenant stays.** One business per deployment. No multi-tenant work.
2. **Business positions show the business brand, never Reserva's.** "Business positions" are the public header, admin header and staff sign-in. Each shows, in priority order:
   1. the owner's logo, if uploaded;
   2. otherwise the owner's app icon plus the business name;
   3. otherwise the business name only.

   The Reserva mark is never shown as the business's mark.
3. **App icon** is a new, separate upload: a square PNG of exactly 512 × 512 px. Logos are usually wide, and favicons and home-screen icons must be square.
   - When set, it's used for the favicon, the Apple touch icon, the web manifest icon and the share (OG) image.
   - When not set, the Reserva kit icons in `public/brand/icons/` stay as the template default.
4. **"Powered by Reserva"** shows in the public footer and under the staff sign-in card. The owner can turn it off in Settings; it's on by default.
5. **Emails** show the owner's logo at the top when one is uploaded, and the business name otherwise (today's behavior).
6. **Dark mode.** An uploaded logo is shown on a small white rounded chip in dark mode, so a dark logo never disappears on the dark background. There is no separate dark-logo upload in this plan.
7. **Only our own stored files are used.** A `logoUrl` or `iconUrl` is used only if it is an `https://<store>.public.blob.vercel-storage.com/…` URL. That's the only host the CSP allows for images, and the only place our upload writes. Anything else (an old value, a manual DB edit) is ignored and the fallback is used. The server never fetches arbitrary URLs.
8. **The manifest `theme_color`** follows the business brand color.

## Global Constraints

- TypeScript strict. zod on every input (forms, server actions).
- Prisma only in `src/server/data/*`. Server actions: validate → delegate → revalidate.
- `src/lib/**/*.ts` must keep 100% statement, branch, function and line coverage (`vitest.config.mts` thresholds).
- Settings changes are ADMIN only (`guard("settings")`) and locked in demo mode (`isDemo()` → `DEMO_LOCKED`).
- Uploads: raster only, identified by magic bytes (`detectImageType`), never SVG, max 1 MB (`MAX_LOGO_BYTES`), random file names.
- Schema changes go through a Prisma migration. The DB test `schema.test.ts` ("no Prisma schema drift") must pass. Run `npm run db:generate` after schema edits (Prisma 7's `migrate` doesn't regenerate the client).
- Definition of done: works at 375px, has loading/empty/error states, is zod-validated, and `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` all pass.
- Line endings are LF. Don't write files with Python's default text mode on Windows.
- Colors come from tokens in `src/app/globals.css`; no new hard-coded colors in components (emails and OG images are the exception, as today).

## Review Focus

These failure modes are implied by the decisions but not naturally covered. Each has a test or check in the task that owns the code.

1. **A dark or transparent logo in dark mode** must stay visible (white chip). Task 5 has a browser check in dark mode.
2. **An app icon that isn't a 512 × 512 PNG** (1024 px, non-square, JPEG, a renamed SVG) must be refused with a message that says what's needed and what was uploaded. Task 1 has unit tests.
3. **A `logoUrl`/`iconUrl` that isn't one of our Blob URLs** (e.g. `http://`, another host, `javascript:`, a URL with credentials) must fall back, never be rendered or fetched. Task 2 has unit tests; Task 7 has an email test.
4. **Unticking "Show Powered by Reserva"** sends no checkbox field at all; it must save as `false`, not keep `true`. Task 3 has validation tests with the form's `booleans` handling.
5. **A long business name with no logo at 375px** must truncate in the header without horizontal page scroll. Task 5 has a browser check with `scrollWidth`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/image-type.ts` | modify | + `pngSize`, `APP_ICON_SIZE`, `checkAppIcon` (pure byte checks) |
| `src/lib/brand-assets.ts` | create | `isStoredAssetUrl`, `brandMark`, `siteIcons` (pure brand decisions) |
| `prisma/schema.prisma` + new migration | modify/create | `Settings.iconUrl`, `Settings.showPoweredBy` |
| `src/lib/validation.ts` | modify | `settingsInputSchema.showPoweredBy` |
| `src/server/data/settings.ts` | modify | expose the new fields, `setIconUrl` |
| `src/server/blob.ts` | modify | shared `storeImage`; + `uploadIcon` |
| `src/server/actions/admin/settings.ts` | modify | shared upload helper; + `uploadIconAction`, `removeIconAction`; save `showPoweredBy` |
| `src/app/(admin)/admin/settings/page.tsx` | modify | "App icon" card; "Powered by" checkbox |
| `src/components/brand/business-brand.tsx` | create | renders a `BrandMark` (logo / icon + name / name) |
| `src/components/brand/reserva-logo.tsx` | modify | lockup only (the mark variant is removed) |
| `src/app/(public)/layout.tsx`, `src/app/(admin)/admin/layout.tsx`, `src/app/(auth)/sign-in/page.tsx` | modify | use `BusinessBrand`; gate "Powered by" |
| `src/app/layout.tsx`, `src/app/manifest.ts`, `src/app/opengraph-image.tsx` | modify | icons, manifest and OG from the owner's brand |
| `src/server/email/templates/layout.tsx`, `src/server/notifications.ts` | modify | logo in the email header |
| `public/brand/reserva-mark*.png`, `public/brand/icons/icon-dark-512.png` | delete | unused after this change |
| `README.md`, `CLAUDE.md` | modify | document the owner-brand fields |

---

### Task 1: App icon byte checks

**Files:**
- Modify: `src/lib/image-type.ts`
- Test: `src/lib/__tests__/image-type.test.ts`

**Interfaces:**
- Consumes: `detectImageType(bytes: Uint8Array): ImageType | null` (existing).
- Produces:
  - `pngSize(bytes: Uint8Array): { width: number; height: number } | null`
  - `APP_ICON_SIZE: 512`
  - `checkAppIcon(bytes: Uint8Array): string | null` returns `null` when valid, otherwise a user-facing message.

- [ ] **Step 1: Write the failing tests.** Append to `src/lib/__tests__/image-type.test.ts`, and change its import line to `import { APP_ICON_SIZE, checkAppIcon, detectImageType, pngSize } from "../image-type";`

```ts
/** A PNG signature followed by an IHDR chunk header for the given size (enough for pngSize). */
function pngHeader(width: number, height: number): Uint8Array {
  const out = new Uint8Array(24);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  out.set([0, 0, 0, 13], 8); // IHDR data length
  out.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  const view = new DataView(out.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return out;
}

describe("pngSize", () => {
  it("reads width and height from the IHDR chunk", () => {
    expect(pngSize(pngHeader(512, 512))).toEqual({ width: 512, height: 512 });
    expect(pngSize(pngHeader(1200, 630))).toEqual({ width: 1200, height: 630 });
  });

  it("returns null for non-PNGs, truncated PNGs and a missing IHDR", () => {
    expect(pngSize(bytes(0xff, 0xd8, 0xff, 0xe0))).toBeNull();
    expect(pngSize(pngHeader(512, 512).slice(0, 20))).toBeNull();
    const noIhdr = pngHeader(512, 512);
    noIhdr.set(ascii("IDAT"), 12);
    expect(pngSize(noIhdr)).toBeNull();
  });
});

describe("checkAppIcon", () => {
  it("accepts a 512 × 512 PNG", () => {
    expect(APP_ICON_SIZE).toBe(512);
    expect(checkAppIcon(pngHeader(512, 512))).toBeNull();
  });

  it("refuses other sizes and says what it got", () => {
    expect(checkAppIcon(pngHeader(1024, 1024))).toBe("Use a square PNG of exactly 512 × 512 pixels (this one is 1024 × 1024).");
    expect(checkAppIcon(pngHeader(512, 256))).toBe("Use a square PNG of exactly 512 × 512 pixels (this one is 512 × 256).");
  });

  it("refuses JPEG, WebP, SVG and junk", () => {
    const message = "Use a PNG image for the app icon.";
    expect(checkAppIcon(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(message);
    expect(checkAppIcon(ascii("RIFF\0\0\0\0WEBPVP8 "))).toBe(message);
    expect(checkAppIcon(ascii('<svg xmlns="http://www.w3.org/2000/svg">'))).toBe(message);
    expect(checkAppIcon(new Uint8Array())).toBe(message);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail.**
  Run: `npx vitest run src/lib/__tests__/image-type.test.ts`
  Expected: FAIL, because `pngSize` / `checkAppIcon` / `APP_ICON_SIZE` are not exported.

- [ ] **Step 3: Implement.** Append to `src/lib/image-type.ts`:

```ts
/** Pixel size of a PNG, read from its IHDR chunk (always the first chunk). */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (detectImageType(bytes)?.ext !== "png" || bytes.length < 24) return null;
  // Layout after the 8-byte signature: length(4) "IHDR"(4) width(4) height(4), big-endian.
  if (!startsWith(bytes, [0x49, 0x48, 0x44, 0x52], 12)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Favicons, home-screen icons and the share image all derive from one square PNG. */
export const APP_ICON_SIZE = 512;

/** null when the bytes are a usable app icon; otherwise what to tell the owner. */
export function checkAppIcon(bytes: Uint8Array): string | null {
  const size = pngSize(bytes);
  if (!size) return "Use a PNG image for the app icon.";
  if (size.width !== APP_ICON_SIZE || size.height !== APP_ICON_SIZE) {
    return `Use a square PNG of exactly ${APP_ICON_SIZE} × ${APP_ICON_SIZE} pixels (this one is ${size.width} × ${size.height}).`;
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to confirm they pass.**
  Run: `npx vitest run src/lib/__tests__/image-type.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/image-type.ts src/lib/__tests__/image-type.test.ts
git commit -m "feat: validate app icon uploads (512 × 512 PNG)"
```

---

### Task 2: Brand decisions as pure functions

**Files:**
- Create: `src/lib/brand-assets.ts`
- Test: `src/lib/__tests__/brand-assets.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `isStoredAssetUrl(url: string | null | undefined): url is string`
  - `type BrandMark = { kind: "logo"; src: string; name: string } | { kind: "icon"; src: string; name: string } | { kind: "name"; name: string }`
  - `brandMark(brand: { businessName: string; logoUrl: string | null; iconUrl: string | null }): BrandMark`
  - `type SiteIcons = { icon: { url: string; sizes: string; type: "image/png" }[]; apple: { url: string; sizes: string }; manifest: { src: string; sizes: string; type: "image/png"; purpose?: "maskable" }[] }`
  - `siteIcons(iconUrl: string | null): SiteIcons`

- [ ] **Step 1: Write the failing tests.** Create `src/lib/__tests__/brand-assets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { brandMark, isStoredAssetUrl, siteIcons } from "../brand-assets";

const BLOB = "https://abc123.public.blob.vercel-storage.com/logos/logo-1a2b.png";
const ICON = "https://abc123.public.blob.vercel-storage.com/icons/icon-3c4d.png";

describe("isStoredAssetUrl", () => {
  it("accepts https URLs on our Vercel Blob store", () => {
    expect(isStoredAssetUrl(BLOB)).toBe(true);
  });

  it.each([
    null,
    undefined,
    "",
    "not a url",
    "http://abc123.public.blob.vercel-storage.com/logo.png",
    "https://evil.example/logo.png",
    "https://public.blob.vercel-storage.com.evil.example/logo.png",
    "https://user:pass@abc123.public.blob.vercel-storage.com/logo.png",
    "https://:pass@abc123.public.blob.vercel-storage.com/logo.png",
    "javascript:alert(1)",
  ])("refuses %s", (url) => {
    expect(isStoredAssetUrl(url)).toBe(false);
  });
});

describe("brandMark", () => {
  const name = "Villa Serena";

  it("prefers the logo", () => {
    expect(brandMark({ businessName: name, logoUrl: BLOB, iconUrl: ICON })).toEqual({ kind: "logo", src: BLOB, name });
  });

  it("falls back to icon + name, then name", () => {
    expect(brandMark({ businessName: name, logoUrl: null, iconUrl: ICON })).toEqual({ kind: "icon", src: ICON, name });
    expect(brandMark({ businessName: name, logoUrl: null, iconUrl: null })).toEqual({ kind: "name", name });
  });

  it("ignores URLs that aren't our stored assets", () => {
    expect(brandMark({ businessName: name, logoUrl: "https://evil.example/x.png", iconUrl: "http://x" })).toEqual({ kind: "name", name });
  });
});

describe("siteIcons", () => {
  it("uses the Reserva kit icons by default", () => {
    const icons = siteIcons(null);
    expect(icons.icon.map((i) => i.sizes)).toEqual(["16x16", "32x32", "48x48"]);
    expect(icons.icon[0]?.url).toBe("/brand/icons/favicon-16.png");
    expect(icons.apple).toEqual({ url: "/brand/icons/apple-touch-icon.png", sizes: "180x180" });
    expect(icons.manifest.map((i) => i.src)).toEqual([
      "/brand/icons/icon-192.png",
      "/brand/icons/icon-512.png",
      "/brand/icons/icon-maskable-512.png",
    ]);
    expect(icons.manifest[2]?.purpose).toBe("maskable");
  });

  it("uses the owner's 512 × 512 icon everywhere when set, never as maskable", () => {
    const icons = siteIcons(ICON);
    expect(icons.icon).toEqual([{ url: ICON, sizes: "512x512", type: "image/png" }]);
    expect(icons.apple).toEqual({ url: ICON, sizes: "512x512" });
    expect(icons.manifest).toEqual([{ src: ICON, sizes: "512x512", type: "image/png" }]);
  });

  it("ignores an icon URL that isn't a stored asset", () => {
    expect(siteIcons("https://evil.example/icon.png")).toEqual(siteIcons(null));
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail.**
  Run: `npx vitest run src/lib/__tests__/brand-assets.test.ts`
  Expected: FAIL with "Failed to resolve import ../brand-assets".

- [ ] **Step 3: Implement.** Create `src/lib/brand-assets.ts`:

```ts
// Which of the business's brand assets to show, and where. The owner uploads a logo and an
// app icon (Settings); until they do, the Reserva kit icons in public/brand/icons are the
// template default. Only files on our own Vercel Blob store are ever used: that's the only
// image host the CSP allows and the only place uploads go, and it means the server never
// fetches an arbitrary URL (OG image, emails).

const BLOB_HOST = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i;

export function isStoredAssetUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && BLOB_HOST.test(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
}

export type BrandMark =
  | { kind: "logo"; src: string; name: string }
  | { kind: "icon"; src: string; name: string }
  | { kind: "name"; name: string };

/** What the header shows for the business: its logo, else its icon and name, else its name. */
export function brandMark(brand: { businessName: string; logoUrl: string | null; iconUrl: string | null }): BrandMark {
  const name = brand.businessName;
  if (isStoredAssetUrl(brand.logoUrl)) return { kind: "logo", src: brand.logoUrl, name };
  if (isStoredAssetUrl(brand.iconUrl)) return { kind: "icon", src: brand.iconUrl, name };
  return { kind: "name", name };
}

export type SiteIcons = {
  icon: { url: string; sizes: string; type: "image/png" }[];
  apple: { url: string; sizes: string };
  manifest: { src: string; sizes: string; type: "image/png"; purpose?: "maskable" }[];
};

const KIT = "/brand/icons";

/** Favicon, Apple touch icon and manifest icons for the business. */
export function siteIcons(iconUrl: string | null): SiteIcons {
  if (isStoredAssetUrl(iconUrl)) {
    // One 512 × 512 PNG (enforced at upload); browsers scale it. Not "maskable": an
    // owner's icon isn't designed with the safe zone that purpose requires.
    return {
      icon: [{ url: iconUrl, sizes: "512x512", type: "image/png" }],
      apple: { url: iconUrl, sizes: "512x512" },
      manifest: [{ src: iconUrl, sizes: "512x512", type: "image/png" }],
    };
  }
  return {
    icon: [16, 32, 48].map((px) => ({ url: `${KIT}/favicon-${px}.png`, sizes: `${px}x${px}`, type: "image/png" as const })),
    apple: { url: `${KIT}/apple-touch-icon.png`, sizes: "180x180" },
    manifest: [
      { src: `${KIT}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${KIT}/icon-512.png`, sizes: "512x512", type: "image/png" },
      { src: `${KIT}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

- [ ] **Step 4: Run the tests to confirm they pass, with full coverage.**
  Run: `npx vitest run src/lib/__tests__/brand-assets.test.ts --coverage --coverage.include=src/lib/brand-assets.ts`
  Expected: PASS, with 100% on `brand-assets.ts`.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/brand-assets.ts src/lib/__tests__/brand-assets.test.ts
git commit -m "feat: pure brand-asset decisions (mark, site icons, trusted URLs)"
```

---

### Task 3: Settings fields: app icon and "Powered by" switch

**Files:**
- Modify: `prisma/schema.prisma` (model `Settings`, around line 323)
- Create: `prisma/migrations/<timestamp>_owner_brand/migration.sql` (generated)
- Modify: `src/lib/validation.ts` (`settingsInputSchema`, around line 218)
- Modify: `src/server/data/settings.ts`
- Test: `src/lib/__tests__/validation.test.ts`, `src/server/__tests__/db/admin-data.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `BusinessSettings.iconUrl: string | null`
  - `BusinessSettings.showPoweredBy: boolean`
  - `SettingsUpdate.showPoweredBy: boolean`
  - `setIconUrl(iconUrl: string | null): Promise<void>`
  - `settingsInputSchema` output gains `showPoweredBy: boolean` (default `true` when the key is absent)

- [ ] **Step 1: Write the failing validation tests.** In `src/lib/__tests__/validation.test.ts`, inside `describe("settingsInputSchema", …)`, add:

```ts
  it("defaults 'Powered by' on and keeps an explicit false from the form", () => {
    expect(settingsInputSchema.parse(settings).showPoweredBy).toBe(true);
    // formObject(formData, { booleans: ["showPoweredBy"] }) turns an unticked box into false.
    expect(settingsInputSchema.parse({ ...settings, showPoweredBy: false }).showPoweredBy).toBe(false);
    expect(settingsInputSchema.safeParse({ ...settings, showPoweredBy: "yes" }).success).toBe(false);
  });
```

- [ ] **Step 2: Write the failing DB test.** In `src/server/__tests__/db/admin-data.test.ts`:
  - change the import to `import { getSettings, setIconUrl, updateSettings } from "@/server/data/settings";`
  - add after the "settings round-trip" test:

```ts
  it("stores the app icon and the 'Powered by' switch", async () => {
    expect(await getSettings()).toMatchObject({ iconUrl: null, showPoweredBy: true });

    const icon = "https://abc123.public.blob.vercel-storage.com/icons/icon-1.png";
    await setIconUrl(icon);
    const current = await getSettings();
    await updateSettings({ ...current, showPoweredBy: false });
    expect(await getSettings()).toMatchObject({ iconUrl: icon, showPoweredBy: false });

    await setIconUrl(null);
    expect((await getSettings()).iconUrl).toBeNull();
  });
```

- [ ] **Step 3: Run the tests to confirm they fail.**
  Run: `npx vitest run src/lib/__tests__/validation.test.ts src/server/__tests__/db/admin-data.test.ts`
  Expected: the validation test FAILS (`showPoweredBy` undefined). The DB test fails to compile or run because `setIconUrl` isn't exported. DB tests need `TEST_DATABASE_URL`; without it they're skipped, so make sure it's set, e.g. the local Postgres on port 5433 from `.env`.

- [ ] **Step 4: Change the schema.** In `prisma/schema.prisma`, model `Settings`, add after `logoUrl`:

```prisma
  /// Square 512 × 512 PNG on Vercel Blob: favicon, home-screen icon, share image.
  iconUrl        String?  @map("icon_url")
  /// Show "Powered by Reserva" in the public footer and on staff sign-in.
  showPoweredBy  Boolean  @default(true) @map("show_powered_by")
```

- [ ] **Step 5: Create the migration and regenerate the client.**
  Run: `npm run db:migrate -- --name owner_brand`
  Then: `npm run db:generate`
  Expected: a new `prisma/migrations/<timestamp>_owner_brand/migration.sql` containing two `ALTER TABLE "settings" ADD COLUMN …` statements: `"icon_url" TEXT` and `"show_powered_by" BOOLEAN NOT NULL DEFAULT true`. Open it and check nothing else is in it. If it tries to touch `span` or the exclusion constraints, stop: that's schema drift, and needs investigating, not committing.

- [ ] **Step 6: Update validation.** In `src/lib/validation.ts`, add to `settingsInputSchema` after `policies`:

```ts
  showPoweredBy: z.boolean().default(true),
```

- [ ] **Step 7: Update the data layer.** In `src/server/data/settings.ts`:
  - `BusinessSettings`: add `iconUrl: string | null;` after `logoUrl` and `showPoweredBy: boolean;` after `content`.
  - `getSettings()` return object: add `iconUrl: row.iconUrl,` after `logoUrl` and `showPoweredBy: row.showPoweredBy,` at the end.
  - `SettingsUpdate`: add `showPoweredBy: boolean;`.
  - Append:

```ts
export async function setIconUrl(iconUrl: string | null): Promise<void> {
  await db.settings.update({ where: { id: 1 }, data: { iconUrl } });
}
```

- [ ] **Step 8: Pass the switch through the save action.** In `src/server/actions/admin/settings.ts`, in `saveSettingsAction`, change

```ts
  const raw = formObject(formData, { multi: ["weekendDays"] });
```

to

```ts
  const raw = formObject(formData, { multi: ["weekendDays"], booleans: ["showPoweredBy"] });
```

(`parsed.data` now carries `showPoweredBy` into `updateSettings`.)

- [ ] **Step 9: Run the tests and typecheck.**
  Run: `npx vitest run src/lib/__tests__/validation.test.ts src/server/__tests__/db/admin-data.test.ts src/server/__tests__/db/schema.test.ts && npm run typecheck`
  Expected: PASS, including "no Prisma schema drift". Fix any typecheck errors from places that build a `SettingsUpdate` literal by adding `showPoweredBy`.

- [ ] **Step 10: Commit.**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/validation.ts src/lib/__tests__/validation.test.ts src/server/data/settings.ts src/server/actions/admin/settings.ts src/server/__tests__/db/admin-data.test.ts
git commit -m "feat: settings for the owner's app icon and the Powered by switch"
```

---

### Task 4: Upload and remove the app icon in admin Settings

**Files:**
- Modify: `src/server/blob.ts`
- Modify: `src/server/actions/admin/settings.ts`
- Modify: `src/app/(admin)/admin/settings/page.tsx`

**Interfaces:**
- Consumes:
  - `checkAppIcon` (Task 1)
  - `setIconUrl`, `BusinessSettings.iconUrl`, `BusinessSettings.showPoweredBy` (Task 3)
  - `isStoredAssetUrl` (Task 2)
- Produces:
  - `uploadIcon(file: File): Promise<string>`
  - `uploadIconAction(prev: FormState, formData: FormData): Promise<FormState>`
  - `removeIconAction(): Promise<FormState>`

These are thin wrappers over tested pieces: the byte check is covered in Task 1, and authorization is `guard("settings")`, whose STAFF refusal `admin-authz.test.ts` already covers for the whole area. Verification is typecheck plus the browser check in Task 8.

- [ ] **Step 1: Generalize the Blob upload.** Replace the body of `src/server/blob.ts` below `blobEnabled()` with:

```ts
/** Validates (size, real image type, optional extra check) and stores an image; returns its public URL. */
async function storeImage(file: File, folder: "logos" | "icons", check?: (bytes: Uint8Array) => string | null): Promise<string> {
  const token = env().BLOB_READ_WRITE_TOKEN;
  if (!token) throw new UploadError("Photo storage isn't connected. Add a Vercel Blob store first.");
  if (file.size === 0) throw new UploadError("Choose an image file.");
  if (file.size > MAX_LOGO_BYTES) throw new UploadError("Use an image under 1 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) throw new UploadError("Use a PNG, JPEG or WebP image.");
  const problem = check?.(bytes);
  if (problem) throw new UploadError(problem);

  // Random, unguessable name; the extension and content type come from the bytes, not the upload.
  const name = folder === "logos" ? "logo" : "icon";
  const blob = await put(`${folder}/${name}-${randomBytes(8).toString("hex")}.${type.ext}`, Buffer.from(bytes), {
    access: "public",
    contentType: type.mime,
    token,
  });
  return blob.url;
}

export function uploadLogo(file: File): Promise<string> {
  return storeImage(file, "logos");
}

/** The app icon must be a 512 × 512 PNG (see checkAppIcon). */
export function uploadIcon(file: File): Promise<string> {
  return storeImage(file, "icons", checkAppIcon);
}
```

and change the import line to `import { checkAppIcon, detectImageType } from "@/lib/image-type";`.

- [ ] **Step 2: Share the upload action flow and add the icon actions.** In `src/server/actions/admin/settings.ts`:
  - change the imports to `import { UploadError, uploadIcon, uploadLogo } from "../../blob";` and `import { setIconUrl, setLogoUrl, updateSettings } from "../../data/settings";`
  - replace `uploadLogoAction` and `removeLogoAction` with:

```ts
/** Owner-only image upload: validate the field, store it, save its URL, refresh every page. */
async function replaceImage(
  formData: FormData,
  field: "logo" | "icon",
  upload: (file: File) => Promise<string>,
  save: (url: string | null) => Promise<void>,
  message: string,
): Promise<FormState> {
  const session = await guard("settings");
  if (!isSession(session)) return session;
  if (isDemo()) return { error: DEMO_LOCKED };
  const file = formData.get(field);
  if (!(file instanceof File)) return { error: "Choose an image file.", fieldErrors: { [field]: "Choose an image file." } };
  try {
    await save(await upload(file));
  } catch (error) {
    if (error instanceof UploadError) return { error: error.message, fieldErrors: { [field]: error.message } };
    console.error(`[${field} upload]`, error);
    return { error: "The upload failed. Please try again." };
  }
  // The brand shows on every page, in metadata and in the manifest.
  revalidatePath("/", "layout");
  return { ok: true, message };
}

async function clearImage(save: (url: string | null) => Promise<void>): Promise<FormState> {
  const session = await guard("settings");
  if (!isSession(session)) return session;
  if (isDemo()) return { error: DEMO_LOCKED };
  await save(null);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function uploadLogoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return replaceImage(formData, "logo", uploadLogo, setLogoUrl, "Logo updated.");
}

export async function removeLogoAction(): Promise<FormState> {
  return clearImage(setLogoUrl);
}

export async function uploadIconAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return replaceImage(formData, "icon", uploadIcon, setIconUrl, "App icon updated.");
}

export async function removeIconAction(): Promise<FormState> {
  return clearImage(setIconUrl);
}
```

- [ ] **Step 3: Add the "App icon" card and the "Powered by" checkbox.** In `src/app/(admin)/admin/settings/page.tsx`:
  - imports: `import { ActionForm, AdminCheckbox, AdminCheckboxGroup, AdminField } from "@/components/admin/action-form";` and `import { removeIconAction, removeLogoAction, saveSettingsAction, uploadIconAction, uploadLogoAction } from "@/server/actions/admin/settings";`
  - change the Logo card description to: `"Shown in the site and admin headers and at the top of emails. PNG, JPEG or WebP, up to 1 MB. A wide logo on a transparent background works best."`
  - insert after the Logo `</Card>`:

```tsx
      <Card>
        <CardHeader
          title="App icon"
          description="The square icon for browser tabs, phone home screens and link previews. A PNG of exactly 512 × 512 pixels."
        />
        <CardBody className="space-y-4">
          {s.iconUrl && (
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded icon */}
              <img src={s.iconUrl} alt="Current app icon" width={48} height={48} className="size-12 rounded-control border border-line bg-surface" />
              <ActionButton action={removeIconAction} label="Remove icon" />
            </div>
          )}
          {blobEnabled() ? (
            <ActionForm action={uploadIconAction} submitLabel="Upload icon" submitVariant="secondary" resetOnSuccess>
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold">Image file</span>
                <input
                  type="file"
                  name="icon"
                  accept="image/png"
                  required
                  className="block w-full text-sm file:mr-3 file:h-10 file:rounded-control file:border file:border-line-strong file:bg-surface file:px-3 file:font-semibold"
                />
              </label>
            </ActionForm>
          ) : (
            <p className="text-sm text-ink-muted">To upload an icon, connect a Vercel Blob store to this project (Storage → Blob). It sets BLOB_READ_WRITE_TOKEN.</p>
          )}
        </CardBody>
      </Card>
```

  - in the "Website" card, after the `policies` field, add:

```tsx
            <AdminCheckbox
              name="showPoweredBy"
              label="Show “Powered by Reserva”"
              hint="A small line in the site footer and on the staff sign-in page."
              defaultChecked={s.showPoweredBy}
            />
```

- [ ] **Step 4: Typecheck and lint.**
  Run: `npm run typecheck && npm run lint`
  Expected: both pass. Check that `ActionForm` reports `fieldErrors.icon` next to the file input the same way it does for `logo`; if it maps errors by field name, `icon` works automatically.

- [ ] **Step 5: Commit.**

```bash
git add src/server/blob.ts src/server/actions/admin/settings.ts "src/app/(admin)/admin/settings/page.tsx"
git commit -m "feat: owner uploads an app icon; Powered by switch in settings"
```

---

### Task 5: The business's mark in every header

**Files:**
- Create: `src/components/brand/business-brand.tsx`
- Modify: `src/components/brand/reserva-logo.tsx`
- Modify: `src/app/(public)/layout.tsx`, `src/app/(admin)/admin/layout.tsx`, `src/app/(auth)/sign-in/page.tsx`
- Delete: `public/brand/reserva-mark.png`, `public/brand/reserva-mark-white.png`, `public/brand/icons/icon-dark-512.png`

**Interfaces:**
- Consumes:
  - `brandMark`, `BrandMark` (Task 2)
  - `BusinessSettings.iconUrl`, `BusinessSettings.showPoweredBy` (Task 3)
  - `PoweredByReserva` (existing)
- Produces: `BusinessBrand({ mark, className }: { mark: BrandMark; className?: string })`

- [ ] **Step 1: Create the component.** Create `src/components/brand/business-brand.tsx`:

```tsx
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
```

- [ ] **Step 2: Use it in the public header, and gate "Powered by".** In `src/app/(public)/layout.tsx`:
  - add the imports `import { BusinessBrand } from "@/components/brand/business-brand";` and `import { brandMark } from "@/lib/brand-assets";`
  - after `const name = …` add `const mark = brandMark({ businessName: name, logoUrl: settings?.logoUrl ?? null, iconUrl: settings?.iconUrl ?? null });`
  - replace the header `<Link href="/" …>…</Link>` with:

```tsx
          <Link href="/" className="flex min-w-0 items-center">
            <BusinessBrand mark={mark} />
          </Link>
```

  - in the footer, replace `<PoweredByReserva />` with `{(settings?.showPoweredBy ?? true) && <PoweredByReserva />}`

- [ ] **Step 3: Use it in the admin header.** In `src/app/(admin)/admin/layout.tsx`:
  - replace the `ReservaLogo` import with `import { BusinessBrand } from "@/components/brand/business-brand";` and add `import { brandMark } from "@/lib/brand-assets";`
  - replace the header `<Link href="/admin" …>…</Link>` with:

```tsx
          <Link href="/admin" className="flex min-w-0 items-center">
            <BusinessBrand
              mark={brandMark({
                businessName: settings?.businessName ?? reservaConfig.brand.name,
                logoUrl: settings?.logoUrl ?? null,
                iconUrl: settings?.iconUrl ?? null,
              })}
            />
          </Link>
```

- [ ] **Step 4: Use it on staff sign-in, with "Powered by" below the card.** Replace `src/app/(auth)/sign-in/page.tsx` with:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BusinessBrand } from "@/components/brand/business-brand";
import { PoweredByReserva } from "@/components/brand/reserva-logo";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { brandMark } from "@/lib/brand-assets";
import { safeAdminRedirect } from "@/lib/safe-redirect";
import { isDemo } from "@/server/demo";
import { getSettingsOrNull } from "@/server/data/settings";
import { getStaffSession } from "@/server/session";
import { reservaConfig } from "@reserva/config";
import { DemoSignIn } from "./demo-sign-in";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeAdminRedirect((await searchParams).next);
  if (await getStaffSession()) redirect(next);
  const settings = await getSettingsOrNull();
  const mark = brandMark({
    businessName: settings?.businessName ?? reservaConfig.brand.name,
    logoUrl: settings?.logoUrl ?? null,
    iconUrl: settings?.iconUrl ?? null,
  });

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <BusinessBrand mark={mark} className="max-w-full" />
      <Card className="w-full max-w-sm">
        <CardHeader as="h1" title="Sign in" description="For staff and owners. Customers don't need an account." />
        <CardBody className="space-y-5">
          {isDemo() && <DemoSignIn />}
          <SignInForm next={next} />
        </CardBody>
      </Card>
      {(settings?.showPoweredBy ?? true) && <PoweredByReserva />}
    </main>
  );
}
```

- [ ] **Step 5: Reduce `ReservaLogo` to the lockup, and delete the unused files.** In `src/components/brand/reserva-logo.tsx`:
  - replace the `LOGOS` object and `ReservaLogo` with:

```tsx
const LOCKUP = {
  light: "/brand/reserva-lockup-horizontal.png",
  dark: "/brand/reserva-lockup-horizontal-white.png",
  width: 878,
  height: 260,
} as const;

/** The Reserva lockup at a fixed height (the width follows). Decorative unless `label` is given. */
export function ReservaLogo({ height, label, className }: { height: number; label?: string; className?: string }) {
  const width = Math.round((LOCKUP.width / LOCKUP.height) * height);
  // The name sits on the wrapper: whichever copy the theme hides, it's announced once.
  return (
    <span role={label ? "img" : undefined} aria-label={label} className={cn("inline-flex shrink-0", className)}>
      <Image src={LOCKUP.light} alt="" width={width} height={height} className="dark:hidden" />
      <Image src={LOCKUP.dark} alt="" width={width} height={height} className="hidden dark:block" />
    </span>
  );
}
```

  - update the file's top comment to: `// The Reserva product brand, shown only as the optional "Powered by Reserva" line. Everything else on a deployment shows the business's own brand (see BusinessBrand).`
  - then run:

```bash
git rm public/brand/reserva-mark.png public/brand/reserva-mark-white.png public/brand/icons/icon-dark-512.png
```

  - Run: `git grep -n "reserva-mark\|icon-dark-512\|variant=\"mark\"" -- src docs README.md`
    Expected: no matches.

- [ ] **Step 6: Typecheck, lint, test.**
  Run: `npm run typecheck && npm run lint && npm test`
  Expected: all pass.

- [ ] **Step 7: Browser checks (Review Focus 1 and 5).** With the dev server running (`preview_start` name `reserva-dev`, or the already-running one on :3000):
  1. **Long name at 375px, light mode:** temporarily set a long business name in the local dev DB:

     ```sql
     update settings set business_name='Villa Serena Private Resort and Events Place Pansol Calamba', logo_url=null, icon_url=null;
     ```

     Open `/`, `/admin` (signed in) and `/sign-in`. Check that in JS, `document.documentElement.scrollWidth <= window.innerWidth`, and that the name truncates with an ellipsis in the headers.
  2. **Logo fallback:** set `logo_url` to a non-Blob URL, e.g. `https://example.com/x.png`. The header must show the name, not a broken image.
  3. **Dark mode:** if you have a Blob token, upload a dark PNG logo in Settings. Otherwise set `logo_url` to a real `*.public.blob.vercel-storage.com` PNG you control. In dark mode the logo must sit on the white chip.
  4. **Powered by:** untick "Show Powered by Reserva" and save. The footer and sign-in must no longer show it. Tick it again and it's back.
  5. Restore the original business name afterwards.

- [ ] **Step 8: Commit.**

```bash
git add -A src/components/brand src/app public/brand
git commit -m "feat: headers and sign-in show the business's own brand"
```

---

### Task 6: Favicon, home-screen icon, manifest and share image from the owner's brand

**Files:**
- Modify: `src/app/layout.tsx` (`generateMetadata`)
- Modify: `src/app/manifest.ts`
- Modify: `src/app/opengraph-image.tsx`

**Interfaces:**
- Consumes:
  - `siteIcons`, `isStoredAssetUrl` (Task 2)
  - `BusinessSettings.iconUrl` (Task 3)
  - `normalizeHex` (existing, `src/lib/color.ts`)
- Produces: nothing new.

- [ ] **Step 1: Metadata icons.** In `src/app/layout.tsx`:
  - add `import { siteIcons } from "@/lib/brand-assets";`
  - in `generateMetadata`, add `const icons = siteIcons(settings?.iconUrl ?? null);`
  - replace the whole `icons: { … }` property (and its comment) with:

```ts
    // The owner's app icon once uploaded; the Reserva kit icons until then.
    icons: { icon: icons.icon, apple: icons.apple },
```

- [ ] **Step 2: Manifest.** Replace the body of `manifest()` in `src/app/manifest.ts` with:

```ts
  const settings = await getSettingsOrNull();
  const name = settings?.businessName ?? reservaConfig.brand.name;
  return {
    name,
    short_name: name,
    description: settings?.tagline ?? reservaConfig.brand.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: normalizeHex(settings?.brandColor ?? "") ?? reservaConfig.brand.color,
    icons: siteIcons(settings?.iconUrl ?? null).manifest,
  };
```

and add the imports `import { siteIcons } from "@/lib/brand-assets";` and `import { normalizeHex } from "@/lib/color";`.

- [ ] **Step 3: Share image.** In `src/app/opengraph-image.tsx`:
  - add `import { isStoredAssetUrl } from "@/lib/brand-assets";`
  - after `const onBrand = …` add:

```ts
  // Only our own stored file: next/og fetches it server-side while rendering.
  const iconUrl = settings?.iconUrl ?? null;
  const icon = isStoredAssetUrl(iconUrl) ? iconUrl : null;
```
  - replace the first child `<div style={{ display: "flex" }}>…</div>` (the one holding the "Book online" pill) with:

```tsx
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {icon && (
            // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og
            <img src={icon} width={96} height={96} alt="" style={{ borderRadius: 20 }} />
          )}
          <div
            style={{
              display: "flex",
              padding: "10px 22px",
              borderRadius: 999,
              background: brand,
              color: onBrand,
              fontSize: 26,
              fontWeight: 600,
            }}
          >
            Book online
          </div>
        </div>
```

- [ ] **Step 4: Verify the rendered output.**
  Run: `npm run typecheck && npm run lint`
  Then, with the dev server running:
  - `curl -s http://localhost:3000/ | grep -o '<link rel="\(icon\|apple-touch-icon\|manifest\)"[^>]*>'`. Expected: the kit icons, since there's no icon in the dev DB.
  - `curl -s http://localhost:3000/manifest.webmanifest`. Expected: `theme_color` equals the business brand color (`#2e7d6b` in the dev DB), with three kit icons.
  - `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/opengraph-image`. Expected: `200 image/png`.
  - Set `icon_url` in the dev DB to a real Blob PNG if you have one, reload, and repeat. Expected: one `512x512` icon link, pointing at the Blob URL, in all three places.

- [ ] **Step 5: Commit.**

```bash
git add src/app/layout.tsx src/app/manifest.ts src/app/opengraph-image.tsx
git commit -m "feat: favicon, manifest and share image use the owner's icon and color"
```

---

### Task 7: The owner's logo in customer emails

**Files:**
- Modify: `src/server/email/templates/layout.tsx`
- Modify: `src/server/notifications.ts` (`baseProps`, around line 31)
- Test: `src/server/__tests__/db/checkout-and-email.test.ts`

**Interfaces:**
- Consumes: `isStoredAssetUrl` (Task 2), `BusinessSettings.logoUrl` (existing).
- Produces: `EmailBrand.logoUrl: string | null`. Templates render it only if non-null; callers pass only trusted URLs.

- [ ] **Step 1: Write the failing tests.** In `src/server/__tests__/db/checkout-and-email.test.ts`:
  - in the existing test "renders the confirmation with the reference and a working link", add `logoUrl: null` to the `brand` object;
  - add `import { EmailLayout } from "@/server/email/templates/layout";` to the imports if it isn't there;
  - add inside `describeDb("emails", …)`:

```ts
  it("puts the owner's logo at the top when there is one, and the name otherwise", async () => {
    const brand = { businessName: "Test Resort", brandColor: "#2e7d6b", contact: null, address: null };
    const logo = "https://abc123.public.blob.vercel-storage.com/logos/logo-1.png";

    const withLogo = await render(EmailLayout({ brand: { ...brand, logoUrl: logo }, preview: "Hi", children: "Body" }));
    expect(withLogo).toContain(`src="${logo}"`);
    expect(withLogo).toContain('alt="Test Resort"');

    const withoutLogo = await render(EmailLayout({ brand: { ...brand, logoUrl: null }, preview: "Hi", children: "Body" }));
    expect(withoutLogo).not.toContain("<img");
    expect(withoutLogo).toContain("Test Resort");
  });
```

- [ ] **Step 2: Run the tests to confirm they fail.**
  Run: `npx vitest run src/server/__tests__/db/checkout-and-email.test.ts -t "logo"`
  Expected: FAIL. You'll get a TypeScript/esbuild error on `logoUrl`, or `withLogo` won't contain the `src` (it needs `TEST_DATABASE_URL`, like the other DB tests).

- [ ] **Step 3: Implement the template.** In `src/server/email/templates/layout.tsx`:
  - import `Img`: `import { Body, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from "@react-email/components";`
  - add `/** Only a trusted (our Blob store) URL, or null — see isStoredAssetUrl. */ logoUrl: string | null;` to `EmailBrand`
  - replace `<Text style={{ ...muted, fontWeight: 600, margin: "0 0 20px" }}>{brand.businessName}</Text>` with:

```tsx
            {brand.logoUrl ? (
              <Img src={brand.logoUrl} alt={brand.businessName} height="40" style={{ display: "block", height: "40px", margin: "0 0 20px", maxWidth: "220px", width: "auto" }} />
            ) : (
              <Text style={{ ...muted, fontWeight: 600, margin: "0 0 20px" }}>{brand.businessName}</Text>
            )}
```

- [ ] **Step 4: Pass the trusted logo from notifications.** In `src/server/notifications.ts`:
  - add `import { isStoredAssetUrl } from "@/lib/brand-assets";`
  - in `baseProps`, add to the `brand` object `logoUrl: isStoredAssetUrl(settings.logoUrl) ? settings.logoUrl : null,`

- [ ] **Step 5: Run the tests and typecheck.**
  Run: `npx vitest run src/server/__tests__/db/checkout-and-email.test.ts && npm run typecheck`
  Expected: PASS. If typecheck finds other `EmailBrand` literals (e.g. email preview files), add `logoUrl: null` to each.

- [ ] **Step 6: Commit.**

```bash
git add src/server/email/templates/layout.tsx src/server/notifications.ts src/server/__tests__/db/checkout-and-email.test.ts
git commit -m "feat: customer emails show the owner's logo"
```

---

### Task 8: Docs and full verification

**Files:**
- Modify: `README.md` ("Launching for a new client", step 1)
- Modify: `CLAUDE.md` ("Core models", the `Settings` bullet)

**Interfaces:** none.

- [ ] **Step 1: README.** Replace the sentences added last time in step 1 of "Launching for a new client" ("Favicons and home-screen icons default to the Reserva mark: … 'Powered by' line.") with:

```markdown
The site carries the business's own brand: the owner uploads a logo and a 512 × 512 PNG app icon under **Settings** (needs a Vercel Blob store), which replace the default Reserva icons in the headers, emails, browser tab, phone home screen and link previews. Reserva appears only as a small "Powered by Reserva" line, which the owner can switch off in Settings.
```

- [ ] **Step 2: CLAUDE.md.** Change the `Settings` bullet under "Core models" to:

```markdown
- `Settings` (singleton, CHECK id = 1) incl. holdMinutes, weekendDays, leadTimeMin, maxAdvanceDays, content (landing JSON), logoUrl + iconUrl (owner's brand on Vercel Blob; only Blob URLs are ever used), showPoweredBy
```

- [ ] **Step 3: Run all the gates.**
  Run: `npm run typecheck && npm run lint && npm test && npm run build`
  Expected: all pass. Coverage stays at 100% for `src/lib`. The build lists `/manifest.webmanifest` and `/opengraph-image` as `ƒ` (dynamic).

- [ ] **Step 4: Check the production build in the browser.**
  1. Start the production server: `preview_start` name `reserva-prod`, on port 3100.
  2. At 1280px and 375px, in light and dark mode, open `/`, `/book`, `/lookup`, `/sign-in` and (signed in as owner) `/admin` and `/admin/settings`. Confirm:
     - no horizontal scroll: `document.documentElement.scrollWidth <= window.innerWidth`;
     - no console errors, in particular no CSP violations;
     - the header shows the business mark per the Decisions;
     - "Powered by Reserva" follows the Settings switch.
  3. Run axe on `/`, `/book` and `/sign-in` in both themes, the same way as the rebrand check: temporarily copy `node_modules/axe-core/axe.min.js` to `public/`, eval it in the page, then delete it. Expected: zero violations.
  4. Stop the production server.

- [ ] **Step 5: Commit.**

```bash
git add README.md CLAUDE.md
git commit -m "docs: owner's brand everywhere"
```

---

## Out of scope (say so if asked)

- A separate dark-mode logo upload. The white chip covers it.
- Deleting the previous Blob file when a logo or icon is replaced (same as today's logo behavior).
- Generating the 16/32/48/180 icon sizes from the owner's upload. Browsers scale the 512 PNG.
- Custom fonts per business (fonts stay build-time in `reserva.config.ts`).
