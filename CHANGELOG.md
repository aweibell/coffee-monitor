# Changelog

All notable changes to the Coffee Monitor project will be documented in this file.

## [Unreleased]

### Added - 2025-12-09

#### 🤖 AI Product Tagging Feature
- **OpenAI Integration**: Added intelligent product tagging using GPT-4o-mini
- **New Commands**:
  - `ai-tag`: Tag products with AI-extracted attributes
  - `ai-list`: View AI-tagged products with detailed information
- **Database Schema**: Added 13 new columns for AI-extracted attributes:
  - Country of origin, region, process method, roast level, variety
  - Organic, fair trade, and decaf detection
  - Flavor notes and certifications (JSON arrays)
  - Confidence scores and timestamps
- **Features**:
  - Batch processing for efficiency (5 products at a time)
  - Cost estimation before running
  - Dry-run mode for testing
  - Automatic database migration
  - Full backward compatibility

#### Documentation
- `docs/AI_TAGGING.md`: Complete AI tagging documentation
- `QUICKSTART_AI.md`: 5-minute quick start guide
- `AI_INTEGRATION_SUMMARY.md`: Integration summary and overview
- `examples/ai-tagger-example.js`: Programmatic usage examples
- Updated `README.md` with AI tagging information

#### Dependencies
- Added `openai` package (v6.10.0) for GPT API access

#### Configuration
- Added `OPENAI_API_KEY` to `.env.example`
- Optional feature - works without API key (graceful degradation)

### Technical Details

**Files Created:**
- `src/processors/ai-tagger.js` - Core AI tagging service
- `src/commands/ai-tag.js` - CLI command implementation
- `docs/AI_TAGGING.md` - Documentation
- `QUICKSTART_AI.md` - Quick start guide
- `examples/ai-tagger-example.js` - Usage examples

**Files Modified:**
- `src/database/database.js` - Added AI columns and saveAITags() method
- `src/index.js` - Added ai-tag and ai-list commands
- `.env.example` - Added OpenAI API key configuration
- `README.md` - Added AI tagging to features and commands
- `package.json` - Added openai dependency

**Cost:**
- Uses gpt-4o-mini model (cost-effective)
- Approximately $0.0001-$0.0002 per product
- Free tier ($5 credit) can tag thousands of products

**Attributes Extracted:**
- Country of origin and region
- Process method (washed, natural, honey, anaerobic, experimental)
- Roast level (light, medium, dark)
- Coffee variety (Bourbon, Typica, Geisha, etc.)
- Certifications (organic, fair trade, decaf)
- Flavor notes from descriptions
- Confidence score (0-100%)

---

## [Previous Versions]

For changes prior to AI tagging integration, refer to git history.
