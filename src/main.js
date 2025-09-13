import fs from 'fs';
import fsPromises from 'fs/promises';
import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const proxyUrl = 'socks4://1.130.3.138:1080'; // Your free SOCKS4 proxy

try {
    const input = (await Actor.getInput()) || {};

    const KEYWORDS = input.keywords || [];
    const COUNTRIES = input.countries || [];
    const MAX_ITEMS = input.maxItems || 100;
    const OUTPUT_FORMAT = (input.outputFormat || 'json').toLowerCase();
    const FIND_CONTACT_INFO = input.findContactInfo || false;

    let collected = [];

    const crawler = new PlaywrightCrawler({
        proxyConfiguration: {
            proxyUrls: [proxyUrl],
        },
        launchContext: {
            launchOptions: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1200,800',
                ],
            },
        },
        async requestHandler({ page, request }) {
            log.info(`Visiting ${request.url}`);

            // Accept cookies popup if present
            try {
                const cookieButton = await page.$('button:has-text("Allow all cookies")');
                if (cookieButton) {
                    await cookieButton.click();
                    log.info('Clicked cookie acceptance button');
                }
            } catch {}

            // Scroll the page to load more ads
            await page.evaluate(async () => {
                for (let i = 0; i < 10; i++) {
                    window.scrollBy(0, window.innerHeight);
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            });

            const ads = await page.$$eval('div[role="article"]', els => els.map(e => e.innerText));
            log.info(`Found ${ads.length} ads on page.`);

            for (let ad of ads) {
                if (collected.length >= MAX_ITEMS) break;
                collected.push({
                    keyword: request.userData.keyword,
                    country: request.userData.country,
                    ad
                });
            }
        },
    });

    const startRequests = [];
    for (const country of COUNTRIES) {
        for (const keyword of KEYWORDS) {
            startRequests.push({
                url: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(keyword)}&is_targeted_country=false`,
                userData: { keyword, country },
            });
        }
    }

    await crawler.run(startRequests);
    log.info(`Collected total leads: ${collected.length}`);

    // Save results in repo root for GitHub Actions
    const workspacePath = process.env.GITHUB_WORKSPACE || process.cwd();
    const jsonFile = `${workspacePath}/results.json`;
    const csvFile = `${workspacePath}/results.csv`;

    if (OUTPUT_FORMAT === 'csv') {
        const header = "keyword,country,ad\n";
        const csvRows = collected.map(r => {
            const cleanAd = r.ad.replace(/"/g, '""');
            return `"${r.keyword}","${r.country}","${cleanAd}"`;
        });
        const csv = header + csvRows.join('\n');
        fs.writeFileSync(csvFile, csv);
        log.info(`✅ Wrote results.csv at: ${csvFile}`);
    } else {
        fs.writeFileSync(jsonFile, JSON.stringify(collected, null, 2));
        log.info(`✅ Wrote results.json at: ${jsonFile}`);
    }

    await Actor.pushData(collected);

} catch (err) {
    log.error("Fatal error", { err });
    process.exitCode = 1;
}

await Actor.exit();
