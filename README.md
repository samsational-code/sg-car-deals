# SG Car Deals

A personal dashboard that rates SGCarMart used-car listings against the COE price you type in.

- **The app** is a web page hosted free on GitHub Pages. It installs on a phone like an app and works offline.
- **The scan** is a small job GitHub runs for you once a day. It reads your SGCarMart search and saves the listings into this repository. You can also run it with one click.
- **You** type the latest Cat A and Cat B COE prices. Every car is re-rated at once.

Built and tested on 14-15 Nov 2026. There is nothing to install on your computer.

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

**4. Put in your search**

1. On SGCarMart, build the search you want (see "Choosing a search" below) and copy the address from the address bar.
2. In the repository click `searches.txt`, then the pencil icon. Replace the last line with your address. Click **Commit changes**.

**5. Run the first scan**

1. Click the **Actions** tab. If GitHub asks you to enable workflows, agree.
2. Click **Scan SGCarMart** on the left, then **Run workflow** > **Run workflow**.
3. Wait three to five minutes for a green tick. A red cross means the scan read nothing: see "If something goes wrong".
4. Open the dashboard and press **Refresh**.

**6. Put it on your phone**

Open the dashboard address on your phone. iPhone: Share > **Add to Home Screen**. Android: menu > **Install app** or **Add to Home screen**.

## Using it

- **After each COE bidding result**, type the new Cat A and Cat B prices into the two boxes. They are remembered on that device.
- **Refresh** reloads the latest saved listings. The scan itself runs at 07:17 Singapore time every day.
- **Run a new scan** (shown on a computer) opens the GitHub page where you click **Run workflow**.
- Tap a rating chip to filter. Tap a car's name to open it on SGCarMart.
- **Your assumptions** holds the investment return (3% or 8%), yearly distance, fuel and electricity prices, ERP and parking.

## Choosing a search

The scan reads whatever search you paste, page by page, up to 10 pages (200 cars) per search. A focused search is better than a wide one. Based on the research:

| Filter | Set it to | Why |
| --- | --- | --- |
| Vehicle type | All Passenger Cars | Leaves out vans and trucks, which are not rated |
| Registration year | 2018 to 2019 | 1 to 3 years of COE left, where depreciation is lowest and little capital is tied up |
| Price | up to S$50,000 | Covers every car on the shortlist at that age |
| Depreciation | up to S$16,000 a year | Removes the clearly expensive ones |
| Sort | Depreciation (Lowest) | If the search has more than 10 pages, the best ones are read first |

You can add more lines to `searches.txt`, for example a second search for electric cars registered 2022 onwards. Keep the total modest: the scan stops at 30 requests a run.

The starter line in `searches.txt` has the year, price and depreciation filters but not the vehicle type, because the address code for that filter is not known to me. Set it on the site and copy the address.

## How the scan behaves

- Reads only search-results pages on `www.sgcarmart.com/used-cars/listing`. It never opens individual car pages and never logs in.
- Reads `robots.txt` first and skips anything it disallows.
- Waits 8 seconds between pages (never under 5, longer if `robots.txt` asks).
- At most 30 requests a run, once a day.
- Says who it is: its User-Agent is `sg-car-deals/1.0` with the address of your repository.
- If the site answers 401, 403 or 429, or shows a bot check, it stops at once and does not retry. The dashboard shows a notice and keeps the last good listings.

Limits are in `scanner.config.json`.

**Permission.** You told me on 13 Nov 2026 that SGCarMart's head of sales said scraping is welcome. That is a spoken assurance. I could not read SGCarMart's terms of use or `robots.txt` from the build environment, so neither has been checked. A short written confirmation is worth having, and it is worth reading the terms page yourself.

## If something goes wrong

**The scan has a red cross.** Click the run, then the failed step, to read the message. The dashboard banner says the same thing in plainer words.

**"Refused" or "could not reach".** SGCarMart may block requests from GitHub's servers. Do not keep re-running it. Use the dashboard's **Add listings from a saved page** instead: open your search on SGCarMart, press Ctrl+S, save the page, and choose the saved file in the dashboard. One file per results page. Listings added this way stay on that device.

**"Only the first page could be read".** The scan asks for later pages by adding `page=2` to your address. That is a guess, because the saved page I worked from does not show how SGCarMart numbers its pages. To fix it: open your search on SGCarMart, click page 2, and look at the address bar.
- If it shows something like `&pg=2`, edit `scanner.config.json` and change `"page_param": "page"` to `"page_param": "pg"`.
- If the address does not change, split the search into narrower ones (for example one line per registration year) so each fits on one page, or raise the results per page on the site and copy that address.

**"Save results" fails with a permission error.** Settings > Actions > General > Workflow permissions > **Read and write permissions** > Save. Run the scan again.

**The dashboard shows old listings.** Press Refresh. GitHub takes a minute or two to publish after a scan.

**Ratings look wrong after a site redesign.** The reader is `lib/parse.js`. `node --test` shows whether it still reads the sample. Send me a freshly saved results page and I can update it.

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

Tested (28 automated checks, `node --test`, plus a headless-browser run):

- The page reader against a real SGCarMart results page saved on 14 Nov 2026: all 20 listings read, and the two reading methods agree on every price, depreciation, date, mileage and engine figure.
- The rating engine against the earlier Python model on 26 real listings: 442 comparisons, no differences.
- The scan against a stand-in website: paging, limits, `robots.txt`, refusals, bot checks, price history.
- The dashboard: COE input, filters, search, sorting, import of a saved page, offline use, phone layout, and that listing text cannot inject code.

Not tested:

- **The scan has never contacted sgcarmart.com.** I cannot reach the site from where I work. Your first run is the real test.
- **Paging by address** (`page=2`) is a guess, as explained above. The scan detects when it does not work and says so.
- **`ord=DEP_ASC`** in the starter search comes from the site's own sort menu but has not been tried in an address.
- The GitHub job file itself has not been run on GitHub.

## Files

| File | What it is |
| --- | --- |
| `index.html`, `app.js`, `styles.css` | The dashboard |
| `lib/engine.js` | Valuation and rating rules |
| `lib/parse.js` | Reads an SGCarMart results page |
| `scripts/fetch.mjs` | The scan |
| `.github/workflows/scan.yml` | Tells GitHub to run the scan daily |
| `searches.txt` | Your searches |
| `scanner.config.json` | Scan limits |
| `data/listings.json`, `data/status.json` | Written by the scan |
| `data/models.json`, `data/price_guide.json` | Reference tables |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline use and phone install |
| `tests/` | Automated checks |

Listings and figures come from sgcarmart.com. This is a personal tool, not affiliated with SGCarMart, and not financial advice.
