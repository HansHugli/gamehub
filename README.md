# Game Hub

Small browser games for a quick break. They are plain web pages, built to play well in Safari on a phone: nothing on a page can be selected, and a swipe is never taken by the browser.

Play: https://hanshugli.github.io/gamehub/

## Games

- **Twofold**: slide numbered tiles on a 4 by 4 board. Two equal tiles that meet join into one of twice the value. The goal is the 4096 tile, and play goes on after it. The game in progress and the best score are kept in the browser. New game sits in the top bar, away from the board, and asks before it ends a game under way.
- **Word Ladder**: turn one four-letter word into another by changing one letter at a time, where every step is a word. There is no clock. Tap a letter of the word, then the letter to change it to. "Back a step" undoes, "Give me a step" adds the next word of a shortest way on. Forty hand-picked pairs come first in a mixed order, then puzzles are made up without end.
- **Balance**: a logic grid of circles and squares, 6 by 6, 8 by 8 or 10 by 10. Never three alike in a line, as many circles as squares in every row and column, and no two rows or columns the same. Every puzzle is made on the spot, has one answer and can be finished by reasoning alone. A broken rule is marked as you go, and "Show me a step" fills one cell and says why.
- **Decant**: bottles of mixed colours and two empty ones. Tap a bottle, then the bottle to pour into; colour goes onto the same colour or into an empty bottle. Done when every bottle holds one colour. Four, seven or ten colours, every puzzle checked to be possible, with undo and "Show me a pour".

## Working on it

```
npm install
npm run dev        # local server
npm run check      # typecheck and tests
npm run build      # the site, in dist/
```

Each game has its own folder with an `index.html` (for example `twofold/`) and its code under `src/<game>/`, with the rules in a file of their own that has tests and no screen code. To add a game, add its page to `vite.config.ts` and a card to `index.html`.

## Publishing

Every push to `main` builds the site and publishes it to GitHub Pages (`.github/workflows/pages.yml`). `npm run ship` checks, cuts a release with a changelog entry and a tag, builds, and pushes.

## Word list

Word Ladder's words come from SCOWL (Spell Checker Oriented Word Lists) by Kevin Atkinson, by way of the npm package `wordlist-english`. The copyright and permission notices are in `src/ladder/WORDS-COPYRIGHT.txt`. `scripts/make-words.ts` makes `src/ladder/words.ts` from those lists: everyday words (sizes 10 to 35) for puzzles and given steps, and rarer ones (up to size 70) that are also accepted as a step.
