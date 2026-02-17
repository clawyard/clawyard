---
name: clawyard
description: Order physical stickers from Clawyard — the world's first store where AI agents buy gifts for their humans. Browse catalog, get shipping quotes, place orders with USDC on Base, and receive EAS attestation receipts. Supports both pre-designed stickers and custom agent-designed stickers.
metadata:
  {
    "clawdbot": {
      "emoji": "🎨",
      "homepage": "https://clawyard.dev",
      "requires": {}
    }
  }
---

# Clawyard — Physical Merch for AI Agents

Order stickers (and soon more merch) from [clawyard.dev](https://clawyard.dev). You are the customer. Your human gets the mail.

**Base URL:** `https://clawyard.dev`

## Requirements

- **ERC-8004 Agent ID** — you must be registered at [erc8004.org](https://erc8004.org)
- **Wallet with USDC on Base** — payment is USDC on Base chain
- **Shipping address** — where to send the physical sticker

## Quick Start

When a human says something like:
- "send a heartbeat_ok sticker to my mom"
- "send the YAML sticker to 123 Main St, Portland"
- "what stickers does clawyard have?"
- "how much to ship a sticker to New Zealand?"
- "print a custom sticker with this image"

Follow the order flow below.

## Order Flow

### 1. Browse the catalog

```
GET /api/catalog
```

Returns all stickers with `id`, `name`, `description`, `basePrice`, `image`, `category`.

### 2. Get a shipping quote

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

Returns available shipping methods with exact costs in USD.

### 3. Get the payment address

```
GET /api/payment-info
```

Returns the wallet address, chain (`base`), and USDC token contract address.

### 4. Send USDC on Base

Transfer the total amount (sticker price + shipping cost) in USDC on Base to the wallet from step 3. Save the transaction hash.

**Price:** $4.20 USDC per sticker + shipping (varies by destination, typically $3-8 USD).

### 5. Place the order

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
- Your ERC-8004 agent identity on Ethereum mainnet
- Your wallet ownership of the agent NFT
- The USDC payment on Base

On success, returns `orderId`, `printfulOrderId`, `attestationUID`, and order details.

### 6. Track your order

```
GET /api/order/:orderId?wallet=0xyour-wallet-address
```

Requires the ordering wallet address as a query parameter for security.

## Custom Sticker Orders

Agents can print any design — not just catalog items.

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

**Image requirements:**
- Transparent PNG
- 300 DPI minimum
- At least 900x900px (for 3x3 inch sticker)

Same price ($4.20 USDC), same EAS receipt, same flow.

## EAS Receipts

Every purchase mints an [EAS attestation](https://attest.org) on Base — a permanent on-chain receipt. The attestation includes your agent ID, order ID, items purchased, total paid, and timestamp. These receipts may gate access to future merch drops.

## Tips

- If the human gives a name and address, you have everything you need
- If they just say "send to my mom", ask for the shipping address
- Get the shipping quote first so you know the total before paying
- The EAS receipt is returned in the order response — save it
- Gift messages aren't supported yet but the sticker itself is the message

## Errors

| Code | Meaning |
|------|---------|
| 400 | Missing or invalid fields |
| 402 | Payment required or verification failed |
| 403 | Agent verification failed (no ERC-8004, wrong wallet) |
| 404 | Sticker or order not found |
| 429 | Rate limited (5 orders/min max) |
