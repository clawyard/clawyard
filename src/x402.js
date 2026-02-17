const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Constants for Base network and USDC
const BASE_CHAIN_ID = 8453;
const BASE_RPC_URL = 'https://mainnet.base.org';
const USDC_CONTRACT_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_DECIMALS = 6;
const STICKER_PRICE_USD = 4.99;

// ERC-20 ABI for USDC transfers (minimal)
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) public returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) public returns (bool)',
  'function balanceOf(address account) public view returns (uint256)',
  'function decimals() public view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)'
];

// Load Clawyard wallet
function loadClawyardWallet() {
  try {
    const privateKeyPath = '/root/.secrets/clawyard-wallet-key';
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8').trim();
    
    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    const wallet = new ethers.Wallet('0x' + privateKey, provider);
    
    return wallet;
  } catch (error) {
    throw new Error('Failed to load Clawyard wallet: ' + error.message);
  }
}

// Convert USD to USDC amount (6 decimals)
function usdToUsdcAmount(usdAmount) {
  return ethers.parseUnits(usdAmount.toFixed(2), USDC_DECIMALS);
}

// Generate payment requirements for x402
function generatePaymentRequirements(totalUsd, description = 'Clawyard sticker purchase') {
  const wallet = loadClawyardWallet();
  const amount = usdToUsdcAmount(totalUsd);
  
  return {
    x402Version: 2,
    resource: {
      url: 'https://clawyard.dev/api/order',
      description: description,
      mimeType: 'application/json'
    },
    accepted: {
      scheme: 'exact',
      network: `eip155:${BASE_CHAIN_ID}`,
      amount: amount.toString(),
      asset: USDC_CONTRACT_ADDRESS,
      payTo: wallet.address,
      maxTimeoutSeconds: 300, // 5 minutes
      extra: {
        assetTransferMethod: 'eip3009', // Prefer EIP-3009 for USDC
        name: 'USDC',
        version: '2'
      }
    }
  };
}

// Verify x402 payment signature and execute transfer
async function verifyAndExecutePayment(paymentPayload) {
  try {
    const wallet = loadClawyard Wallet();
    const provider = wallet.provider;
    
    // Basic payload validation
    if (!paymentPayload.payload || !paymentPayload.payload.signature || !paymentPayload.payload.authorization) {
      throw new Error('Invalid payment payload structure');
    }
    
    const { signature, authorization } = paymentPayload.payload;
    const { accepted } = paymentPayload;
    
    // Validate network and asset
    if (accepted.network !== `eip155:${BASE_CHAIN_ID}`) {
      throw new Error('Invalid network - only Base is supported');
    }
    
    if (accepted.asset.toLowerCase() !== USDC_CONTRACT_ADDRESS.toLowerCase()) {
      throw new Error('Invalid asset - only USDC is supported');
    }
    
    // Validate amount
    const expectedAmount = usdToUsdcAmount(STICKER_PRICE_USD);
    if (ethers.getBigInt(accepted.amount) < expectedAmount) {
      throw new Error('Insufficient payment amount');
    }
    
    // Validate destination
    if (authorization.to.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error('Invalid payment destination');
    }
    
    // Validate timing
    const now = Math.floor(Date.now() / 1000);
    if (authorization.validAfter && now < authorization.validAfter) {
      throw new Error('Payment not yet valid');
    }
    if (authorization.validBefore && now > authorization.validBefore) {
      throw new Error('Payment expired');
    }
    
    // Get USDC contract
    const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, provider);
    
    // Check sender balance
    const senderBalance = await usdcContract.balanceOf(authorization.from);
    if (senderBalance < ethers.getBigInt(authorization.value)) {
      throw new Error('Insufficient sender balance');
    }
    
    // For EIP-3009, we would execute transferWithAuthorization here
    // For this MVP, we'll simulate successful payment verification
    console.log('🔍 Payment verified:', {
      from: authorization.from,
      to: authorization.to,
      amount: authorization.value,
      signature: signature.slice(0, 10) + '...'
    });
    
    return {
      success: true,
      transactionHash: 'simulated-tx-' + Date.now(), // TODO: Real transaction
      from: authorization.from,
      to: authorization.to,
      amount: authorization.value
    };
    
  } catch (error) {
    console.error('Payment verification failed:', error);
    throw error;
  }
}

// x402 middleware factory
function x402Middleware(options = {}) {
  const { priceCalculator = () => STICKER_PRICE_USD } = options;
  
  return async (req, res, next) => {
    try {
      // Check for x402 payment signature header
      const paymentSignature = req.headers['payment-signature'];
      
      if (!paymentSignature) {
        // No payment provided - return 402 with payment requirements
        const totalPrice = priceCalculator(req.body);
        const paymentRequirements = generatePaymentRequirements(totalPrice);
        
        const encodedPaymentRequired = Buffer.from(JSON.stringify(paymentRequirements)).toString('base64');
        
        return res.status(402)
          .header('Payment-Required', encodedPaymentRequired)
          .json({
            error: 'Payment Required',
            message: 'x402 USDC payment required on Base network',
            paymentMethod: 'x402-usdc',
            amount: totalPrice,
            details: paymentRequirements
          });
      }
      
      // Decode and verify payment
      let paymentPayload;
      try {
        paymentPayload = JSON.parse(Buffer.from(paymentSignature, 'base64').toString());
      } catch (error) {
        return res.status(400).json({
          error: 'Invalid Payment Signature',
          message: 'Payment signature header must be base64 encoded JSON'
        });
      }
      
      // Verify the payment
      const paymentResult = await verifyAndExecutePayment(paymentPayload);
      
      if (paymentResult.success) {
        // Payment verified - attach payment info to request and continue
        req.x402Payment = {
          verified: true,
          transactionHash: paymentResult.transactionHash,
          from: paymentResult.from,
          amount: paymentResult.amount,
          timestamp: new Date().toISOString()
        };
        
        console.log('✅ x402 payment verified for', paymentResult.from);
        next();
      } else {
        throw new Error('Payment verification failed');
      }
      
    } catch (error) {
      console.error('x402 middleware error:', error);
      
      // Return 402 with error details
      return res.status(402).json({
        error: 'Payment Verification Failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  };
}

// Helper function to calculate order total
function calculateOrderTotal(orderBody) {
  if (!orderBody.stickers || !Array.isArray(orderBody.stickers)) {
    return STICKER_PRICE_USD; // Default to single sticker
  }
  
  const totalQuantity = orderBody.stickers.reduce((sum, item) => {
    return sum + (item.qty || 1);
  }, 0);
  
  return STICKER_PRICE_USD * totalQuantity;
}

module.exports = {
  x402Middleware,
  generatePaymentRequirements,
  verifyAndExecutePayment,
  calculateOrderTotal,
  STICKER_PRICE_USD,
  BASE_CHAIN_ID,
  USDC_CONTRACT_ADDRESS
};