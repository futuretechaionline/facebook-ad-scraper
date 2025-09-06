import fs from 'fs';
import fsPromises from 'fs/promises';
import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

try {
    const input = (await Actor.getInput()) || {};
    const KEYWORDS = (input.keywords || process.env.KEYWORDS || "real estate,realtor").split(',').map(s => s.trim());
    const COUNTRIES = (input.countries || process.env.COUNTRIES || "US").split(',').map(s => s.trim());
    const MAX_ITEMS = parseInt(input.max_items || process.env.MAX_ITEMS || "100", 10);

    let collected = [];

    const crawler = new PlaywrightCrawler({
        async requestHandler({ page, request }) {
            log.info(`Visiting ${request.url}`);
            await page.waitForTimeout(2000);
            const ads = await page.$$eval('div[role="article"]', els => els.map(e => e.innerText));
            for (let ad of ads) {
                if (collected.length >= MAX_ITEMS) break;
                collected.push({ keyword: request.userData.keyword, country: request.userData.country, ad });
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

    const workspacePath = process.env.GITHUB_WORKSPACE || process.cwd();

    const jsonFile = `${workspacePath}/results.json`;
    fs.writeFileSync(jsonFile, JSON.stringify(collected, null, 2));
    log.info(`Wrote results.json at: ${jsonFile}`);

    const csvFile = `${workspacePath}/results.csv`;
    const csv = "keyword,country,ad\n" + collected.map(r => {
        const adEscaped = r.ad.replace(/"/g, '""');
        return `${r.keyword},${r.country},"${adEscaped}"`;
    }).join("\n");
    fs.writeFileSync(csvFile, csv);
    log.info(`Wrote results.csv at: ${csvFile}`);

    // Explicitly check if results.json exists and log file size
    const exists = await fsPromises.access(jsonFile).then(() => true).catch(() => false);
    if (exists) {
        const stats = await fsPromises.stat(jsonFile);
        log.info(`Confirmed results.json exists with size: ${stats.size} bytes.`);
    } else {
        log.warning(`results.json does NOT exist at expected path: ${jsonFile}`);
    }

    log.info('Files after writing output:', await fsPromises.readdir(workspacePath));

    log.info(`DONE: collected ${collected.length} leads`);
    await Actor.pushData(collected);

} catch (err) {
    log.error('Fatal error', { err });
    process.exitCode = 1;
}

await Actor.exit();
