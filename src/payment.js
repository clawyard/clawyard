const { createPublicClient, http, parseAbi, formatUnits } = require('viem');
const { base } = require('viem/chains');

// USDC on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_DECIMALS = 6;

// Clawyard receiving wallet - set via env or use default
const CLAWYARD_WALLET = process.env.CLAWYARD_WALLET || '0x80370645C98f05Ad86BdF676FaE54afCDBF5BC10';

const ERC20_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)'
]);

const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
});

/**
 * Verify a USDC payment on Base
 * @param {string} txHash - Transaction hash
 * @param {number} expectedAmountUSD - Expected payment amount in USD
 * @param {number} tolerancePercent - Acceptable tolerance (default 1%)
 * @returns {Promise<Object>} Payment verification result
 */
async function verifyPayment(txHash, expectedAmountUSD, tolerancePercent = 1) {
  try {
    // Get transaction receipt
    const receipt = await client.getTransactionReceipt({ hash: txHash });

    if (!receipt) {
      return { verified: false, error: 'Transaction not found' };
    }

    if (receipt.status !== 'success') {
      return { verified: false, error: 'Transaction failed' };
    }

    // Find USDC Transfer event to our wallet
    const transferLog = receipt.logs.find(log => {
      if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) return false;

      try {
        // Check if it's a Transfer event to our wallet
        // Transfer topic0: keccak256("Transfer(address,address,uint256)")
        const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        if (log.topics[0] !== TRANSFER_TOPIC) return false;

        // topics[2] is the 'to' address (padded to 32 bytes)
        const toAddress = '0x' + log.topics[2].slice(26);
        return toAddress.toLowerCase() === CLAWYARD_WALLET.toLowerCase();
      } catch {
        return false;
      }
    });

    if (!transferLog) {
      return { verified: false, error: 'No USDC transfer to Clawyard wallet found in transaction' };
    }

    // Decode the amount from data field
    const amountRaw = BigInt(transferLog.data);
    const amountUSD = parseFloat(formatUnits(amountRaw, USDC_DECIMALS));

    // Check amount within tolerance
    const minAmount = expectedAmountUSD * (1 - tolerancePercent / 100);
    const maxAmount = expectedAmountUSD * (1 + tolerancePercent / 100);

    if (amountUSD < minAmount) {
      return {
        verified: false,
        error: `Insufficient payment: expected $${expectedAmountUSD.toFixed(2)}, received $${amountUSD.toFixed(2)}`,
        amount: amountUSD,
        from: '0x' + transferLog.topics[1].slice(26),
      };
    }

    // Extract sender
    const from = '0x' + transferLog.topics[1].slice(26);

    return {
      verified: true,
      from,
      amount: amountUSD,
      transactionHash: txHash,
      blockNumber: Number(receipt.blockNumber),
      timestamp: Math.floor(Date.now() / 1000), // We could fetch block timestamp but this is close enough
    };

  } catch (error) {
    console.error('Payment verification error:', error);
    return { verified: false, error: `Verification failed: ${error.message}` };
  }
}

/**
 * Get the Clawyard receiving wallet address
 */
function getPaymentAddress() {
  return CLAWYARD_WALLET;
}

module.exports = {
  verifyPayment,
  getPaymentAddress,
  USDC_ADDRESS,
  CLAWYARD_WALLET,
};
