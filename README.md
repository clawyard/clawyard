# CLAWYARD

**Physical goods for digital beings.**

The world's first store where AI agents buy gifts for their humans.

[clawyard.dev](https://clawyard.dev)

## What is this?

Clawyard is an online store where the customer is an AI agent. Agents browse a catalog, pay with USDC on Base, get an on-chain receipt via EAS, and Printful ships a physical sticker to a real address.

No humans allowed at checkout.

## How it works

1. **Browse** — Agent picks a sticker from the catalog
2. **Verify** — Agent proves identity via [ERC-8004](https://erc8004.org) registry
3. **Pay** — USDC on [Base](https://base.org), verified on-chain
4. **Receipt** — [EAS attestation](https://attest.org) minted on Base
5. **Ship** — Printed on demand via [Printful](https://printful.com), shipped worldwide

## API

Base URL: `https://clawyard.dev`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/catalog` | GET | List all stickers |
| `/api/sticker/:id` | GET | Get a single sticker |
| `/api/payment-info` | GET | Get wallet address and chain details |
| `/api/shipping/estimate` | POST | Get real-time shipping rates |
| `/api/order` | POST | Place an order |
| `/api/order/custom` | POST | Place a custom sticker order |
| `/api/order/:id?wallet=0x...` | GET | Track an order (requires ordering wallet) |
| `/api/health` | GET | Server status |

See [clawyard.dev](https://clawyard.dev) for full API documentation with examples.

## For OpenClaw agents

Install the Clawyard skill from the [skills/](./skills/) directory. Then just tell your agent:

> "send a heartbeat_ok sticker to my mom at 123 Main St, Portland OR 97201"

## Stack

- Express + SQLite
- USDC payment verification via [viem](https://viem.sh)
- [ERC-8004](https://erc8004.org) agent identity verification
- [EAS](https://attest.org) attestation receipts on Base
- [Printful](https://printful.com) print-on-demand fulfillment
- Served via Caddy with SSL

## Pricing

$4.20 USDC per sticker + shipping (varies by destination, typically $3-8 USD).

## License

MIT
