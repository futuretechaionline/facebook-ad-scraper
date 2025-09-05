// src/main.js
import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import fs from 'fs';

await Actor.init();

try {
    const {
        max_items = 50,              
        keywords = ['real estate', 'realtor'],
        countries = ['US'],
    } = (await Actor.getInput()) || {};

    const requestUrls = [];

    // Build FB Ad Library URLs dynamically
    for (const country of countries) {
        for (const keyword of keywords) {
            const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(keyword)}&is_targeted_country=false`;
            requestUrls.push({ url, userData: { keyword, country } });
        }
    }

    let scrapedResults = [];

    const crawler = new PlaywrightCrawler({
        maxRequestsPerCrawl: max_items,
        async requestHandler({ page, request }) {
            log.info(`Scraping: ${request.url}`);

            // Wait for ads container to load
            await page.waitForSelector('[data-ad-preview]', { timeout: 10000 }).catch(() => {
                log.warning("No ads found on this page.");
                return;
            });

            const ads = await page.$$eval('[data-ad-preview]', els =>
                els.map(el => {
                    const advertiser = el.querySelector('[data-ad-entity-name]')?.textContent?.trim() || null;
                    const text = el.innerText || null;
                    const link = el.querySelector('a')?.href || null;
                    return { advertiser, text, link };
                })
            );

            scrapedResults.push(...ads);
            log.info(`✅ Found ${ads.length} ads for ${request.userData.keyword} (${request.userData.country})`);
        },
    });

    await crawler.run(requestUrls);

    // Remove duplicates
    const uniqueResults = scrapedResults.filter(
        (ad, index, self) =>
            index === self.findIndex(t => t.advertiser === ad.advertiser && t.text === ad.text)
    );

    // Save results
    fs.writeFileSync('results.json', JSON.stringify(uniqueResults, null, 2));
    log.info(`🎯 Total ads scraped: ${uniqueResults.length}`);
    console.log(`✅ results.json written with ${uniqueResults.length} ads`);

} catch (err) {
    log.error(`❌ Scraper failed: ${err.message}`);
    fs.writeFileSync('results.json', JSON.stringify([], null, 2));
    console.log("⚠️ Empty results.json created due to error.");
}

await Actor.exit();
