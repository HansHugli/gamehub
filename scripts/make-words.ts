// Makes src/ladder/words.ts from the SCOWL word lists (the JSON files of the npm package
// wordlist-english 1.2.1, which are read as data and not run).
//
//   node scripts/make-words.ts <folder holding english-words-10.json and the rest>
//
// Two sets of four-letter words come out. COMMON (SCOWL sizes 10 to 35) is what puzzles are
// made from, so a ladder can always be climbed with everyday words. ACCEPTED adds the rarer
// words up to size 70 in every spelling, so a real word a player thinks of is not refused.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const from = process.argv[2];
if (!from) throw new Error("Give the folder that holds the word list JSON files.");

const LENGTH = 4;
const DIALECTS = ["english", "american", "british", "canadian", "australian"];
/** Words that are never offered as a start, an end or a hint. */
const NOT_OFFERED = new Set("anal anus arse cock coon crap cunt damn dick dyke fags fuck gook hell homo jerk jism jizz kike kill muff nazi orgy paki piss poop porn pube rape scum sexy shag shit slag slut smut spic suck tits turd twat wank wops".split(" "));
/** Slurs: not accepted at all. */
const REFUSED = new Set("coon cunt dyke fags gook kike paki spic wops".split(" "));

function words(sizes: number[], dialects: string[]): Set<string> {
  const out = new Set<string>();
  for (const dialect of dialects) {
    for (const size of sizes) {
      const list = JSON.parse(readFileSync(path.join(from, `${dialect}-words-${size}.json`), "utf8")) as string[];
      for (const w of list) if (w.length === LENGTH && /^[a-z]+$/.test(w) && !REFUSED.has(w)) out.add(w);
    }
  }
  return out;
}

const common = [...words([10, 20, 35], ["english", "american"])].filter((w) => !NOT_OFFERED.has(w)).sort();
const all = words([10, 20, 35, 40, 50, 55, 60, 70], DIALECTS);
const rarer = [...all].filter((w) => !common.includes(w)).sort();

const body = `// Made by scripts/make-words.ts from the SCOWL word lists. Do not edit by hand.
// Four-letter words, run together: every ${LENGTH} letters is one word.

/** Everyday words: puzzles and hints use only these. */
export const COMMON = "${common.join("")}";

/** Rarer words that are also accepted as a step. */
export const RARER = "${rarer.join("")}";
`;
writeFileSync(new URL("../src/ladder/words.ts", import.meta.url), body);
console.log(`common ${common.length}, rarer ${rarer.length}`);
