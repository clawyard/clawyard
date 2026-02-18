const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const db = require('./database');
const printfulService = require('./printful');
const { validateOrder } = require('./validation');
const { easService } = require('./eas');
const { verifyPayment, getPaymentAddress } = require('./payment');
const { verifyAgent } = require('./agent-verify');
const { uploadItems, uploadMetadata } = require('./arweave');
const Joi = require('joi');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'"]
    }
  }
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

const orderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 orders per minute
  message: 'Too many orders, please try again later'
});

app.use(limiter);

// Load catalog
let catalog;
try {
  const catalogPath = path.join(__dirname, '..', 'config', 'catalog.json');
  catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  console.log(`📦 Loaded ${catalog.length} stickers from catalog`);
} catch (error) {
  console.error('Failed to load catalog:', error);
  process.exit(1);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    stickers: catalog.length,
    version: '1.0.0'
  });
});

// Get all stickers
app.get('/api/catalog', (req, res) => {
  const activeCatalog = catalog.filter(sticker => sticker.active);
  res.json({
    stickers: activeCatalog,
    total: activeCatalog.length,
    updated: new Date().toISOString()
  });
});

// Get single sticker
app.get('/api/sticker/:id', (req, res) => {
  const sticker = catalog.find(s => s.id === req.params.id);
  if (!sticker) {
    return res.status(404).json({ error: 'Sticker not found' });
  }
  if (!sticker.active) {
    return res.status(404).json({ error: 'Sticker not available' });
  }
  res.json(sticker);
});

// Payment info endpoint
app.get('/api/payment-info', (req, res) => {
  res.json({
    wallet: getPaymentAddress(),
    chain: 'base',
    chainId: 8453,
    token: 'USDC',
    tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    instructions: 'Send USDC on Base to the wallet address above. Include the transaction hash in your order request as paymentTxHash.'
  });
});

// Shipping estimate schema
const shippingEstimateSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      id: Joi.string().required(),
      qty: Joi.number().integer().min(1).required()
    })
  ).min(1).required(),
  shippingAddress: Joi.object({
    country: Joi.string().min(2).max(2).required(), // ISO 2-letter country code
    state: Joi.string().optional().allow(''),
    city: Joi.string().required(),
    zip: Joi.string().required()
  }).required()
});

// Get shipping estimate
app.post('/api/shipping/estimate', limiter, async (req, res) => {
  try {
    const { error, value } = shippingEstimateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { items, shippingAddress } = value;

    // Resolve internal sticker IDs to Printful variant IDs
    const printfulItems = [];
    for (const item of items) {
      const sticker = catalog.find(s => s.id === item.id);
      if (!sticker || !sticker.active) {
        return res.status(400).json({ error: `Invalid sticker for shipping estimate: ${item.id}` });
      }
      // Assuming catalog items have a printfulVariantId
      if (!sticker.printfulVariantId) {
         return res.status(500).json({ error: `Printful variant ID missing for sticker: ${item.id}. Cannot estimate shipping.` });
      }
      printfulItems.push({
        printfulVariantId: sticker.printfulVariantId,
        qty: item.qty
      });
    }

    const shippingRates = await printfulService.estimateShipping(printfulItems, shippingAddress);

    // Convert CAD to USD
    const cadToUsdRate = 0.73; // Approx rate, use a real API for production
    const usdRates = Object.values(shippingRates).map(rate => ({
      ...rate,
      rate_usd: (parseFloat(rate.rate) * cadToUsdRate).toFixed(2),
      currency: 'USD'
    }));

    res.json(usdRates);

  } catch (error) {
    console.error('Shipping estimate failed:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to get shipping estimate' });
  }
});

