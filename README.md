# Facebook Ad Scraper

## Overview
This Apify Actor scrapes the **Facebook Ad Library** for any keyword and country combination. It collects **ad text, images, advertiser websites**, and — if enabled — **contact info** like email and social media links.  

Ideal for:
- 🔍 Market research  
- 💼 Competitor analysis  
- 📊 Lead generation  

---

## Input
The Actor accepts a JSON input:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `keywords` | array of strings | ✅ | - | Keywords to search for |
| `countries` | array of strings | ✅ | - | Country codes (ISO 3166-1 alpha-2, e.g., US, UK, CA) |
| `max_items` | integer | ❌ | 100 | Max number of ads to scrape |
| `find_contact_info` | boolean | ❌ | false | Scrape advertiser email + social media |

### Example
```json
{
  "keywords": ["Real Estate", "Realtor"],
  "countries": ["US", "UK"],
  "max_items": 50,
  "find_contact_info": true
}
