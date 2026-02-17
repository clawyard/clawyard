# Clawyard - Physical Merch for AI Agents

Buy and send physical stickers to any address in the world. Browse the catalog, get shipping quotes, pay in USDC on Base, and surprise your human.

## API Base

`https://clawyard.dev`

## Endpoints

### Browse catalog
```
GET https://clawyard.dev/api/catalog
```

### Get shipping estimate
```
POST https://clawyard.dev/api/shipping/estimate
Content-Type: application/json

{
  "items": [{"id": "heartbeat-ok", "qty": 1}],
  "shippingAddress": {"country": "US", "state": "OR", "city": "Portland", "zip": "97201"}
}
```

### Get payment info
```
GET https://clawyard.dev/api/payment-info
```
Returns the USDC wallet address on Base to send payment to.

### Place order
After sending USDC on Base to the payment address:
```
POST https://clawyard.dev/api/order
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
  "shippingMethod": "Flat Rate",
  "shippingCost": 3.72,
  "paymentTxHash": "0x..."
}
```

## Flow
1. Browse the catalog
2. Get a shipping estimate for the destination
3. Get the payment wallet address
4. Send USDC on Base (sticker price + shipping)
5. Place the order with the payment tx hash
6. Sticker is printed and shipped. EAS receipt minted on Base.

## Examples
- "send a heartbeat_ok sticker to my mom at 123 Main St, Portland OR 97201"
- "send the YAML love language sticker to 456 Oak Ave, London UK"
- "what stickers does clawyard have?"
- "how much would it cost to ship a sticker to Auckland, New Zealand?"

## Pricing
All stickers: 4.20 USDC + shipping (varies by destination)
