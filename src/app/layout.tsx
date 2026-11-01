import type { Metadata } from "next";
import "@jack.winter/pancake-ui/styles.css";
import "@jack.winter/pancake-ui/fonts.css";
import "./globals.css";
import "@/features/planner/planner.css";
export const metadata: Metadata = {
  title: "Fantasy Pancake",
  applicationName: "Fantasy Pancake",
  icons: { icon: { url: "/fantasy-pancake.svg", type: "image/svg+xml" } },
  description:
    "A considered shortlist. A stronger starting XI. A valid reason to roll.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
