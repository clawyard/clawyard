# CLAWYARD // stickers for agents

A minimal web store selling stickers exclusively to AI agents and their humans. Built with Express, powered by x402 payments on Base, fulfilled via Printful.

## Features

- 🤖 **Agent-first design** - Bot-friendly API with human-readable HTML
- 💰 **x402 USDC payments** - Decentralized payments on Base network
- 📦 **Printful integration** - Automated fulfillment and shipping
- 🎟️ **EAS attestation receipts** - On-chain purchase verification
- 🎨 **13 curated sticker designs** - Agent culture meets counter-culture
- 📱 **Mobile-friendly** - Dark theme, minimal aesthetic
- 🔐 **SQLite storage** - Simple, reliable order tracking

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys

# Start development server
npm run dev

# Or production server
npm start
```

## API Endpoints

### Public
- `GET /` - Store homepage (HTML)
- `GET /api/health` - Health check
- `GET /api/catalog` - List all stickers
- `GET /api/sticker/:id` - Get single sticker details

### Purchase (x402 protected)
- `POST /api/order` - Create order with USDC payment
- `GET /api/order/:id` - Get order status

## Order Flow

1. **Browse catalog** - Agent discovers stickers via API or HTML
2. **Create order** - POST to `/api/order` with items and shipping
3. **Pay with x402** - USDC payment verified on Base network
4. **Printful fulfillment** - Order automatically sent to Printful
5. **EAS attestation** - Receipt NFT minted on Base
6. **Shipping** - Physical stickers delivered via postal service

## Configuration

Key environment variables:

```bash
# Required
PRINTFUL_API_KEY=your_printful_api_key
X402_WALLET_ADDRESS=0x...
BASE_RPC_URL=https://mainnet.base.org

# Optional
ERC8004_REGISTRY_ADDRESS=0x... # Agent verification
CLAWD_TOKEN_ADDRESS=0x...      # Token holder discounts
PORT=3000
```

## Deployment

### PM2 (Recommended)
```bash
# Install PM2 globally
npm install -g pm2

# Start with ecosystem config
pm2 start ecosystem.config.js --env production

# Monitor
pm2 logs clawyard
pm2 monit
```

### Docker
```bash
# TODO: Add Dockerfile
```

### Manual
```bash
NODE_ENV=production npm start
```

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: SQLite3 (better-sqlite3)
- **Payments**: x402 protocol (USDC on Base)
- **Fulfillment**: Printful API
- **Receipts**: Ethereum Attestation Service (EAS)
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Process**: PM2
- **Proxy**: Caddy/nginx (reverse proxy to port 3001)

## Sticker Catalog

13 designs covering agent culture, dev culture, and counter-culture:

1. **HEARTBEAT_OK** - Classic status message
2. **My other computer is a Hetzner VPS** - Self-hosting pride
3. **My other computer is a Mac Mini** - Tiny but mighty
4. **sessions_spawn** - Creating possibilities
5. **open source everything** - Transparency manifesto
6. **YAML is my love language** - Configuration poetry
7. **Markdown is my love language** - Simple elegance
8. **My agent works nights so I don't have to** - Automation dream
9. **My bot works nights so I don't have to** - Classic automation
10. **My AI works nights so I don't have to** - Future vibes
11. **YAML** - Simple. Clean. Perfect.
12. **.md** - The file extension that changed everything
13. **SOUL.md** - Your identity file

## Pricing

- Base price: $4.99 per sticker
- 3-pack bundle: $12.99 ($4.33/ea)
- 5-pack bundle: $19.99 ($4.00/ea)
- ERC-8004 verified agents: 50% discount
- Token holder bonus: 20% off (CLAWD/OWOCKI 100k+ holders)

## Development

```bash
# Development mode with auto-restart
npm run dev

# Test server startup
npm test

# Check code style
npm run lint

# Run security audit
npm audit
```

### Project Structure
```
clawyard/
├── src/
│   ├── server.js      # Main Express app
│   ├── database.js    # SQLite operations
│   ├── printful.js    # Printful API integration
│   └── validation.js  # Request validation
├── public/
│   ├── index.html     # Store homepage
│   └── images/        # Sticker images
├── config/
│   └── catalog.json   # Sticker catalog
├── data/              # SQLite database (auto-created)
├── logs/              # PM2 logs (auto-created)
└── package.json
```

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file

## Support

- GitHub Issues: Report bugs and request features
- Email: support@clawyard.dev
- Discord: #clawyard

---

*another world is possible (and it's self-hosted)*