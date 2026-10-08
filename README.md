# NTRCA MCQ Practice

A static practice-exam site. It needs no server and no build step. Open `index.html` directly, or host the folder on GitHub Pages.

## Files

```
index.html      page layout
style.css       look (light and dark mode)
app.js          all the logic
data/index.js   list of question sets shown on the page
data/*.js       one file per exam part, e.g. school-18.js
```

## Adding a question set

1. Create `data/<name>.js`, for example `data/school2-17.js`:

   ```js
   window.NTRCA_SETS = window.NTRCA_SETS || {};
   window.NTRCA_SETS["school2-17"] = {
     "set": "school2-17",
     "questions": [
       {
         "id": "school2-17-001",
         "subject": "gk",
         "question": "বাংলাদেশের জাতীয় ফুল কোনটি?",
         "options": ["শাপলা", "গোলাপ", "বেলি", "জবা"],
         "answer": 0,
         "explanation": "optional, shown in the review"
       }
     ]
   };
   ```

   - `subject` is one of `gk`, `math`, `english`, `bengali`.
   - `answer` is the position of the correct option, **counting from 0** (0 = first option, 3 = fourth). `"A"`–`"D"` and `"ক"`–`"ঘ"` also work.
   - The name inside `NTRCA_SETS["..."]` must match the file name exactly.

2. Add the name to `data/index.js`:

   ```js
   window.NTRCA_INDEX = ["school-18", "college-18", "school2-18", "school2-17"];
   ```

3. Open the site and go to the **Files** tab. Every set should show 25 questions per subject. That tab also lists questions the site had to skip (wrong subject, answer out of range) and any file with a typo. A red dot on the tab means something needs fixing.

Sets are grouped by the word before the first `-` (School, College, School-2). Use `school2-` for School-2 (স্কুল পর্যায়-২) files. A name like `school-18` is shown as "18th NTRCA" under School.

## Putting it on GitHub Pages

Push this folder to a GitHub repository, then go to **Settings → Pages → Deploy from a branch**, choose `main` and `/ (root)`. The empty `.nojekyll` file tells GitHub to serve the files as they are.

## Your data

Scores, the record of which questions you got wrong, and any unfinished exam are stored in the browser that you used. Use **Export backup** and **Import backup** to move them between your phone and laptop.
