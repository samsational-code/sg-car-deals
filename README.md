# SG Car Deals

A personal dashboard that rates SGCarMart used-car listings against the COE price you type in.

- **The app** is a web page hosted free on GitHub Pages. It installs on a phone like an app and works offline.
- **Getting listings** takes one click: a bookmark you press while looking at your SGCarMart search in your own browser. It reads the result pages and sends them to the dashboard.
- **Sharing** takes one more click (or none, if you tick "publish automatically"): the listings are saved into this repository, and everyone in the family who opens the dashboard sees them.
- **You** type the latest Cat A and Cat B COE prices. Every car is re-rated at once.

Built and tested on 14-15 Nov 2026. There is nothing to install on your computer.

**Why a bookmark and not a fully automatic scan.** The first automatic scan from GitHub's servers, on 15 Nov 2026, was refused by SGCarMart with "HTTP 403" on its very first request. The site blocks automated requests from servers. Your own browser is not blocked, so the listings are now read there. See "Getting listings" below.

## Set up (about 15 minutes, once)

You need a free GitHub account. Do these steps on a computer, not a phone.

**1. Create the repository**

1. Sign in at github.com. Click **+** (top right) > **New repository**.
2. Repository name: `sg-car-deals`. Choose **Public**. Leave every box unticked. Click **Create repository**.

It must be public: GitHub's free plan only hosts web pages from public repositories. That means the saved listings are visible to anyone who finds the address.

**2. Upload the files**

1. Unzip `sg-car-deals.zip` on your computer and open the folder so you can see `index.html`, `README.md`, and the folders `.github`, `data`, `lib` and so on.
2. On the new repository's page, click the link **uploading an existing file**.
3. Select everything inside the folder (Ctrl+A) and drag it onto the browser page. Wait until the list of files stops growing.
4. Click **Commit changes**.
5. Check the upload: the repository should now show a folder named `.github`. If it does not (some browsers skip folders that start with a dot):
   - click **Add file** > **Create new file**;
   - in the name box type `.github/workflows/scan.yml`;
   - open `scan.yml` from the unzipped `.github/workflows` folder in Notepad, copy everything, paste it into the big box;
   - click **Commit changes**.

**3. Turn on the web page**

1. In the repository click **Settings** > **Pages** (left menu).
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**, **Branch** to `main` and folder `/ (root)`. Click **Save**.
3. Wait two minutes, then open `https://YOUR-USERNAME.github.io/sg-car-deals/`. You should see the dashboard with starter data (six cars and a note saying so).

**4. Add the bookmark**

1. Open the dashboard on your computer and click **Get new listings**.
2. Show your bookmarks bar (Ctrl+Shift+B) and drag the green **Scan SGCarMart** button onto it.

**5. Create a token so you can share with your family**

A token is a password that lets the dashboard save listings into this one repository.

1. On github.com click your picture (top right) > **Settings** > **Developer settings** (bottom of the left menu) > **Personal access tokens** > **Fine-grained tokens** > **Generate new token**.
2. Name: `sg-car-deals`. Expiration: pick the longest offered.
3. **Repository access**: choose **Only select repositories** and pick `sg-car-deals`.
4. **Permissions** > **Repository permissions** > **Contents**: choose **Read and write**. Leave everything else alone.
5. Click **Generate token** and copy it (it starts with `github_pat_`). GitHub shows it only once.
6. In the dashboard, under **Get new listings** > **Share with your family**, paste the token and tick **Publish automatically after each scan**.

The token is kept in that browser only. It is never saved into the repository. Do not paste it anywhere else. Only you need one; your family just opens the dashboard.

**6. Do the first scan**

1. On SGCarMart, build your search (see "Choosing a search").
2. Press the **Scan SGCarMart** bookmark. A green box appears in the corner and counts the cars as it reads up to 10 result pages.
3. Press **Send to my dashboard**. The dashboard opens with the cars rated and, if you ticked the box, publishes them.

**7. Put it on the family's phones**

Send them the dashboard address. iPhone: Share > **Add to Home Screen**. Android: menu > **Install app** or **Add to Home screen**. They press **Refresh** to load the latest listings you published.

**8. Turn off the old automatic scan**

