// main.js
import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import fs from 'fs';

await Actor.init();

try {
    const {
        max_items = 50,              // Max ads to scrape
        find_contact_info = true,    // Enable contact info scraping
        keywords = ['Find your dream home'],
        countries = ['US'],
    } = (await Actor.getInput()) || {};

    const requestUrls = [];

    // Build FB Ad Library URLs dynamically
    for (const country of countries) {
        for (const keyword of keywords) {
            const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&is_targeted_country=false&q=${encodeURIComponent(keyword)}`;
            requestUrls.push(url);
        }
    }

    let scrapedResults = [];
    let scrapedCount = 0;

    const crawler = new PlaywrightCrawler({
        requestHandler: async ({ page, request }) => {
            log.info(`Scraping: ${request.url}`);

            // Example scrape logic
            const ads = await page.$$eval('div[data-ad-preview="message"]', els =>
                els.map(el => el.innerText).slice(0, 5)
            );

            ads.forEach(ad => {
                scrapedResults.push({
                    keyword: request.userData.keyword,
                    country: request.userData.country,
                    adText: ad,
                    timestamp: new Date().toISOString()
                });
            });

            scrapedCount += ads.length;
            log.info(`Scraped ${ads.length} ads from ${request.url}`);
        },
        maxRequestsPerCrawl: max_items,
    });

    // Add all URLs with context
    requestUrls.forEach(url => {
        crawler.addRequests([
            { url, userData: { keyword: 'generic', country: 'US' } }
        ]);
    });

    await crawler.run();

    log.info(`✅ Scraping finished. Total ads: ${scrapedCount}`);

    // Write results to JSON
    fs.writeFileSync('results.json', JSON.stringify(scrapedResults, null, 2));
    log.info('Results written to results.json');

} catch (err) {
    log.error(`❌ Scraper failed: ${err.message}`);

    // Always produce an empty results.json on failure
    fs.writeFileSync('results.json', JSON.stringify([], null, 2));
    log.info('Empty results.json created due to error.');
}

await Actor.exit();
