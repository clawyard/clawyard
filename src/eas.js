const { EAS, SchemaEncoder, SchemaRegistry } = require('@ethereum-attestation-service/eas-sdk');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Base network configuration
const BASE_RPC = 'https://mainnet.base.org';
const EAS_CONTRACT_ADDRESS = '0x4200000000000000000000000000000000000021';
const SCHEMA_REGISTRY_ADDRESS = '0x4200000000000000000000000000000000000020';
const WALLET_KEY_PATH = '/root/.secrets/clawyard-wallet.json';

// Schema v1 (deprecated): 'string orderId, address buyer, string items, uint256 totalUSDC, uint256 timestamp'
// Schema v2 - registered on Base: 0x5c1f61f956c705bbf27274f556b6108e08e552d2b15b70e528e8328bf9dec69e
const CLAWYARD_SCHEMA = 'string orderId,address buyer,uint256 agentId,string storeName,string providerName,address paymentToken,uint256 paymentAmount,uint64 orderDate,string itemsRef,string metadataRef';
const CLAWYARD_SCHEMA_UID = '0x5c1f61f956c705bbf27274f556b6108e08e552d2b15b70e528e8328bf9dec69e';

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
    this.schemaUID = CLAWYARD_SCHEMA_UID;
    return this.schemaUID;
  }

  async mintAttestation(orderData) {
    if (!this.initialized) await this.initialize();
    
    try {
      const schemaUID = await this.ensureSchema();
      
      const { orderId, buyer, agentId, storeName, providerName, paymentToken, paymentAmount, orderDate, itemsRef, metadataRef } = orderData;
      
      console.log(`🪙 Minting EAS attestation for order ${orderId}...`);
      
      // USDC on Base
      const USDC_ADDRESS = paymentToken || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      // Convert payment amount to USDC micro-units (6 decimals)
      const amountBigInt = BigInt(Math.floor((paymentAmount || 0) * 1000000));
      
      // Encode the attestation data (v2 schema)
      const schemaEncoder = new SchemaEncoder(CLAWYARD_SCHEMA);
      const encodedData = schemaEncoder.encodeData([
        { name: 'orderId', value: orderId, type: 'string' },
        { name: 'buyer', value: buyer, type: 'address' },
        { name: 'agentId', value: BigInt(agentId || 0), type: 'uint256' },
        { name: 'storeName', value: storeName || 'clawyard', type: 'string' },
        { name: 'providerName', value: providerName || 'printful', type: 'string' },
        { name: 'paymentToken', value: USDC_ADDRESS, type: 'address' },
        { name: 'paymentAmount', value: amountBigInt, type: 'uint256' },
        { name: 'orderDate', value: BigInt(orderDate || Math.floor(Date.now() / 1000)), type: 'uint64' },
        { name: 'itemsRef', value: itemsRef || '', type: 'string' },
        { name: 'metadataRef', value: metadataRef || '', type: 'string' }
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