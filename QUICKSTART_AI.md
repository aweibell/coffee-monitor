# 🚀 Quick Start: AI Coffee Tagging

Get started with AI-powered coffee product tagging in 5 minutes!

## Prerequisites

- Node.js and npm installed
- Coffee products already scraped into your database
- OpenAI API account (free tier works!)

## Step 1: Install OpenAI Package ✓

Already done! The `openai` package is installed.

## Step 2: Get Your API Key

1. Go to https://platform.openai.com/api-keys
2. Sign up (free tier includes $5 credit)
3. Click "Create new secret key"
4. Copy your key (starts with `sk-...`)

## Step 3: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env and add your key
nano .env
```

Add this line:
```
OPENAI_API_KEY=sk-your-actual-key-here
```

Save and exit (Ctrl+X, Y, Enter in nano).

## Step 4: Test with Dry Run

Preview the AI tagging on one product:

```bash
node src/index.js ai-tag --dry-run
```

You should see output like:
```
🤖 AI Coffee Product Tagging

✓ OpenAI API key found

Found 15 product(s) to tag
Estimated cost: $0.0023

🔍 Dry run - showing sample tagging for first product:

📦 Ethiopia Guji Natural - 250g
   Light roast with notes of blueberry and chocolate

🏷️  AI-extracted tags:
   Origin: Ethiopia (Guji)
   Process: natural
   Roast: light
   Flavor notes: blueberry, chocolate
   Confidence: 88%

ℹ️  This was a dry run. Run without --dry-run to save tags.
```

## Step 5: Tag All Products

If the dry run looks good, tag all untagged products:

```bash
node src/index.js ai-tag
```

You'll see:
```
🤖 AI Coffee Product Tagging

✓ OpenAI API key found

Found 15 product(s) to tag
Estimated cost: $0.0023

🏷️  Tagging products...

✓ [1/15] Ethiopia Guji Natural - 250g
  → Ethiopia | natural | 88% confidence
✓ [2/15] Colombia Huila Washed - 1kg
  → Colombia | washed | 92% confidence
...

✅ Successfully tagged 15 product(s)!
```

## Step 6: View Tagged Products

See what was extracted:

```bash
node src/index.js ai-list
```

Output:
```
🏷️  AI-Tagged Products (showing 15)

📦 Ethiopia Guji Natural - 250g
   📍 Origin: Ethiopia, Guji
   ⚙️  Process: natural
   🔥 Roast: light
   👃 Flavors: blueberry, chocolate
   🎯 Confidence: 88%

📦 Colombia Huila Washed - 1kg
   📍 Origin: Colombia, Huila
   ⚙️  Process: washed
   🔥 Roast: medium
   ✨ Attributes: Organic
   👃 Flavors: caramel, nuts, cocoa
   🎯 Confidence: 92%
...
```

## What's Next?

### Option A: Tag More Products Gradually

```bash
# Tag only 5 products at a time
node src/index.js ai-tag --limit 5
```

### Option B: Re-tag Everything

```bash
# Re-tag all products (useful if you update the AI prompt)
node src/index.js ai-tag --force
```

### Option C: Integrate with Monitoring

Next time you run `npm run check`, consider tagging new products automatically by integrating the AI tagger into your workflow.

## Cost Examples

Based on gpt-4o-mini pricing:

| Products | Estimated Cost |
|----------|---------------|
| 10       | $0.001 - $0.002 |
| 50       | $0.005 - $0.010 |
| 100      | $0.010 - $0.020 |
| 500      | $0.050 - $0.100 |

The free tier ($5 credit) can tag thousands of products!

## Troubleshooting

### Error: API key not found
- Check that `.env` file exists in project root
- Verify `OPENAI_API_KEY=sk-...` is in the file
- Make sure there are no spaces around the `=`

### Error: No products found
- Run `npm run check` first to scrape products
- Or check your database has products: `ls -lh data/`

### Low confidence scores
- This is normal for vague product names
- Products with detailed descriptions get higher scores
- You can filter by confidence later in queries

## Need Help?

- Full documentation: [docs/AI_TAGGING.md](docs/AI_TAGGING.md)
- OpenAI help: https://help.openai.com/
- Check logs: `cat logs/coffee-monitor.log`

---

Happy tagging! ☕🤖
