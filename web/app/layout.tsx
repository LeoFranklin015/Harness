import type { Metadata } from "next";
import { JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

/**
 * Two faces, both chosen rather than inherited.
 *
 * Geist is the pair `create-next-app` ships with, which makes it the most
 * recognisable "nobody picked this" signal a modern page can carry. Schibsted
 * Grotesk is a real grotesque — tight, confident, slightly narrow, and it holds
 * up at display size where a neutral face goes limp. JetBrains Mono is drawn for
 * code, so it is doing its actual job in the panels rather than standing in for
 * a terminal.
 */
const display = Schibsted_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono-code",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Harness — scope an agent to a container",
  description:
    "One tap on a Ledger gives an agent its own machine, its own ENS name and a spending ceiling. Revoke the name and the spending, the access and the address stop together.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
