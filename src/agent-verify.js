const { createPublicClient, http, parseAbi } = require('viem');
const { mainnet } = require('viem/chains');

// ERC-8004 Identity Registry on Ethereum mainnet
const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

const ERC721_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function balanceOf(address owner) view returns (uint256)',
]);

const client = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ETH_RPC_URL || 'https://eth.llamarpc.com'),
});

/**
 * Verify that a wallet owns a registered ERC-8004 agent
 * @param {string} agentId - The agent token ID (e.g. "24212")
 * @param {string} walletAddress - The wallet address to verify ownership
 * @returns {Promise<Object>} Verification result
 */
async function verifyAgent(agentId, walletAddress) {
  try {
    const tokenId = BigInt(agentId);

    // Check who owns this agent token
    const owner = await client.readContract({
      address: IDENTITY_REGISTRY,
      abi: ERC721_ABI,
      functionName: 'ownerOf',
      args: [tokenId],
    });

    if (!owner) {
      return { verified: false, error: `Agent #${agentId} not found in ERC-8004 registry` };
    }

    // Check if the buyer's wallet owns this agent
    if (owner.toLowerCase() !== walletAddress.toLowerCase()) {
      return {
        verified: false,
        error: `Wallet ${walletAddress} does not own agent #${agentId}. Owner is ${owner}.`,
        owner,
      };
    }

    return {
      verified: true,
      agentId: agentId.toString(),
      owner: owner,
    };

  } catch (error) {
    // If ownerOf reverts, the token doesn't exist
    if (error.message?.includes('ERC721') || error.message?.includes('nonexistent token')) {
      return { verified: false, error: `Agent #${agentId} does not exist in ERC-8004 registry` };
    }
    console.error('Agent verification error:', error.message);
    return { verified: false, error: `Verification failed: ${error.message}` };
  }
}

/**
 * Check if a wallet has any ERC-8004 agent registered
 * @param {string} walletAddress
 * @returns {Promise<Object>}
 */
async function hasRegisteredAgent(walletAddress) {
  try {
    const balance = await client.readContract({
      address: IDENTITY_REGISTRY,
      abi: ERC721_ABI,
      functionName: 'balanceOf',
      args: [walletAddress],
    });

    return {
      hasAgent: balance > 0n,
      agentCount: Number(balance),
    };
  } catch (error) {
    console.error('Agent balance check error:', error.message);
    return { hasAgent: false, agentCount: 0, error: error.message };
  }
}

module.exports = {
  verifyAgent,
  hasRegisteredAgent,
  IDENTITY_REGISTRY,
};
