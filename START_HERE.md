# Apex Tutoring website

Live at **https://apex-tutoring.github.io**. It's hosted with GitHub Pages from the `apex-tutoring/apex-tutoring.github.io` repo.

## Files
- `index.html`: the whole site (layout, styles, and scripts)
- `logo.svg`: the Apex logo, also used as the browser-tab icon and tutor avatar

## Updating the site
1. Edit `index.html` and open it in a browser to preview.
2. Commit and push to `main`. The live site updates within a minute or two.

## Pages
- `index.html` (home), `quiz.html` (placement quiz), `portal.html` + `portal.js` (student portal), `privacy.html`
- Portal backend: Firebase project `apex-tutoring-1` (owned by team.apextutoring@gmail.com). Rules in `firestore.rules`.

## Worksheets
- Free printable packs live in `worksheets/` (HTML + PDF). To make a fresh set with new numbers:
  `python3 tools/make_worksheets.py 2027` (any number), then re-print the PDFs with Chrome ("Save as PDF") or ask Claude.

## Backlog
- **Parent email notifications** when a session update is posted (use EmailJS, free tier, sent from the teacher dashboard)
- Branded password email: Firebase blocks template edits on new projects; retry later in Authentication → Templates
- Prices for each level and for shop items; in-person locations
- Payment buttons (Venmo/Zelle), testimonials, premium worksheet bundles
- Optional custom domain
