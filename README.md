# NTRCA MCQ Practice

A static practice-exam site. It needs no server and no build step. Open `index.html` directly, or host the folder on GitHub Pages.

## Files

```
index.html      page layout
style.css       look (light and dark mode)
app.js          all the logic
subjects-demo.js  the Subjects tab (exams on chosen topics)
rapid.js        rapid fire (a few seconds a question, with sounds)
data/index.js   list of question sets shown on the page
data/*.js       one file per exam part, e.g. school-18.js
data/topics-math.js  Math topics and worked solutions, collected from the পড়াশোনা notes
sw.js           offline support (keeps a copy of the site on the device)
manifest.webmanifest, icons/   lets phones install it like an app
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

Name each file `<level>-<exam number>.js`, where the level is `school`, `school2` (স্কুল পর্যায়-২) or `college`, e.g. `school2-15.js`. The set picker shows them as a grid: one row per exam (newest first), one column per level. Click a row label (e.g. "15th") to pick that exam's three papers, or "All" under a column to pick a whole level. Files with other names still work; they're listed under the grid.

BCS preliminary papers are named `bcs-<exam number>.js`, e.g. `bcs-50.js`. They hold only the subjects that help NTRCA preparation: Bengali, English, Math, and Bangladesh affairs, international affairs, science and ICT counted as `gk`. They're shown in their own BCS row under the grid, and the Files tab doesn't expect 25 per subject for them.

## Subjects tab (topic exams)

The **Subjects** tab makes an exam from the topics you tick in one subject. It shows how many questions each topic has and how you did on them.

For Math, the topics come from `data/topics-math.js`, collected from the পড়াশোনা site's math notes (13 Nov 2026). Each note is a topic, and each part of its "বিগত পরীক্ষার প্রশ্ন" section is a sub-topic that lists question ids from the data files. The file also holds each note's worked solution. The review shows it under the question in every exam, not only topic exams. The লগারিদম and গড় notes have no MCQs, so those topics are empty, and questions that no note solves aren't in any topic.

GK, English and Bengali still show made-up examples there.

## Rapid fire

Choose **Rapid fire** under **Exam type** in Exam settings. Each question gets a few seconds (**Seconds each**, 5 to start with); every second ticks and the last one beeps. When the time runs out, the correct answer is marked with its own sound and the next question comes. A tapped answer sounds right or wrong and shows the correct one. There is no minus mark and no going back; **Pause** (or Space) stops the clock and hides the question. Math starts unticked, since most Math questions need working out; tick it to include it.

It ends on the usual result screen. A question that ran out counts as Skipped and goes into **My mistakes** like any other. Progress lists rapid-fire rounds with the other exams but leaves them out of "By subject", so quick guesses don't pull the accuracy down.

The sounds are made by the browser, so there are no sound files. To change one, edit `SOUND` in `rapid.js`; each sound is one or two short tones (pitch, length, loudness).

## Putting it on GitHub Pages

Push this folder to a GitHub repository, then go to **Settings → Pages → Deploy from a branch**, choose `main` and `/ (root)`. The empty `.nojekyll` file tells GitHub to serve the files as they are.

## Installing and offline use

On Android, open the site in Chrome and tap **Install** on the card at the top, or use **⋮ → Add to Home screen**. On iPhone, open it in Safari and tap **Share → Add to Home Screen**. It then opens full-screen from its own icon.

After one visit with internet, every question set in `data/index.js` is saved on the device, so practice works with no connection. An "Offline" badge appears next to the title while there's no internet.

When you push new or changed files, a device that's online gets them in the background and shows **"New questions or updates are ready. Refresh"** (not during an exam). New set files work as long as they're listed in `data/index.js`. You don't need to change `sw.js` for normal updates; change `CACHE` in it only if you want every device to throw away its saved copy and download everything again.

Offline support needs `https://` (GitHub Pages) or `localhost`; opening `index.html` by double-click works as before, just without it.

## Your data

Scores, the record of which questions you got wrong, and any unfinished exam are stored in the browser that you used. Use **Export backup** and **Import backup** to move them between your phone and laptop.

## Link preview

When the link is shared, apps read the `og:` and `twitter:` tags in `index.html` and show `og-image.png` (1200×630). The URLs in those tags are absolute (`https://roy-chayan.github.io/exams/...`); update them if the repository name changes. Apps cache previews. After changing it, refresh Facebook/Messenger with the [Sharing Debugger](https://developers.facebook.com/tools/debug/) ("Scrape Again"); for WhatsApp, share the link with something new on the end, e.g. `https://roy-chayan.github.io/exams/?v=2`.
