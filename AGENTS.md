# AGENTS Notes

## Repository
- Hosted at https://github.com/SparkPreneurs/sparkpreneurs.github.io
- Static site; open `index.html` locally or host via any static server.

## Project Layout
- `index.html` - landing page markup and overall site structure. [View on GitHub](https://github.com/SparkPreneurs/sparkpreneurs.github.io/blob/main/index.html)
- `styles.css` - global styling, gradients, responsive rules. [View on GitHub](https://github.com/SparkPreneurs/sparkpreneurs.github.io/blob/main/styles.css)
- `script.js` - navigation hamburger toggles and other interactions. [View on GitHub](https://github.com/SparkPreneurs/sparkpreneurs.github.io/blob/main/script.js)
- `assets/Logo.png` - SparkPreneurs logo displayed in the navigation bar.
- `assets/perspective.png` - hero image (replaces the previous remote pizza photo).

## Quick Facts
- No build tooling; edit files directly and push commits to publish via GitHub Pages.
- Always run ``git pull`` before starting any new commit to keep your copy in sync with GitHub.
- Hero section image path updated to `assets/perspective.png` (`index.html:41`).
- Before committing, run `git status` to ensure every changed/added file (e.g., assets) is staged.
- If you add or use a new asset, rename the file first to remove spaces and make it URL-friendly (example: `spring-flyer.png`) before linking it in HTML or CSS.
- Fonts load from Google Fonts (Fredoka and Comic Neue); requires network access when previewing.
- When a user asks for a "new page", build a new path (e.g. `/gallery`) via a standalone HTML file (e.g. `gallery/index.html`) and keep fonts/styles consistent with `index.html`.
- For straightforward site updates like adding sections, images, or text, complete the change and commit it without stopping to ask the user for confirmation unless there is real ambiguity or risk.

## Communication Style
- Users of this project are not developers, so keep requests simple and provide step-by-step guidance when asking them to do anything.
- When users ask to "upload to GitHub" or similar, you are responsible for the integrity of everything committed and pushed.
- Do not use developer jargon in user-facing updates when a plain-language version will do. Say `the image still needs to be included in the publish` instead of talking about `untracked files`, staging, or similar git terms.
- Prefer outcome-focused updates: explain what changed on the page, what will happen next, and only mention technical process details if they materially affect the result.

## Live Site Debug Routine
- If the user says something like `what I see on website is not what I see on my computer`, do not guess. Run this routine.
- First, fetch what is live on `https://sparkpreneurs.ca/` and compare it with the local files that should produce that page.
- Check the live HTML, linked CSS, linked JavaScript, and any directly relevant image or asset paths used by the part of the page the user is talking about.
- Confirm whether the latest commits were pushed to GitHub and whether the local repo is ahead, behind, or already synced.
- Compare the live page content against local `index.html`, `styles.css`, `script.js`, and any affected asset filenames to catch old deploys, cache issues, wrong file paths, or missing renamed assets.
- If the mismatch is likely caching, explain that plainly and include a simple next step such as trying a hard refresh or opening the live site in a private window.
- If the mismatch is a deployment problem, fix the source issue, commit, and push.
- In the user-facing explanation, summarize the difference between `live website` and `local copy` in plain language instead of using git or deployment jargon unless absolutely necessary.

## Next Actions
1. Verify `assets/perspective.png` renders correctly after deployment.
2. Review hero floating text artifacts (`dYZ"`, etc.) for cleanup if unintended.
3. Consider optimizing images (compress or resize) before publishing.

