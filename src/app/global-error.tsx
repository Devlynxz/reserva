"use client";

// Last resort when the root layout itself fails (so no styles or fonts are guaranteed).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "3rem 1rem", color: "#15202b", background: "#f4f6f9" }}>
        <main style={{ maxWidth: 480, margin: "0 auto" }}>
          <h1 style={{ fontSize: 24 }}>The site is having trouble</h1>
          <p style={{ color: "#566271", lineHeight: 1.6 }}>Nothing was charged. Please try again in a few minutes.</p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, padding: "12px 18px", borderRadius: 10, border: "1px solid #b9c2ce", background: "#fff", fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
