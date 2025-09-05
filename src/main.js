import fs from "fs";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

async function scrape() {
  const keywords = process.env.KEYWORDS?.split(",") || ["real estate"];
  const country = process.env.COUNTRIES || "US";
  const maxItems = parseInt(process.env.MAX_ITEMS || "50", 10);

  let results = [];

  for (const keyword of keywords) {
    console.log(`🔍 Searching for keyword: ${keyword}`);
    const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&q=${encodeURIComponent(
      keyword
    )}`;

    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    // Try main selector first
    let ads = $("[data-ad-preview]");
    if (!ads.length) {
      console.log("⚠️ [data-ad-preview] not found → using fallback");
      ads = $("div").filter((i, el) => $(el).text().includes("Sponsored"));
    }

    ads.each((i, el) => {
      if (results.length >= maxItems) return false;

      const adText = $(el).text().trim().slice(0, 500); // first 500 chars
      const pageLink = $(el).find("a").attr("href") || "";
      const advertiser = $(el).find("strong").first().text().trim() || "Unknown";

      results.push({
        keyword,
        advertiser,
        adText,
        pageLink,
        timestamp: new Date().toISOString(),
      });
    });
  }

  console.log(`✅ Scraped ${results.length} ads`);
  fs.writeFileSync("results.json", JSON.stringify(results, null, 2));

  // Write CSV too
  const csvHeader = "Keyword,Advertiser,AdText,PageLink,Timestamp\n";
  const csvRows = results
    .map(
      (r) =>
        `"${r.keyword}","${r.advertiser}","${r.adText.replace(/"/g, "'")}","${
          r.pageLink
        }","${r.timestamp}"`
    )
    .join("\n");

  fs.writeFileSync("results.csv", csvHeader + csvRows);
}

scrape().catch((err) => {
  console.error("❌ Scraper error:", err);
  process.exit(1);
});
