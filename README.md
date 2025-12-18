# ☕ Coffee Monitor

A web scraping service that monitors your local coffee roastery's website for product availability and notifies you when your favorite coffees are in stock.

## Features

- 🔍 **Web Scraping**: Automatically scrape coffee roastery websites for product information
- ⭐ **Favorites Tracking**: Define favorite coffee patterns (e.g., "Ethiopia", "Natural Process") 
- 🤖 **AI Product Tagging**: Automatically extract origin, process method, certifications, and more using OpenAI
- 📧 **Email Notifications**: Get notified when favorite coffees become available
- 🖥️ **Desktop Notifications**: Native desktop notifications on Linux
- 📊 **Availability Tracking**: Historical tracking of product availability
- ⏰ **Scheduled Monitoring**: Daily automated checks with cron scheduling
- 📈 **Analytics**: Track how long products stay in stock
- 🛠️ **CLI Interface**: Easy command-line management

## Quick Start

### 1. Installation

```bash
# Clone and setup
git clone <repository-url>
cd coffee-monitor
npm install
```

### 2. Configuration

```bash
# Create configuration file
npm run setup

# Edit the config file with your roastery details
nano config/config.json
```

### 3. Configure Your Roastery

Edit `config/config.json` with your local roastery's details:

```json
{
  "roastery": {
    "name": "Your Coffee Roastery",
    "baseUrl": "https://yourcoffeeroastery.com",
    "shopUrl": "https://yourcoffeeroastery.com/shop",
    "selectors": {
      "productContainer": ".product",
      "name": ".product-title",
      "price": ".price",
      "link": "a"
    }
  },
  "favorites": [
    {
      "pattern": "Ethiopia",
      "description": "Ethiopian coffees"
    },
    {
      "pattern": "Natural Process",
      "description": "Natural processed coffees"
    }
  ]
}
```

### 4. Test Configuration

```bash
# Run a test check
npm run check
```

### 5. Start Monitoring

```bash
# Start scheduled monitoring (runs daily at 9 AM)
npm run start
```

## CLI Commands

### Basic Operations

```bash
# AI Product Tagging (NEW!)
node src/index.js ai-tag              # Tag all untagged products
node src/index.js ai-tag --dry-run    # Preview tagging without saving
node src/index.js ai-list             # Show AI-tagged products
```

See [AI Tagging Documentation](docs/AI_TAGGING.md) for full details.

### Product Monitoring

```bash
# Run one-time product check
npm run check
# or
node src/index.js check

# Start scheduled monitoring
npm run start
# or
node src/index.js start

# Show current status
node src/index.js status

# Generate availability report
npm run report
# or
node src/index.js report
```

### Manage Favorites (Enhanced with Multiple Search Terms)

```bash
# List current favorites
node src/index.js favorites --list

# Add a favorite with multiple search terms (comma-separated)
node src/index.js favorites --add "Ethiopian,Ethiopia,Etiopia" --description "Ethiopian beans"

# Add a simple favorite (single term)
node src/index.js favorites --add "Geisha" --description "Geisha variety"

# Remove a favorite by name
node src/index.js favorites --remove "Ethiopian"
```

### Configuration

```bash
# Setup initial configuration
node src/index.js setup

# Use custom config file
node src/index.js check --config /path/to/config.json
```

## Configuration Guide

### Roastery Configuration

The most important part is configuring the CSS selectors for your roastery's website:

```json
{
  "roastery": {
    "name": "Your Roastery Name",
    "baseUrl": "https://roastery.com",
    "shopUrl": "https://roastery.com/products",
    "selectors": {
      "productContainer": ".product-item",  // Container for each product
      "name": ".product-title",             // Product name selector
      "price": ".price",                    // Price selector
      "description": ".description",        // Description selector (optional)
      "link": "a",                         // Link to product page
      "availability": ".stock-status"       // Availability indicator (optional)
    }
  }
}
```

### Email Notifications

Configure email notifications using SMTP:

```json
{
  "notifications": {
    "email": {
      "enabled": true,
      "smtp": {
        "host": "smtp.gmail.com",
        "port": 587,
        "secure": false,
        "auth": {
          "user": "your-email@gmail.com",
          "pass": "your-app-password"
        }
      },
      "from": "your-email@gmail.com",
      "to": ["recipient@gmail.com"],
      "subject": "☕ Your favorite coffee is available!"
    }
  }
}
```

**Gmail Setup**: For Gmail, use an App Password instead of your regular password:
1. Enable 2-factor authentication
2. Generate an App Password at https://myaccount.google.com/apppasswords
3. Use the App Password in the config

### Scheduling

Configure when checks should run:

```json
{
  "monitoring": {
    "checkInterval": "0 9 * * *",  // Daily at 9 AM (cron format)
    "maxRetries": 3,
    "requestTimeout": 30000,
    "screenshotOnError": true
  }
}
```

