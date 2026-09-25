import { Inngest } from "inngest";

// Background jobs run on Inngest (Vercel integration). Without INNGEST_* keys nothing breaks:
// holds still expire lazily on the next booking attempt; only the backstop sweep and the
// reminder emails wait until Inngest is connected.
export const inngest = new Inngest({ id: "reserva" });
