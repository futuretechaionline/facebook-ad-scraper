// main.js

import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import fs from 'fs';

await Actor.init();

const {
    max_items = 50,                // Max ads to scrape
    find_contact_info = true,      // Enabled contact info scraping
    keywords = ['Find your dream home'],
    countries = ['US'],
} = (await Actor.getInput()) || {};

const requestUrls = [];

// Dynamically build Facebook Ad Library URLs from input keywords and countries
for (const country of countries) {
    for (const keyword of keywords) {
        const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(keyword)}&is_targeted_country=false`;
        requestUrls.push(url);
    }
}

let scrapedCount = 0;
const results = [];

const crawler = new PlaywrightCrawler({
    async requestHandler({ page, request }) {
        log.info(`Scraping URL: ${request.url}`);

        // Example scraping logic (replace with your selectors)
        const ads = await page.$$eval('[data-ad-preview]', els =>
            els.map(el => ({
                accountName: el.querySelector('[data-ad-entity-name]')?.textContent || null,
                adText: el.textContent || null,
                sponsoredLabel: 'Sponsored',
                websiteUrl: window.location.href,
            }))
        );

        for (const ad of ads) {
            if (scrapedCount >= max_items) break;
            results.push(ad);
            scrapedCount++;
        }
    },
});

await crawler.run(requestUrls);

// Save results to Apify dataset (for Apify platform)
await Actor.pushData(results);

// ✅ Also save results.json locally so GitHub Actions can upload it
fs.writeFileSync('results.json', JSON.stringify(results, null, 2));
console.log(`✅ Wrote results.json with ${results.length} ads`);

await Actor.exit();
import fs from 'fs';
fs.writeFileSync('results.json', JSON.stringify(results, null, 2));
console.log("✅ results.json written with", results.length, "items");
