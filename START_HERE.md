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

## Curriculum & worksheets
- `tools/make_curriculum.py` defines every course → unit → skills (Grades 1–7 and Pre-Algebra follow Khan Academy's
  course units; Competition Math is Apex's own), generates two printable worksheets per unit (Practice A/B with answer
  keys) into `worksheets/`, and writes `curriculum.js` for the portal. Re-run it after any change:
  `python3 tools/make_curriculum.py`
- In the portal, Veer sees the **Curriculum** card (every unit, skills, worksheets, Khan Academy link) and can assign any
  worksheet from it or from the "Assign a worksheet" picker when logging a session.
- Worksheets are no longer listed on the public homepage; families get them through assigned homework.
- `tools/make_review_packs.py` makes the 6 older mixed-review packs (still assignable).

## Backlog
- **Parent email notifications** when a session update is posted (use EmailJS, free tier, sent from the teacher dashboard)
- Branded password email: Firebase blocks template edits on new projects; retry later in Authentication → Templates
- Prices for each level and for shop items; in-person locations
- Payment buttons (Venmo/Zelle), testimonials, premium worksheet bundles
- Optional custom domain
