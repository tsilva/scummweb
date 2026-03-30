import fs from "node:fs/promises";
import path from "node:path";

const homePath = path.join(process.cwd(), "public", "home-static.html");

export async function GET() {
  const html = await fs.readFile(homePath, "utf8");

  return new Response(html, {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
