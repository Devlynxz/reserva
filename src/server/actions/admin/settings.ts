"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { settingsInputSchema } from "@/lib/validation";
import { UploadError, uploadIcon, uploadLogo } from "../../blob";
import { setIconUrl, setLogoUrl, updateSettings } from "../../data/settings";
import { DEMO_LOCKED, isDemo } from "../../demo";
import { env } from "../../env";
import { type FormState, formObject, guard, invalid, isSession } from "./form";

// ADMIN only ("settings" area).

const extra = z.object({
  mapUrl: z.url("Enter a full link starting with https://").optional(),
  headline: z.string().trim().max(160).optional(),
  subhead: z.string().trim().max(300).optional(),
  amenities: z.string().max(2000).optional(),
  faq: z.string().max(8000).optional(),
});

/** "Question\nAnswer…" blocks separated by a blank line. */
function parseFaq(text: string | undefined) {
  if (!text) return [];
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim().split(/\r?\n/))
    .filter((lines) => lines.length >= 2 && lines[0]!.trim())
    .map(([question, ...answer]) => ({ question: question!.trim(), answer: answer.join(" ").trim() }));
}

export async function saveSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await guard("settings");
  if (!isSession(session)) return session;
  if (isDemo()) return { error: DEMO_LOCKED };
  const raw = formObject(formData, { multi: ["weekendDays"], booleans: ["showPoweredBy"] });
  const parsed = settingsInputSchema.safeParse(raw);
  const more = extra.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  if (!more.success) return invalid(more.error);

  // PayMongo only charges in PHP: catch the mismatch here rather than at a customer's checkout.
  if (env().PAYMENT_PROVIDER === "paymongo" && parsed.data.currency !== "PHP") {
    const message = "Online payments use PayMongo, which only charges in PHP.";
    return { error: message, fieldErrors: { currency: message } };
  }

  const { headline, subhead, amenities, faq, mapUrl } = more.data;
  await updateSettings({
    ...parsed.data,
    mapUrl,
    content: {
      ...(headline ? { hero: { headline, subhead: subhead ?? "" } } : {}),
      amenities: (amenities ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
      faq: parseFaq(faq),
    },
  });
  // Name, colors and copy show up everywhere.
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}

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
