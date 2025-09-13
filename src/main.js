import fs from 'fs';
import fsPromises from 'fs/promises';
import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

function containsAny(text, keywords) {
    if (!text) return false;
    return keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()));
}

// Simple email extractor from text via regex
function extractEmails(text) {
    if (!text) return [];
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
    return (text.match(emailRegex) || []).filter((value, index, self) => self.indexOf(value) === index);
}

// Simple website/URL extractor (http or www)
function extractWebsites(text) {
    if (!text) return [];
    const urlRegex = /(https?:\/\/[^\s"]+|www\.[^\s"]+)/g;
    return (text.match(urlRegex) || []).filter((value, index, self) => self.indexOf(value) === index);
}

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
    const OUTPUT_FORMAT = (input.outputFormat || 'json').toLowerCase();

    let collected = [];

    const crawler = new PlaywrightCrawler({
        async requestHandler({ page, request }) {
            log.info(`Visiting ${request.url}`);
            await page.waitForTimeout(2000);

            // Extract ads text from Facebook ad articles
            const ads = await page.$$eval('div[role="article"]', els => els.map(e => e.innerText));
            for (let ad of ads) {
                if (collected.length >= MAX_ITEMS) break;

                // Apply keyword filters
                if (containsAny(ad, EXCLUDE_KEYWORDS)) continue; // skip excluded

                if (
                    containsAny(ad, INTENT_KEYWORDS) ||
                    containsAny(ad, CTA_KEYWORDS) ||
                    containsAny(ad, KEYWORDS)
                ) {
                    let contactEmails = [];
                    let contactWebsites = [];
                    let followersCount = null;

                    if (FIND_CONTACT_INFO) {
                        // Extract emails and websites from ad text and profile bio selectors
                        contactEmails = extractEmails(ad);

                        // Attempt to extract from profile bio (a div with role=textarea or bio text)
                        try {
                            const bioText = await page.$eval('div[role="textbox"], div[aria-label^="Bio"], div[data-testid="profile_bio"]', el => el.innerText).catch(() => '');
                            contactEmails.push(...extractEmails(bioText));
                            contactWebsites.push(...extractWebsites(bioText));
                        } catch {}

                        // Remove duplicates
                        contactEmails = [...new Set(contactEmails)];
                        contactWebsites = [...new Set(contactWebsites)];
                    }

                    if (EXTRACT_FOLLOWERS) {
                        // Attempt to extract followers text and parse number
                        try {
                            const followersText = await page.$eval('div[aria-label*="followers"], span[title*="followers"]', el => el.innerText).catch(() => '');
                            const match = followersText.replace(/,/g, '').match(/\d+/);
                            if (match) {
                                followersCount = parseInt(match[0], 10);
                                if (MAX_FOLLOWERS > 0 && followersCount > MAX_FOLLOWERS) {
                                    continue; // skip if followers exceed max
                                }
                            }
                        } catch {}
                    }

                    collected.push({
                        keyword: request.userData.keyword,
                        country: request.userData.country,
                        ad,
                        contactEmails,
                        contactWebsites,
                        followersCount,
                    });
                }
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
    log.info(`Collected total leads after filtering: ${collected.length}`);

    // Save results in repo root for GitHub Actions
    const workspacePath = process.env.GITHUB_WORKSPACE || process.cwd();
    const jsonFile = `${workspacePath}/results.json`;
    const csvFile = `${workspacePath}/results.csv`;

    if (OUTPUT_FORMAT === 'csv') {
        // Create CSV header
        const header = "keyword,country,ad,contactEmails,contactWebsites,followersCount\n";
        // Map collected data rows with CSV escaping and joining arrays by semicolon
        const csvRows = collected.map(r => {
            const cleanAd = r.ad.replace(/"/g, '""');
            const emails = (r.contactEmails || []).join(';').replace(/"/g, '""');
            const websites = (r.contactWebsites || []).join(';').replace(/"/g, '""');
            const followers = r.followersCount || '';
            return `"${r.keyword}","${r.country}","${cleanAd}","${emails}","${websites}","${followers}"`;
        });
        const csv = header + csvRows.join('\n');
        fs.writeFileSync(csvFile, csv);
        log.info(`✅ Wrote results.csv at: ${csvFile}`);
    } else {
        // Write JSON output
        fs.writeFileSync(jsonFile, JSON.stringify(collected, null, 2));
        log.info(`✅ Wrote results.json at: ${jsonFile}`);
    }

    await Actor.pushData(collected);

} catch (err) {
    log.error("Fatal error", { err });
    process.exitCode = 1;
}

await Actor.exit();
