# SG Car Deals

A personal dashboard that rates SGCarMart used-car listings against the COE price you type in.

- **The app** is a web page hosted free on GitHub Pages. It installs on a phone like an app and works offline.
- **Getting listings** takes one click: a small browser extension adds a **Scan for SG Car Deals** button to your SGCarMart search. It reads the result pages in your own browser and sends them to the dashboard.
- **Sharing** takes one more click (or none, if you tick "publish automatically"): the listings are saved into this repository, and everyone in the family who opens the dashboard sees them.
- **You** type the latest Cat A and Cat B COE prices. Every car is re-rated at once.

Built and tested on 14-15 Nov 2026. There is nothing to install on your computer.

**Why a button in your browser and not a fully automatic scan.** The first automatic scan from GitHub's servers, on 15 Nov 2026, was refused by SGCarMart with "HTTP 403" on its very first request. The site blocks automated requests from servers. Your own browser is not blocked, so the listings are now read there. See "Getting listings" below.

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

**4. Install the scanner (Chrome or Edge, on a computer)**

1. Open the dashboard, click **Get new listings**, then **Download the scanner**. Or use `sg-car-deals-scanner.zip` from this folder.
2. Right-click the downloaded file, choose **Extract All**, and extract it into your Documents folder. Leave it there: the browser reads it from that folder every time.
3. Type `chrome://extensions` in the address bar. Switch on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `sg-car-deals-scanner` folder (the one containing `manifest.json`).

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
2. Click the green **Scan for SG Car Deals** button at the bottom right of the page. A green box counts the cars as it reads the whole search, 100 at a time.
3. Press **Send to my dashboard**. The dashboard opens with the cars rated and, if you ticked the box, publishes them.

**7. Put it on the family's phones**

Send them the dashboard address. iPhone: Share > **Add to Home Screen**. Android: menu > **Install app** or **Add to Home screen**. They press **Refresh** to load the latest listings you published.

**8. Turn off the old automatic scan**

In the repository: **Actions** > **Scan SGCarMart** > the **...** button (top right) > **Disable workflow**. Otherwise it tries every morning, is refused, and GitHub emails you about it.

## Using it

- **To update the listings**: open your SGCarMart search, click **Scan for SG Car Deals**, then **Send to my dashboard**. Once a day is plenty.
- **After each COE bidding result**, type the new Cat A and Cat B prices into the two boxes. They are remembered on each device separately.
- **Refresh** reloads the latest published listings.
- Tap a rating chip to filter. Tap a car's name to open it on SGCarMart.
- **Your assumptions** holds the investment return (3% or 8%), yearly distance, fuel and electricity prices, ERP and parking.
- Listings older than 3 days are hidden, and dropped from the repository after 14.

## Choosing a search

The scanner reads whatever search you have open, all of it, up to 1,000 cars. You do not need to change the results per page or click through pages. The search used for the first live scan, on 17 Nov 2026, was:

`https://www.sgcarmart.com/used-cars/listing?pr2=50000&dp2=16000&fr=2018&cl2=2y&ord=DEP_ASC`

That is: up to S$50,000, depreciation up to S$16,000 a year, registered 2018 or later, COE left up to 2 years, lowest depreciation first. It returned 553 cars.

| Filter | Suggested | Why |
| --- | --- | --- |
| Price | up to S$50,000 | Covers every car on the research shortlist at that age |
| Depreciation | up to S$16,000 a year | Removes the clearly expensive ones |
| COE left, or registration year | 1 to 3 years left | Where depreciation is lowest and little capital is tied up |
| Sort | Depreciation (Lowest) | If the search has more than 1,000 cars, the best ones are read first |
| Vehicle type | All Passenger Cars (optional) | Vans and trucks are recognised and left unrated anyway |

You can scan several searches one after another, for example a second one for electric cars registered 2022 onwards. Each scan adds to the dashboard. After the first scan the dashboard keeps a link to your last search.

## What the scanner does and does not do

- It runs only when you click its button, in your own browser, on the SGCarMart search you have open.
- It asks the site for the same search you have open, 100 cars a page, one page at a time, the way your browser does when you page through results. It pauses at least 3 seconds between pages and stops after 10 pages or 1,000 cars. A 553-car search took 6 requests and 23 seconds.
- It never opens individual car pages, never logs in, and sends nothing anywhere until you press **Send to my dashboard**. Then it hands the listings to your dashboard only.
- It does not pretend to be anything it is not: the requests are your browser's ordinary ones.