In the repository: **Actions** > **Scan SGCarMart** > the **...** button (top right) > **Disable workflow**. Otherwise it tries every morning, is refused, and GitHub emails you about it.

## Using it

- **To update the listings**: open your SGCarMart search, press the bookmark, press **Send to my dashboard**. Once a day is plenty.
- **After each COE bidding result**, type the new Cat A and Cat B prices into the two boxes. They are remembered on each device separately.
- **Refresh** reloads the latest published listings.
- Tap a rating chip to filter. Tap a car's name to open it on SGCarMart.
- **Your assumptions** holds the investment return (3% or 8%), yearly distance, fuel and electricity prices, ERP and parking.
- Listings older than 3 days are hidden, and dropped from the repository after 14.

## Choosing a search

The bookmark reads whatever search you have open, page by page, up to 10 pages. A focused search is better than a wide one. Based on the research:

| Filter | Set it to | Why |
| --- | --- | --- |
| Vehicle type | All Passenger Cars | Leaves out vans and trucks, which are not rated |
| Registration year | 2018 to 2019 | 1 to 3 years of COE left, where depreciation is lowest and little capital is tied up |
| Price | up to S$50,000 | Covers every car on the shortlist at that age |
| Depreciation | up to S$16,000 a year | Removes the clearly expensive ones |
| Sort | Depreciation (Lowest) | If the search has more than 10 pages, the best ones are read first |
| Results per page | 100 (bottom of the page) | Fewer pages to read |

You can scan several searches one after another, for example a second one for electric cars registered 2022 onwards. Each scan adds to the dashboard. After the first scan the dashboard keeps a link to your last search.

Set the vehicle type on the site. The first results page tells the dashboard which listings are vans; later pages do not, and there it recognises common van and truck names only.

## What the bookmark does and does not do

- It runs only when you press it, in your own browser, on the SGCarMart search you have open.
- It reads the result cards on the page, then presses the site's own **Next** button, waits for the next page, and reads that. It pauses at least 3 seconds between pages and stops after 10 pages or 800 cars.
- It never opens individual car pages, never logs in, and sends nothing anywhere until you press **Send to my dashboard**. Then it hands the listings to your dashboard only.
- It does not pretend to be anything it is not: the requests are your browser's ordinary ones.

**Permission.** You told me on 13 Nov 2026 that SGCarMart's head of sales said scraping is welcome. That is a spoken assurance, and the site's firewall refused the server-side scan regardless. I could not read SGCarMart's terms of use from where I work. A short written confirmation is worth having. If SGCarMart ever allows the server-side scan, see "The automatic scan" at the end.

## If something goes wrong

**Nothing happens when I press the bookmark.** Some sites stop bookmarks from running code. Use the fallback: on your search press Ctrl+S, save the page, and in the dashboard choose the file under **Or add a saved page**. One file per results page. Tell me, and I can look for another route.

**The green box says "The site did not show the next page".** The bookmark could not work the site's Next button. What it read so far is kept. Click the next page yourself and press the bookmark again; each press adds that page.

**"GitHub rejected the token" or "cannot write to this repository".** Make a new token following step 5 exactly: the repository must be selected and Contents set to Read and write.

**The family does not see new listings.** GitHub takes a minute or two to publish. Then press **Refresh**. If the page itself looks old after an update, reload it twice.

**Ratings look wrong after a site redesign.** The reader is `lib/parse.js`. Send me a freshly saved results page and I can update it.

## How cars are rated

1. **Depreciation** per year is the figure SGCarMart shows. From it the app works out what comes back as PARF when the COE ends: price - depreciation x years left.
2. **Fair depreciation** is what that model and registration year normally depreciates at (`data/price_guide.json`, read 9-13 Nov 2026 when COE was S$139,001 Cat A and S$132,334 Cat B), scaled to the COE price you enter. When five or more similar cars are in the current listings, their median counts for half.
3. **Fair value** = PARF value + fair depreciation x years left. **Pay at most** uses depreciation 5% under the norm.
4. **Cost per year** = depreciation + servicing + repair reserve + insurance + road tax (LTA formula) + fuel or electricity + ERP + parking + the return forgone on the money tied up.
5. **Score (0-100)**: price against fair value 30, depreciation 15, reliability 15, servicing and repairs 10, COE left 10, parts 5, PARF 5, mileage 5, battery cover 5 (electric only).
6. **Ratings**: Exceptional (score 80+, 8% or more under fair value, known model, medium or high confidence), Attractive (score 70+, not above fair value), Fair, Overpriced (8% or more above fair value), Avoid (model flagged for reliability, or an electric car out of battery warranty).

