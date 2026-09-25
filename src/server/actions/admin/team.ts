"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emailSchema, personNameSchema } from "@/lib/validation";
import { createTeamMember, setTeamMemberDisabled, setTeamMemberRole } from "../../data/team";
import { type FormState, failure, formObject, guard, invalid, isSession } from "./form";

// ADMIN only ("team" area).

const newMember = z.object({
  name: personNameSchema,
  email: emailSchema,
  role: z.enum(["ADMIN", "STAFF"]),
  password: z.string().min(12, "Use at least 12 characters.").max(128),
});

export async function createMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await guard("team");
  if (!isSession(session)) return session;
  const parsed = newMember.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    await createTeamMember(parsed.data);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/team");
  return { ok: true, message: `Account created. Give ${parsed.data.name} their email and password to sign in.` };
}

export async function setDisabledAction(userId: string, disabled: boolean): Promise<FormState> {
  const session = await guard("team");
  if (!isSession(session)) return session;
  try {
    await setTeamMemberDisabled(z.string().min(1).parse(userId), disabled, session.userId);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/team");
  return { ok: true };
}

export async function setRoleAction(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await guard("team");
  if (!isSession(session)) return session;
  const parsed = z.object({ role: z.enum(["ADMIN", "STAFF"]) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    await setTeamMemberRole(userId, parsed.data.role, session.userId);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/team");
  return { ok: true, message: "Role updated." };
}
