# 🤖 AI Product Tagging

The Coffee Monitor now includes AI-powered product tagging using OpenAI's GPT models. This feature automatically extracts structured information from coffee product names and descriptions, making it easier to filter and discover coffees by origin, process method, certifications, and more.

## Features

The AI tagger can identify:

- **Origin**: Country and specific region
- **Process Method**: Washed, natural, honey, anaerobic, experimental
- **Roast Level**: Light, medium, dark
- **Variety**: Coffee varieties (Bourbon, Typica, Geisha, etc.)
- **Certifications**: Organic, fair trade, decaf status
- **Flavor Notes**: Taste descriptors from descriptions
- **Confidence Score**: How confident the AI is in its extraction

## Setup

### 1. Get an OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign up or log in
3. Create a new API key

### 2. Configure Environment

Add your API key to `.env`:

```bash
cp .env.example .env
# Edit .env and add:
OPENAI_API_KEY=sk-your-key-here
```

## Usage

### Tag New Products

Tag all untagged products:

```bash
node src/index.js ai-tag
```

### Preview Tagging (Dry Run)

Test the AI tagging on one product without saving:

```bash
node src/index.js ai-tag --dry-run
```

Example output:
```
🤖 AI Coffee Product Tagging

✓ OpenAI API key found

Found 15 product(s) to tag
Estimated cost: $0.0023

🔍 Dry run - showing sample tagging for first product:

📦 Ethiopia Guji Anaerobic Natural - 250g
   Lyst brent med noter av blåbær, jordbær og mørk sjokolade

🏷️  AI-extracted tags:
   Origin: Ethiopia (Guji)
   Process: anaerobic
   Roast: light
   Variety: Unknown
   Organic: No
   Fair Trade: No
   Decaf: No
   Flavor notes: blueberry, strawberry, dark chocolate
   Confidence: 85%

ℹ️  This was a dry run. Run without --dry-run to save tags.
```

### Tag Specific Number of Products

Limit how many products to tag (useful for testing):

```bash
node src/index.js ai-tag --limit 10
```

### Re-tag Existing Products

Force re-tagging of all products:

```bash
node src/index.js ai-tag --force
```

### View Tagged Products

List AI-tagged products:

```bash
node src/index.js ai-list
```

Show more products:

```bash
node src/index.js ai-list --limit 50
```

Example output:
```
🏷️  AI-Tagged Products (showing 20)

📦 Kenya Kiambu Washed AB - 250g
   📍 Origin: Kenya, Kiambu
   ⚙️  Process: washed
   🔥 Roast: medium
   👃 Flavors: blackcurrant, citrus, caramel
   🎯 Confidence: 90%

📦 Colombia Huila Decaf - 1kg
   📍 Origin: Colombia, Huila
   ⚙️  Process: washed
   🔥 Roast: medium
   ✨ Attributes: Decaf
   👃 Flavors: chocolate, nuts, caramel
   🎯 Confidence: 92%
```

## Cost Estimation

The AI tagger uses `gpt-4o-mini`, which is cost-effective:

- **Approximate cost per product**: $0.0001 - $0.0002
- **100 products**: ~$0.01 - $0.02
- **1000 products**: ~$0.10 - $0.20

The tool shows estimated costs before running.

## Database Schema

AI-extracted attributes are stored in these columns:

```sql
ai_country_of_origin  TEXT
ai_region             TEXT
ai_process_method     TEXT     -- washed, natural, honey, etc.
ai_roast_level        TEXT     -- light, medium, dark
ai_variety            TEXT     -- Bourbon, Geisha, etc.
ai_is_organic         BOOLEAN
ai_is_fair_trade      BOOLEAN
ai_is_decaf           BOOLEAN
ai_flavor_notes       TEXT     -- JSON array
ai_certifications     TEXT     -- JSON array
ai_confidence         INTEGER  -- 0-100
ai_tagged_at          DATETIME
```

## Future Use Cases

Once products are tagged, you can:

1. **Enhanced Filtering**: Filter favorites by origin, process, or attributes
   ```bash
   # Future feature examples:
   node src/index.js favorites --add "Natural" --process natural
   node src/index.js favorites --add "Ethiopian" --origin Ethiopia
   ```

2. **Reports by Origin**: See which countries/regions are most available
   ```bash
   # Future feature:
   node src/index.js report --by-origin
   ```

3. **Diversity Tracking**: Track variety in your roastery's selection

4. **Smart Recommendations**: Get notified about similar coffees to ones you like

## Batch Processing

The AI tagger processes products in batches of 5 by default for efficiency. You can adjust this in code:

```javascript
const tagger = new AITagger(null, { batchSize: 10 });
```

## Troubleshooting

### API Key Not Found

```
❌ OpenAI API key not found!
   Set OPENAI_API_KEY in your .env file
```

**Solution**: Add your API key to `.env` file

### Rate Limits

If you hit rate limits, reduce batch size or add delays between batches.

### Low Confidence Scores

Some products may have low confidence scores if:
- Product names are vague or non-descriptive
- Information is in languages the model doesn't understand well
- Product is not actually coffee

You can filter by confidence in SQL:
```sql
SELECT * FROM products WHERE ai_confidence >= 80;
```

## Tips for Best Results

1. **Run after scraping**: Tag products after each check to keep tags up to date
2. **Use --dry-run first**: Always test on a sample before tagging all products
3. **Check accuracy**: Review some tagged products to verify extraction quality
4. **Re-tag periodically**: Product descriptions may be updated by roasteries

## Technical Details

- **Model**: GPT-4o-mini (fast and cost-effective)
- **Temperature**: 0.1 (low for consistent extraction)
- **Response Format**: Structured JSON output
- **Fallback**: If AI is disabled, empty tags are returned (no errors)

## Privacy & Security

- API key is stored locally in `.env` (never committed to git)
- Only product names and descriptions are sent to OpenAI
- No personal information is transmitted
- API calls are made over HTTPS
