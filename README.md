# Game Hub

Small browser games for a quick break. They are plain web pages, built to play well in Safari on a phone: nothing on a page can be selected, and a swipe is never taken by the browser.

Play: https://hanshugli.github.io/gamehub/

## Games

- **Twofold**: slide numbered tiles on a 4 by 4 board. Two equal tiles that meet join into one of twice the value. The goal is the 4096 tile, and play goes on after it. The game in progress and the best score are kept in the browser. New game sits in the top bar, away from the board, and asks before it ends a game under way.

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
