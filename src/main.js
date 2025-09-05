// main.js

import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const {
    max_items = 50,               // Max ads to scrape
    find_contact_info = true,     // Enabled contact info scraping
    keywords = ['Find your dream home'],
    countries = ['US'],
} = (await Actor.getInput()) || {};

const requestUrls = [];

// Dynamically build Facebook Ad Library URLs from input keywords and countries
for (const country of countries) {
    for (const keyword of keywords) {
        const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&is_targeted_country=false&media_type=all&q=${encodeURIComponent(`"${keyword}"`)}&search_type=keyword_exact_phrase`;
        requestUrls.push(url);
    }
}

let scrapedCount = 0;
const seenOwners = new Set();

const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: requestUrls.length,
    requestHandlerTimeoutSecs: 90,
    maxConcurrency: 1,
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

    async requestHandler({ page, request, log }) {
        log.info(`Processing page: ${request.url}`);

        // Accept cookies popup if present
        try {
            const cookieButton = await page.$('button:has-text("Allow all cookies")');
            if (cookieButton) {
                await cookieButton.click();
                log.info('Clicked cookie acceptance button');
            }
        } catch {}

        // Scroll to load ads
        await page.waitForTimeout(2000);
        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(3000);
        await page.mouse.wheel(0, 2000);
        await page.waitForTimeout(3000);
        await page.mouse.wheel(0, 3000);
        await page.waitForTimeout(5000);

        const ads = await page.$$('div._8nqr._3qn7._61-3._2fyi._3qng');
        log.info(`Found ${ads.length} ad container(s) after scrolling`);

        for (const adElement of ads) {
            if (scrapedCount >= max_items) return;

            const adData = await adElement.evaluate((el) => {
                const accountLink = el.querySelector('a.xt0psk2');
                const accountName = accountLink?.innerText || '';
                const websiteUrl = accountLink?.href || '';
                const sponsoredLabel = el.querySelector('span.x14vqqas')?.innerText || '';
                const adTextElement = el.querySelector('div._4ik4');
                const adText = adTextElement?.innerText || '';
                return { accountName, websiteUrl, sponsoredLabel, adText };
            });

            // Normalize for deduplication
            const accountNameNorm = adData.accountName.trim().toLowerCase();
            const websiteUrlNorm = adData.websiteUrl.trim().toLowerCase();

            // Skip if already seen this owner
            if (seenOwners.has(accountNameNorm) || seenOwners.has(websiteUrlNorm)) {
                continue;
            }

            const isPersonalName = /^[a-zA-Z]+\s[a-zA-Z]+$/.test(accountNameNorm);
            const lowerAdText = (adData.adText || '').toLowerCase();

            if (!isPersonalName &&
                !lowerAdText.includes('owner') &&
                !lowerAdText.includes('realtor') &&
                !lowerAdText.includes('agent') &&
                !lowerAdText.includes('broker')) {
                continue;
            }

            // Mark this owner as seen
            seenOwners.add(accountNameNorm);
            seenOwners.add(websiteUrlNorm);

            // Fetch contact info if enabled
            let accountBioEmail = '';
            let accountBioSocialLinks = [];
            if (find_contact_info && adData.accountName) {
                try {
                    const pageLinkEl = await adElement.$('a.xt0psk2');
                    if (pageLinkEl) {
                        const pageUrl = await pageLinkEl.getAttribute('href');
                        if (pageUrl) {
                            const pageBio = await page.context().newPage();
                            await pageBio.goto(`https://facebook.com${pageUrl}`, { timeout: 20000, waitUntil: 'domcontentloaded' });

                            accountBioEmail = await pageBio.locator('a[href^="mailto:"]').first().innerText().catch(() => '');
                            accountBioSocialLinks = await pageBio.locator('a').allTextContents().then(links =>
                                links.filter(l => l.includes('instagram.com') || l.includes('twitter.com') || l.includes('linkedin.com') || l.includes('youtube.com'))
                            ).catch(() => []);
                            await pageBio.close();
                        }
                    }
                } catch {}
            }

            await Actor.pushData({
                accountName: adData.accountName,
                websiteUrl: adData.websiteUrl,
                sponsoredLabel: adData.sponsoredLabel,
                adText: adData.adText,
                accountBioEmail,
                accountBioSocialLinks,
            });

            scrapedCount++;
        }
    },

    failedRequestHandler: async ({ request, error, log }) => {
        log.error(`Request ${request.url} failed: ${error.message}`);
        await Actor.pushData({ url: request.url, error: error.message });
    },

    errorHandler: async ({ request, error, log }) => {
        log.error(`Error on request ${request.url}: ${error.message}`);
    },
});

await crawler.run(requestUrls);

log.info(`Crawler finished. Total scraped items: ${scrapedCount}`);

await Actor.exit();

// add at top with other imports:
import fs from 'fs';

// ... after you have `filtered` or `results` array ready:
fs.writeFileSync('results.json', JSON.stringify(filtered || results || [], null, 2));
console.log('WROTE results.json with', (filtered||results||[]).length, 'items');

