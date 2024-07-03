import { build } from "@nhttp/tailwind";
import tailwindFrom from "@tailwindcss/forms";

const isDev = Deno.args.includes("--dev");
const isBuild = Deno.args.includes("--build");

if (isDev || isBuild) {
  await build({
    input: "./input.css",
    output: "./public/css/style.css",
    content: ["./main.tsx"],
    minify: isBuild,
    plugins: [tailwindFrom()],
  });
}
