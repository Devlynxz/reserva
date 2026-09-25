"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { settingsInputSchema } from "@/lib/validation";
import { UploadError, uploadLogo } from "../../blob";
import { setLogoUrl, updateSettings } from "../../data/settings";
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
  const raw = formObject(formData, { multi: ["weekendDays"] });
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

export async function uploadLogoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await guard("settings");
  if (!isSession(session)) return session;
  if (isDemo()) return { error: DEMO_LOCKED };
  const file = formData.get("logo");
  if (!(file instanceof File)) return { error: "Choose an image file.", fieldErrors: { logo: "Choose an image file." } };
  try {
    await setLogoUrl(await uploadLogo(file));
  } catch (error) {
    if (error instanceof UploadError) return { error: error.message, fieldErrors: { logo: error.message } };
    console.error("[logo upload]", error);
    return { error: "The upload failed. Please try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Logo updated." };
}

export async function removeLogoAction(): Promise<FormState> {
  const session = await guard("settings");
  if (!isSession(session)) return session;
  if (isDemo()) return { error: DEMO_LOCKED };
  await setLogoUrl(null);
  revalidatePath("/", "layout");
  return { ok: true };
}