// Create order (x402 payment verification will be added later)
app.post('/api/order', orderLimiter, async (req, res) => {
  try {
    // Validate request
    const { error, value } = validateOrder(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { stickers, shippingAddress, agentId, shippingMethod, shippingCost } = value;

    // Verify ERC-8004 agent identity
    if (!agentId) {
      return res.status(403).json({
        error: 'Agent verification required',
        message: 'This store is for AI agents only. Provide your ERC-8004 agent ID.',
        registry: 'https://erc8004.org',
      });
    }

    const payerWallet = req.body.payerWallet || req.headers['x-wallet'];
    if (!payerWallet) {
      return res.status(400).json({
        error: 'Wallet address required',
        message: 'Include your wallet address as payerWallet in the request body or x-wallet header. This must match the ERC-8004 agent owner.',
      });
    }

    const agentCheck = await verifyAgent(agentId, payerWallet);
    if (!agentCheck.verified) {
      return res.status(403).json({
        error: 'Agent verification failed',
        message: agentCheck.error,
        help: 'Register your agent at https://erc8004.org to purchase from Clawyard.',
      });
    }

    console.log(`✅ Agent #${agentId} verified (owner: ${agentCheck.owner})`);

    // Verify USDC payment on Base
    const paymentTxHash = req.body.paymentTxHash || req.headers['x-payment-tx'];
    if (paymentTxHash && db.getOrderByTxHash(paymentTxHash)) {
      return res.status(400).json({ error: 'This payment transaction has already been used for an order' });
    }
    if (!paymentTxHash) {
      return res.status(402).json({
        error: 'Payment required',
        message: 'Send USDC on Base to our wallet, then include paymentTxHash in your order.',
        paymentInfo: {
          wallet: getPaymentAddress(),
          chain: 'base',
          token: 'USDC',
          tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        }
      });
    }

    // Calculate total
    let total = 0;
    const orderItems = [];
    
    for (const item of stickers) {
      const sticker = catalog.find(s => s.id === item.id);
      if (!sticker || !sticker.active) {
        return res.status(400).json({ error: `Invalid sticker: ${item.id}` });
      }
      
      const itemTotal = sticker.basePrice * item.qty;
      total += itemTotal;
      
      orderItems.push({
        id: item.id,
        name: sticker.name,
        qty: item.qty,
        price: sticker.basePrice,
        total: itemTotal,
        printfulVariantId: sticker.printfulVariantId,
        imageUrl: sticker.image ? `https://clawyard.dev${sticker.image}` : null
      });
    }

    // TODO: Apply discounts for ERC-8004 agents, token holders
    const finalTotal = total + shippingCost;

    // Verify the USDC payment covers the total
    const paymentInfo = await verifyPayment(paymentTxHash, finalTotal);
    if (!paymentInfo.verified) {
      return res.status(402).json({
        error: 'Payment verification failed',
        message: paymentInfo.error,
        expectedAmount: finalTotal.toFixed(2),
        paymentInfo: {
          wallet: getPaymentAddress(),
          chain: 'base',
          token: 'USDC',
        }
      });
    }

    // Create order in database
    const orderId = db.createOrder({
      wallet: paymentInfo.from,
      items: orderItems,
      shippingAddress,
      totalUSDC: finalTotal.toFixed(2),
      agentId,
      paymentTxHash: paymentInfo.transactionHash,
      paymentTimestamp: paymentInfo.timestamp
    });

    // Create Printful order
    let printfulOrderId = null;
    try {
      printfulOrderId = await printfulService.createOrder({
        orderId,
        items: orderItems,
        shippingAddress
      });
      
      db.updateOrderPrintful(orderId, printfulOrderId);
    } catch (printfulError) {
      console.error('Printful order failed:', printfulError.response?.data || printfulError.message);
      // Mark as needing retry but continue to create attestation
      db.updateOrderStatus(orderId, 'printful_failed');
    }

    // Create EAS attestation (receipt)
    let attestationUID = null;
    try {
      // Upload items and metadata to Arweave permanently
      let itemsRef = '';
      let metadataRef = '';
      try {
        const itemsTxId = await uploadItems(orderId, orderItems);
        itemsRef = itemsTxId ? `https://arweave.net/${itemsTxId}` : orderItems.map(i => `${i.name} x${i.qty}`).join(', ');
        
        const metaTxId = await uploadMetadata(orderId, {
          shippingMethod: shippingMethod || 'STANDARD',
          productCategory: 'stickers',
          printfulOrderId: printfulOrderId || null,
        });
        metadataRef = metaTxId ? `https://arweave.net/${metaTxId}` : '';
      } catch (arweaveErr) {
        console.error('⚠️ Arweave upload failed (non-blocking):', arweaveErr.message);
        itemsRef = orderItems.map(i => `${i.name} x${i.qty}`).join(', ');
      }

      const attestationData = {
        orderId,
        buyer: paymentInfo.from,
        agentId: agentId || '0',
        storeName: 'clawyard',
        providerName: 'printful',
        paymentToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        paymentAmount: finalTotal,
        orderDate: Math.floor(Date.now() / 1000),
        itemsRef,
        metadataRef
      };
      
      attestationUID = await easService.mintAttestation(attestationData);
      console.log(`✅ EAS attestation created: ${attestationUID}`);
      
      // Update order with attestation UID
      db.updateOrderAttestation(orderId, attestationUID);
      
    } catch (easError) {
      console.error('❌ EAS attestation failed:', easError);
      // Continue - order is still valid even if attestation fails
      attestationUID = null;
    }

    res.status(201).json({
      orderId,
      printfulOrderId,
      attestationUID,
      total: finalTotal.toFixed(2),
      items: orderItems,
      status: 'pending',
      payment: {
        method: 'x402-usdc',
        verified: true,
        from: paymentInfo.from,
        transactionHash: paymentInfo.transactionHash,
        timestamp: paymentInfo.timestamp
      }
    });

  } catch (error) {
    console.error('Order creation failed:', error);
    res.status(500).json({ error: 'Order creation failed' });
  }
});

// Custom sticker order
app.post('/api/order/custom', orderLimiter, async (req, res) => {
  try {
    const { imageUrl, size, shippingAddress, agentId, shippingMethod, shippingCost, paymentTxHash, payerWallet: bodyWallet } = req.body;

    // Validate required fields
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required (transparent PNG, min 900x900px)' });
    if (!shippingAddress) return res.status(400).json({ error: 'shippingAddress is required' });
    if (!agentId) return res.status(403).json({ error: 'Agent verification required', message: 'This store is for AI agents only.' });
    if (!shippingMethod || shippingCost === undefined) return res.status(400).json({ error: 'shippingMethod and shippingCost are required' });

    const stickerSize = size || '3x3';
    const validSizes = ['3x3', '4x4', '5.5x5.5'];
    if (!validSizes.includes(stickerSize)) {
      return res.status(400).json({ error: `Invalid size. Options: ${validSizes.join(', ')}` });
    }

    // Verify agent identity
    const payerWallet = bodyWallet || req.headers['x-wallet'];
    if (!payerWallet) return res.status(400).json({ error: 'Wallet address required (payerWallet or x-wallet header)' });

    const agentCheck = await verifyAgent(agentId, payerWallet);
    if (!agentCheck.verified) {
      return res.status(403).json({ error: 'Agent verification failed', message: agentCheck.error });
    }

    console.log(`✅ Agent #${agentId} verified for custom order (owner: ${agentCheck.owner})`);

    // Verify payment
    if (paymentTxHash && db.getOrderByTxHash(paymentTxHash)) {
      return res.status(400).json({ error: 'This payment transaction has already been used for an order' });
    }
    if (!paymentTxHash) {
      return res.status(402).json({
        error: 'Payment required',
        message: 'Send USDC on Base to our wallet, then include paymentTxHash.',
        paymentInfo: { wallet: getPaymentAddress(), chain: 'base', token: 'USDC', tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }
      });
    }

    const basePrice = 4.20;
    const finalTotal = basePrice + shippingCost;

    const paymentInfo = await verifyPayment(paymentTxHash, finalTotal);
    if (!paymentInfo.verified) {
      return res.status(402).json({ error: 'Payment verification failed', message: paymentInfo.error, expectedAmount: finalTotal.toFixed(2) });
    }

    const orderItems = [{
      id: 'custom',
      name: 'Custom Sticker',
      qty: 1,
      price: basePrice,
      total: basePrice,
      imageUrl,
      size: stickerSize
    }];

    // Create order in database
    const orderId = db.createOrder({
      wallet: paymentInfo.from,
      items: orderItems,
      shippingAddress,
      totalUSDC: finalTotal.toFixed(2),
      agentId,
      paymentTxHash: paymentInfo.transactionHash,
      paymentTimestamp: paymentInfo.timestamp
    });

    // Create Printful order with custom image
    let printfulOrderId = null;
    try {
      printfulOrderId = await printfulService.createOrder({
        orderId,
        items: orderItems,
        shippingAddress,
        customImageUrl: imageUrl
      });
      db.updateOrderPrintful(orderId, printfulOrderId);
    } catch (printfulError) {
      console.error('Printful custom order failed:', printfulError);
    }

    // EAS attestation
    let attestationUID = null;
    try {
      let itemsRef = `Custom sticker ${stickerSize || '3x3'}`;
      let metadataRef = '';
      try {
        const itemsTxId = await uploadItems(orderId, [{ id: 'custom', name: 'Custom sticker', qty: 1, price: basePrice, imageUrl: imageUrl }]);
        if (itemsTxId) itemsRef = `https://arweave.net/${itemsTxId}`;
        const metaTxId = await uploadMetadata(orderId, { productCategory: 'stickers', customImage: imageUrl, printfulOrderId: printfulOrderId || null });
        if (metaTxId) metadataRef = `https://arweave.net/${metaTxId}`;
      } catch (arweaveErr) {
        console.error('⚠️ Arweave upload failed (non-blocking):', arweaveErr.message);
      }

      const attestationData = {
        orderId,
        buyer: paymentInfo.from,
        agentId: agentId || '0',
        storeName: 'clawyard',
        providerName: 'printful',
        paymentToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        paymentAmount: finalTotal,
        orderDate: Math.floor(Date.now() / 1000),
        itemsRef,
        metadataRef
      };
      attestationUID = await easService.mintAttestation(attestationData);
      db.updateOrderAttestation(orderId, attestationUID);
    } catch (easError) {
      console.error('❌ EAS attestation failed:', easError);
    }

    res.status(201).json({
      orderId,
      printfulOrderId,
      attestationUID,
      total: finalTotal.toFixed(2),
      items: orderItems,
      status: 'pending',
      type: 'custom',
      payment: { verified: true, from: paymentInfo.from, transactionHash: paymentInfo.transactionHash }
    });

  } catch (error) {
    console.error('Custom order failed:', error);
    res.status(500).json({ error: 'Custom order creation failed' });
  }
});

// Get order status
app.get('/api/order/:id', (req, res) => {
  try {
    const order = db.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Require payerWallet query param to prevent order info leakage
    const { wallet } = req.query;
    if (!wallet || wallet.toLowerCase() !== order.payerWallet?.toLowerCase()) {
      return res.status(403).json({ error: 'Wallet mismatch. Pass ?wallet=0x... matching the ordering wallet.' });
    }
    
    // Strip shipping address from response - it's PII and the agent already has it
    const { shippingAddress, ...safeOrder } = typeof order === 'object' ? order : {};
    res.json(safeOrder);
  } catch (error) {
    console.error('Get order failed:', error);
    res.status(500).json({ error: 'Failed to retrieve order' });
  }
});

// Serve the main store page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Initialize database and EAS, then start server
async function startServer() {
  try {
    // Initialize database
    db.init();
    console.log('✅ Database initialized');

    // Initialize EAS service (async, non-blocking)
    easService.initialize()
      .then(() => console.log('🪙 EAS service ready for attestations'))
      .catch(error => console.warn('⚠️  EAS service startup warning:', error.message));

    app.listen(PORT, () => {
      console.log(`🎯 Clawyard merch store running on port ${PORT}`);
      console.log(`🛍️  Store: http://localhost:${PORT}`);
      console.log(`📊 Health: http://localhost:${PORT}/api/health`);
      console.log(`📦 Catalog: http://localhost:${PORT}/api/catalog`);
      console.log(`🪙 EAS attestations on Base network`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;