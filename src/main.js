import fs from 'fs';
import fsPromises from 'fs/promises';
import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

try {
    const input = (await Actor.getInput()) || {};

    const KEYWORDS = input.keywords || [];
    const INTENT_KEYWORDS = input.intentKeywords || [];
    const CTA_KEYWORDS = input.ctaKeywords || [];
    const EXCLUDE_KEYWORDS = input.excludeKeywords || [];
    const COUNTRIES = input.countries || [];
    const MAX_ITEMS = input.maxItems || 100;
    const FIND_CONTACT_INFO = input.findContactInfo || false;
    const EXTRACT_FOLLOWERS = input.extractFollowers || false;
    const MAX_FOLLOWERS = input.maxFollowers || 0;
    const OUTPUT_FORMAT = input.outputFormat || 'json';

    let collected = [];

    const crawler = new PlaywrightCrawler({
        async requestHandler({ page, request }) {
            log.info(`Visiting ${request.url}`);
            await page.waitForTimeout(2000);

            const ads = await page.$$eval('div[role="article"]', els => els.map(e => e.innerText));
            for (let ad of ads) {
                if (collected.length >= MAX_ITEMS) break;

                // You can add filtering here using INTENT_KEYWORDS, CTA_KEYWORDS, EXCLUDE_KEYWORDS
                // For simplicity, we just include all ads here

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

    if (OUTPUT_FORMAT.toLowerCase() === 'csv') {
        // Write CSV
        const csv = "keyword,country,ad\n" + collected.map(r => {
            const adEscaped = r.ad.replace(/"/g, '""');
            return `${r.keyword},${r.country},"${adEscaped}"`;
        }).join("\n");
        fs.writeFileSync(csvFile, csv);
        log.info(`✅ Wrote results.csv at: ${csvFile}`);
    } else {
        // Write JSON (default)
        fs.writeFileSync(jsonFile, JSON.stringify(collected, null, 2));
        log.info(`✅ Wrote results.json at: ${jsonFile}`);
    }

    // Push data (optional, useful on Apify platform)
    await Actor.pushData(collected);

} catch (err) {
    log.error("Fatal error", { err });
    process.exitCode = 1;
}

await Actor.exit();