**COE parity** (COE price / 10 a year) is shown on each card as a yardstick. It is not the pass mark: a Toyota Vios normally depreciates at about 1.14 times parity and a Mitsubishi Attrage at about 0.87 times.

## What is estimated or assumed

- Reliability, parts, servicing, repair-reserve and insurance figures in `data/models.json` are judgement and estimates, not measurements. Edit them freely.
- **COE pass-through** (default 100%): a 10% move in COE moves each model's benchmark by 10%. This is an assumption, adjustable under "Your assumptions". It has no effect while the COE boxes hold the 4 Nov 2026 results.
- **COE category** is estimated from engine size, because listings do not show power. Turbo cars near 1,600cc can be misplaced unless they are in `data/models.json`.
- **PARF value** is implied from SGCarMart's depreciation figure, so it inherits their method.
- Models missing from `data/models.json` get generic running costs and a low-confidence rating. 42 models are in the table.
- Benchmarks date from November 2026. Refresh `data/price_guide.json` every few months, or rely on the live comparables as listings accumulate.
- Diesel special tax, and road tax bands under 600cc, over 3,000cc and under 30 kW, are not verified against LTA.

## What was tested, and what was not

Tested (34 automated checks, `node --test`, plus headless-browser runs):

- The page reader against a real SGCarMart results page saved on 14 Nov 2026: all 20 listings read, and the two reading methods agree on every price, depreciation, date, mileage and engine figure.
- The rating engine against the earlier Python model on 26 real listings: 442 comparisons, no differences.
- The bookmark, end to end: the real bookmark was run on that real saved page (served to a test browser as if from sgcarmart.com), with a stand-in for the site's Next button. It read 60 cars over 3 pages, waited between pages, handed them to the dashboard, and the dashboard published them to a stand-in for GitHub.
- The hand-over: listings arrive unchanged, and anything malformed or pointing away from sgcarmart.com is dropped.
- The dashboard: COE input, filters, search, sorting, saved-page import, offline use, phone layout, and that listing text cannot inject code.

Not tested:

- **The bookmark has not been pressed on the live site.** I cannot reach sgcarmart.com from where I work. Two things could differ there: whether the site lets a bookmark run, and whether its Next button responds to the bookmark's click. Both failures are reported on screen, and the saved-page route covers them.
- **Publishing has not been tried against the real GitHub**, only a stand-in that behaves the same way.
- Van recognition by name is a list of common models, not a complete one.

## Files

| File | What it is |
| --- | --- |
| `index.html`, `app.js`, `styles.css` | The dashboard |
| `lib/engine.js` | Valuation and rating rules |
| `lib/parse.js` | Reads an SGCarMart results page |
| `lib/capture.js`, `lib/bookmarklet.js` | The bookmark |
| `lib/transfer.js` | Checks listings handed over by the bookmark |
| `lib/store.js` | First-seen dates and price history |
| `data/listings.json`, `data/status.json` | The published listings |
| `data/models.json`, `data/price_guide.json` | Reference tables |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline use and phone install |
| `tests/` | Automated checks |
| `scripts/fetch.mjs`, `.github/workflows/scan.yml`, `searches.txt`, `scanner.config.json` | The automatic scan (currently refused by SGCarMart) |

## The automatic scan

`scripts/fetch.mjs` is a server-side scan that GitHub can run. It reads `robots.txt` first, waits 8 seconds between pages, makes at most 30 requests a run, names itself honestly (`sg-car-deals/1.0` plus your repository's address), and stops without retrying when refused. On 15 Nov 2026 SGCarMart answered its first request with HTTP 403, so it is switched to manual-only. If SGCarMart agrees to let it through, run it from **Actions** > **Scan SGCarMart** > **Run workflow**; the comment at the top of `scan.yml` shows how to make it daily again.

Listings and figures come from sgcarmart.com. This is a personal tool, not affiliated with SGCarMart, and not financial advice.
