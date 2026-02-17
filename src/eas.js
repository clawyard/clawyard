const { EAS, SchemaEncoder, SchemaRegistry } = require('@ethereum-attestation-service/eas-sdk');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Base network configuration
const BASE_RPC = 'https://mainnet.base.org';
const EAS_CONTRACT_ADDRESS = '0x4200000000000000000000000000000000000021';
const SCHEMA_REGISTRY_ADDRESS = '0x4200000000000000000000000000000000000020';
const WALLET_KEY_PATH = '/root/.secrets/clawyard-wallet.json';

// Schema definition for ClawyardPurchase
const CLAWYARD_SCHEMA = 'string orderId, address buyer, string items, uint256 totalUSDC, uint256 timestamp';

class EASService {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.eas = null;
    this.schemaRegistry = null;
    this.schemaUID = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize provider
      this.provider = new ethers.JsonRpcProvider(BASE_RPC);

      // Load wallet key
      const walletKey = await this.loadWalletKey();
      this.signer = new ethers.Wallet(walletKey, this.provider);

      // Initialize EAS
      this.eas = new EAS(EAS_CONTRACT_ADDRESS);
      this.eas.connect(this.signer);

      // Initialize Schema Registry
      this.schemaRegistry = new SchemaRegistry(SCHEMA_REGISTRY_ADDRESS);
      this.schemaRegistry.connect(this.signer);

      this.initialized = true;
      console.log('✅ EAS service initialized on Base network');
      console.log(`🔑 Wallet address: ${await this.signer.getAddress()}`);

    } catch (error) {
      console.error('❌ Failed to initialize EAS service:', error);
      throw error;
    }
  }

  async loadWalletKey() {
    try {
      // Try env var first
      if (process.env.CLAWYARD_PRIVATE_KEY) {
        return process.env.CLAWYARD_PRIVATE_KEY;
      }
      // Fall back to file
      if (fs.existsSync(WALLET_KEY_PATH)) {
        const keyData = fs.readFileSync(WALLET_KEY_PATH, 'utf8').trim();
        if (keyData.startsWith('{')) {
          const parsed = JSON.parse(keyData);
          return parsed.privateKey || parsed.key;
        }
        return keyData;
      } else {
        console.warn(`⚠️  No wallet key found (env or ${WALLET_KEY_PATH}), using placeholder`);
        return '0x' + '0'.repeat(64);
      }
    } catch (error) {
      console.error('❌ Failed to load wallet key:', error);
      throw new Error('Wallet key is required for EAS operations');
    }
  }

  async ensureSchema() {
    if (!this.initialized) await this.initialize();
    if (this.schemaUID) return this.schemaUID;

    try {
      console.log('🔍 Checking for existing ClawyardPurchase schema...');
      
      // For MVP, we'll use a hardcoded schema UID if it exists
      // In production, you'd want to search for existing schemas or store the UID
      
      console.log('📝 Registering ClawyardPurchase schema...');
      try {
        const transaction = await this.schemaRegistry.register({
          schema: CLAWYARD_SCHEMA,
          revocable: true,
          resolver: '0x0000000000000000000000000000000000000000'
        });
        this.schemaUID = await transaction.wait();
        console.log(`✅ Schema registered with UID: ${this.schemaUID}`);
      } catch (regErr) {
        // Schema already exists — compute UID deterministically (solidityPacked, not abi.encode)
        console.log('⚠️ Schema already exists, computing UID...');
        const { ethers: eth } = require('ethers');
        const packed = eth.solidityPacked(
          ['string','address','bool'],
          [CLAWYARD_SCHEMA, '0x0000000000000000000000000000000000000000', true]
        );
        this.schemaUID = eth.keccak256(packed);
        console.log(`✅ Using schema UID: ${this.schemaUID}`);
      }

      return this.schemaUID;
    } catch (error) {
      console.error('❌ Failed to register schema:', error);
      throw error;
    }
  }

  async mintAttestation(orderData) {
    if (!this.initialized) await this.initialize();
    
    try {
      const schemaUID = await this.ensureSchema();
      
      const { orderId, buyer, items, totalUSDC, timestamp } = orderData;
      
      console.log(`🪙 Minting EAS attestation for order ${orderId}...`);
      
      // Encode the attestation data
      const schemaEncoder = new SchemaEncoder(CLAWYARD_SCHEMA);
      const encodedData = schemaEncoder.encodeData([
        { name: 'orderId', value: orderId, type: 'string' },
        { name: 'buyer', value: buyer, type: 'address' },
        { name: 'items', value: items, type: 'string' },
        { name: 'totalUSDC', value: BigInt(Math.floor(totalUSDC * 1000000)), type: 'uint256' }, // Convert to micro-USDC
        { name: 'timestamp', value: BigInt(timestamp), type: 'uint256' }
      ]);

      // Create the attestation
      const transaction = await this.eas.attest({
        schema: schemaUID,
        data: {
          recipient: buyer, // The buyer receives the purchase receipt
          expirationTime: 0, // No expiration
          revocable: true,
          data: encodedData
        }
      });

      const attestationUID = await transaction.wait();
      
      console.log(`✅ Attestation minted: ${attestationUID}`);
      console.log(`🔗 View on Base: https://base.easscan.org/attestation/view/${attestationUID}`);
      
      return attestationUID;
      
    } catch (error) {
      console.error('❌ Failed to mint attestation:', error);
      throw error;
    }
  }

  async getAttestation(uid) {
    if (!this.initialized) await this.initialize();
    
    try {
      const attestation = await this.eas.getAttestation(uid);
      return attestation;
    } catch (error) {
      console.error('❌ Failed to get attestation:', error);
      throw error;
    }
  }

  // Utility method to format items for attestation
  formatItemsForAttestation(orderItems) {
    return orderItems.map(item => 
      `${item.name} x${item.qty}`
    ).join(', ');
  }

  // Check if wallet is properly configured
  async checkWalletHealth() {
    try {
      if (!this.initialized) await this.initialize();
      
      const address = await this.signer.getAddress();
      const balance = await this.provider.getBalance(address);
      
      return {
        address,
        balance: ethers.formatEther(balance),
        hasMinimumBalance: balance > ethers.parseEther('0.001') // Need ETH for gas
      };
    } catch (error) {
      return {
        error: error.message,
        hasMinimumBalance: false
      };
    }
  }
}

// Export singleton instance
const easService = new EASService();

module.exports = {
  easService,
  EASService
};