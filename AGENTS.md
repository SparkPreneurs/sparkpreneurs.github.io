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
- Hero section image path updated to `assets/perspective.png` (`index.html:41`).
- Before committing, run `git status` to ensure every changed/added file (e.g., assets) is staged.
- Fonts load from Google Fonts (Fredoka and Comic Neue); requires network access when previewing.

## Next Actions
1. Verify `assets/perspective.png` renders correctly after deployment.
2. Review hero floating text artifacts (`dYZ"`, etc.) for cleanup if unintended.
3. Consider optimizing images (compress or resize) before publishing.