**Permission.** You told me on 13 Nov 2026 that SGCarMart's head of sales said scraping is welcome. That is a spoken assurance, and the site's firewall refused the server-side scan regardless. I could not read SGCarMart's terms of use from where I work. A short written confirmation is worth having. If SGCarMart ever allows the server-side scan, see "The automatic scan" at the end.

## If something goes wrong

**No green button on my SGCarMart search.** Reload the page. Check `chrome://extensions` shows **SG Car Deals scanner** switched on, and that the folder you extracted is still where it was. The button only appears on used-car search pages.

**Why an extension.** A bookmark version was tried on 17 Nov 2026 and did nothing in your browser, for a reason never found. The extension does the same job and is easier to check. It is built for one dashboard address; to rebuild it for another, run `node scripts/build-extension.mjs https://NAME.github.io/sg-car-deals/`.

**Last resort.** Press Ctrl+S on your search, save the page, and choose the file in the dashboard under **Or add a saved page**. One file per results page.

**The green box says a page "could not be read".** The site refused or timed out on that page. What was read so far is kept and can be sent. Wait a few minutes and scan again; do not press it repeatedly.

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

Tested on the live site, 17 Nov 2026, in your own Chrome:

- The scanner's code read your search in full: 553 of 553 cars over 6 pages in 23 seconds, every one with price, depreciation, registration date, COE left and vehicle type.
- "Send to my dashboard" opened the live dashboard, which received all 553 and rated 513 cars (41 vans and trucks left unrated).
- How the site works was confirmed: result pages are addressed with `page=N`, `limit=100` gives 100 cars a page, and pressing the site's own Next button reloads the whole page.

That run used the scanner's code pasted into the page through a browser tool. The packaged extension runs the same code and was tested separately in a test browser.

Tested in a test browser and by automated checks (34 checks with `node --test`, plus browser runs):

- The packaged extension, loaded into a Chromium browser against a stand-in site built from your real saved page, served under a deliberately strict security policy: button shown, three pages read with pauses, listings handed to the dashboard.
- Publishing, against a stand-in for GitHub that behaves like the real one.
- The rating engine against the earlier Python model on 26 real listings: 442 comparisons, no differences.
- The hand-over: listings arrive unchanged, and anything malformed or pointing away from sgcarmart.com is dropped.
- The dashboard: COE input, filters, search, sorting, saved-page import, offline use, phone layout, and that listing text cannot inject code.

Not tested:

- **The packaged extension has not been installed in your Chrome yet.** Its code ran live; its packaging did not.
- **Publishing has not been tried against the real GitHub**, because it needs your token.
- With several hundred cars loaded, about a third rate Attractive. The thresholds were set on a 26-car sample and may want tightening.

## Files

| File | What it is |
| --- | --- |
| `index.html`, `app.js`, `styles.css` | The dashboard |
| `lib/engine.js` | Valuation and rating rules |
| `lib/parse.js` | Reads an SGCarMart results page |
| `lib/capture.js` | The scanner: reads result pages in your browser |
| `extension/`, `sg-car-deals-scanner.zip` | The scanner as a Chrome or Edge extension, and the same thing zipped for download |
| `lib/bookmarklet.js`, `scripts/build-extension.mjs` | Build the extension's script from `lib/parse.js` and `lib/capture.js` |
| `lib/transfer.js` | Checks listings handed over by the scanner |
| `lib/store.js` | First-seen dates and price history |
| `data/listings.json`, `data/status.json` | The published listings |
| `data/models.json`, `data/price_guide.json` | Reference tables |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline use and phone install |
| `tests/` | Automated checks |
| `scripts/fetch.mjs`, `.github/workflows/scan.yml`, `searches.txt`, `scanner.config.json` | The automatic scan (currently refused by SGCarMart) |

## The automatic scan

`scripts/fetch.mjs` is a server-side scan that GitHub can run. It reads `robots.txt` first, waits 8 seconds between pages, makes at most 30 requests a run, names itself honestly (`sg-car-deals/1.0` plus your repository's address), and stops without retrying when refused. On 15 Nov 2026 SGCarMart answered its first request with HTTP 403, so it is switched to manual-only. If SGCarMart agrees to let it through, run it from **Actions** > **Scan SGCarMart** > **Run workflow**; the comment at the top of `scan.yml` shows how to make it daily again.

Listings and figures come from sgcarmart.com. This is a personal tool, not affiliated with SGCarMart, and not financial advice.
