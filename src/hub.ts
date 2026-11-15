import { VERSION, lockPage } from "./shell.ts";

lockPage();
const version = document.getElementById("version");
if (version) version.textContent = `Game Hub ${VERSION}`;