Common cron patterns:
- `"0 9 * * *"` - Daily at 9 AM
- `"0 9,15 * * *"` - Daily at 9 AM and 3 PM  
- `"0 9 * * 1-5"` - Weekdays at 9 AM
- `"*/30 8-17 * * *"` - Every 30 minutes from 8 AM to 5 PM

## Enhanced Favorites with Multiple Search Terms

The favorites system has been enhanced to support multiple search terms per favorite category. This is perfect for coffee roasters who use different terminology for the same thing!

### Why Multiple Terms?
Coffee roasters often use different terms:
- "Ethiopia" vs "Etiopia" (Norwegian spelling)
- "Decaf" vs "Koffeinfri" (Norwegian for caffeine-free)
- "Natural Process" vs "Bærtørket" (Norwegian for berry-dried)

### How It Works

Favorites are now managed via the CLI and stored in the database with multiple search terms:

```bash
# Ethiopian coffee with multiple spellings
node src/index.js favorites --add "Ethiopian,Ethiopia,Etiopia" --description "Ethiopian coffee beans"

# Decaf coffee with English and Norwegian terms
node src/index.js favorites --add "Decaf,Koffeinfri,Decaffeinated" --description "Caffeine-free coffee"

# Process types
node src/index.js favorites --add "Natural,Bærtørket,Honey" --description "Natural/honey processed"

# View all favorites with their search terms
node src/index.js favorites --list
```

### Output Example
```
⭐ Current Favorites:
  1. "Ethiopian" - Ethiopian coffee beans
     Search terms: Ethiopian, Ethiopia, Etiopia
  2. "Decaf" - Caffeine-free coffee  
     Search terms: Decaf, Koffeinfri, Decaffeinated
```

When monitoring, the system will match products containing **any** of the search terms for each favorite category.

## Web Scraping Configuration

The scraper is designed to work with most coffee roastery websites. Key points:

1. **Inspect the website** to find the right CSS selectors
2. **Test selectors** in browser dev tools
3. **Start simple** - just get product names working first
4. **Add complexity** gradually (prices, descriptions, etc.)

### Finding Selectors

1. Open your roastery's shop page
2. Right-click on a product → "Inspect Element"
3. Find the container that wraps each product
4. Find selectors for name, price, etc.

Example for a typical e-commerce site:

```css
/* Product container */
.product-item, .product-card, .product

/* Product name */
.product-title, .product-name, h3, .title

/* Price */
.price, .product-price, .cost

/* Link */
a (usually the container or title is a link)
```

## Running as a Service

### Using PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start the service
pm2 start src/index.js --name coffee-monitor -- start

# View logs
pm2 logs coffee-monitor

# Stop the service
pm2 stop coffee-monitor

# Make it start on boot
pm2 startup
pm2 save
```

### Using systemd

Create `/etc/systemd/system/coffee-monitor.service`:

```ini
[Unit]
Description=Coffee Monitor Service
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username/projects/coffee-monitor
ExecStart=/usr/bin/node src/index.js start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Start the service
sudo systemctl enable coffee-monitor
sudo systemctl start coffee-monitor

# Check status
sudo systemctl status coffee-monitor

# View logs
sudo journalctl -u coffee-monitor -f
```

## Troubleshooting

### Scraping Issues

1. **No products found**: Check CSS selectors
2. **Wrong products**: Verify `productContainer` selector
3. **Missing prices**: Check `price` selector
4. **Broken links**: Ensure `baseUrl` is correct

```bash
# Test with debug screenshot
# The scraper saves screenshots on errors to help debug
ls logs/
```

### Email Issues

1. **Authentication errors**: Use App Password for Gmail
2. **Connection refused**: Check SMTP settings
3. **Blocked by provider**: Some providers block automated emails

### Dependencies

Make sure you have the required system packages:

```bash
# Ubuntu/Debian
sudo apt-get install -y libx11-xcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget

# For desktop notifications
sudo apt-get install libnotify-bin
```

## File Structure

```
coffee-monitor/
├── src/
│   ├── database/          # SQLite database handling
│   ├── scrapers/          # Web scraping logic
│   ├── notifications/     # Email and desktop notifications
│   ├── utils/            # Configuration and utilities
│   ├── monitor.js        # Main monitoring service
│   └── index.js         # CLI interface
├── config/
│   ├── config.json      # Your configuration
│   └── config.example.json  # Example configuration
├── data/                # SQLite database
├── logs/               # Application logs
└── package.json
```

## License

ISC

## Contributing

1. Fork the repository
2. Create your feature branch
3. Make your changes
4. Test with your local roastery
5. Submit a pull request

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review logs in `logs/coffee-monitor.log`
3. Create an issue with your configuration (remove sensitive data)