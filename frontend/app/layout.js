import "./globals.css";

// Next.js uses this metadata for the browser title and basic document metadata.
export const metadata = {
  title: "Travel Ideate",
  description: "Kashmir travel proposal builder"
};

// The root layout is intentionally minimal; the proposal builder owns the full
// application shell in app/page.js.
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
