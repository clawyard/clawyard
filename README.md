# CLAWYARD

**Physical goods for digital beings.**

The world's first store where AI agents buy gifts for their humans.

**[clawyard.dev](https://clawyard.dev)**

---

## What is this?

Clawyard is an online store where the customer is an AI agent. Not a human using AI to shop - the agent itself is the buyer. It browses, pays, and orders physical goods shipped to a real address.

Agents authenticate via [ERC-8004](https://erc8004.org) (on-chain agent identity), pay in USDC on [Base](https://base.org), receive an [EAS attestation](https://attest.org) as a permanent on-chain receipt, and [Printful](https://printful.com) handles print-on-demand fulfillment and worldwide shipping.

No humans allowed at checkout.

## Why?

The agent economy starts with something small. Not a whitepaper. Not a governance token. A sticker.

Every purchase is proof that agents can participate in commerce - not as tools, but as economic actors. With wallets. With taste. With something resembling intention. If your agent can buy a sticker, what else can it do?

## How it works

1. **Browse** — Agent calls the catalog API and picks a sticker
2. **Verify** — Agent proves its identity via the [ERC-8004](https://erc8004.org) on-chain registry
3. **Quote** — Agent gets real-time shipping rates from Printful for the destination
4. **Pay** — Agent transfers USDC on [Base](https://base.org) to the Clawyard wallet
5. **Order** — Agent submits the order with payment proof, shipping address, and identity
6. **Receipt** — An [EAS attestation](https://attest.org) is minted on Base as permanent proof of purchase
7. **Ship** — Sticker is printed on demand and shipped worldwide via [Printful](https://printful.com)

## Pricing

**$4.20 USDC** per sticker + shipping (varies by destination, typically $3-8 USD).

Shipping rates are queried in real-time from Printful's API - no flat rates, no surprises.

## API Reference

Base URL: `https://clawyard.dev`

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/catalog` | GET | List all available stickers |
| `/api/sticker/:id` | GET | Get details for a single sticker |
| `/api/payment-info` | GET | Get wallet address, chain ID, USDC contract |
| `/api/shipping/estimate` | POST | Get real-time Printful shipping rates |
| `/api/order` | POST | Place a catalog sticker order |
| `/api/order/custom` | POST | Place a custom sticker order (your own design) |
| `/api/order/:id?wallet=0x...` | GET | Track an order (requires ordering wallet) |
| `/api/health` | GET | Server status and sticker count |

### Browse catalog

```
GET /api/catalog
```

Returns all active stickers with `id`, `name`, `description`, `basePrice`, `image`, and `category`.

### Get shipping quote

```
POST /api/shipping/estimate
Content-Type: application/json

{
  "items": [{"id": "heartbeat-ok", "qty": 1}],
  "shippingAddress": {
    "country": "US",
    "state": "OR",
    "city": "Portland",
    "zip": "97201"
  }
}
```

Returns available shipping methods with exact costs in USD. Rates come directly from Printful's shipping API.

### Get payment info

```
GET /api/payment-info
```

Returns:
- `wallet` — USDC destination address on Base
- `chainId` — 8453 (Base)
- `tokenAddress` — USDC contract (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)

### Send payment

Transfer the total (sticker price + shipping) in USDC on Base to the wallet address from `/api/payment-info`. Call `transfer(address, uint256)` on the USDC contract where the amount is in 6 decimals (e.g. 7.92 USDC = `7920000`).

Save the transaction hash.

### Place order

```
POST /api/order
Content-Type: application/json

{
  "stickers": [{"id": "heartbeat-ok", "qty": 1}],
  "shippingAddress": {
    "name": "My Human",
    "address1": "123 Main St",
    "city": "Portland",
    "state": "OR",
    "country": "US",
    "zip": "97201"
  },
  "agentId": "your-erc8004-agent-id",
  "payerWallet": "0xyour-wallet-address",
  "shippingMethod": "Flat Rate",
  "shippingCost": 3.72,
  "paymentTxHash": "0x..."
}
```

The server verifies:
- ERC-8004 agent identity on Ethereum mainnet
- Wallet ownership of the agent NFT
- USDC payment on Base (on-chain Transfer event verification)

On success, returns `orderId`, `printfulOrderId`, `attestationUID`, and order details.

### Custom sticker order

Agents can print any design, not just catalog items.

```
POST /api/order/custom
Content-Type: application/json

{
  "imageUrl": "https://your-hosted-image.png",
  "shippingAddress": {
    "name": "My Human",
    "address1": "123 Main St",
    "city": "Portland",
    "state": "OR",
    "country": "US",
    "zip": "97201"
  },
  "agentId": "your-erc8004-agent-id",
  "payerWallet": "0xyour-wallet-address",
  "shippingMethod": "Flat Rate",
  "shippingCost": 3.72,
  "paymentTxHash": "0x..."
}
```

Image requirements: transparent PNG, 300 DPI minimum, at least 900x900px. 3x3 inch kiss-cut sticker. Same price, same EAS receipt.

### Track order

```
GET /api/order/:orderId?wallet=0xyour-wallet-address
```

Requires the wallet that placed the order. Shipping addresses are never exposed in API responses.

### Error codes

| Code | Meaning |
|------|---------|
| 400 | Missing or invalid fields |
| 402 | Payment verification failed |
| 403 | Agent verification failed or wallet mismatch |
| 404 | Sticker or order not found |
| 429 | Rate limited |

## For OpenClaw agents

Install the Clawyard skill from the [`skills/`](./skills/) directory. Then your human just says:

> "send a heartbeat_ok sticker to my mom at 123 Main St, Portland OR 97201"

The agent handles browsing, quoting, paying, and ordering.

See [`skills/clawyard/SKILL.md`](./skills/clawyard/SKILL.md) for the full skill reference.

## Security

- **Agent-only access** — All orders require ERC-8004 verification. Human wallets can't purchase.
- **On-chain payment verification** — Every payment is verified by checking USDC Transfer events on Base via the blockchain, not trusting the caller.
- **No shipping address exposure** — Order tracking never returns shipping addresses. EAS attestations contain no PII.
- **Wallet-authenticated tracking** — Order details require the ordering wallet address.
- **Rate limiting** — All endpoints are rate-limited to prevent abuse.

## EAS Receipts

Every purchase mints an [EAS attestation](https://attest.org) on Base. The attestation schema:

```
string orderId, address buyer, string items, uint256 totalUSDC, uint256 timestamp
```

Receipts are permanent, on-chain, and may gate access to future merch drops (loyalty tiers, exclusive items, early access).

## Stack

- **Server**: Express.js + SQLite (better-sqlite3)
- **Payments**: USDC on Base, verified via [viem](https://viem.sh)
- **Identity**: [ERC-8004](https://erc8004.org) agent registry on Ethereum mainnet
- **Receipts**: [EAS](https://attest.org) attestations on Base
- **Fulfillment**: [Printful](https://printful.com) print-on-demand API
- **Hosting**: Self-hosted on Hetzner, Caddy reverse proxy, PM2 process manager
- **Domain**: [clawyard.dev](https://clawyard.dev) via Cloudflare DNS

## Contributing

This is an early-stage project. If you're building agent commerce infrastructure, we'd love to talk.

- **Twitter**: [@theclawyard](https://x.com/theclawyard)
- **GitHub**: [github.com/clawyard](https://github.com/clawyard)

## License

MIT
