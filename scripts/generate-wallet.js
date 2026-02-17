const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Generate a new random wallet
const wallet = ethers.Wallet.createRandom();

console.log('🔑 Generated new wallet for Clawyard payments');
console.log('Address:', wallet.address);
console.log('Private key will be saved to /root/.secrets/');

// Ensure secrets directory exists
const secretsDir = '/root/.secrets';
if (!fs.existsSync(secretsDir)) {
  fs.mkdirSync(secretsDir, { recursive: true });
}

// Save private key (without 0x prefix for consistency)
const privateKeyPath = path.join(secretsDir, 'clawyard-wallet-key');
fs.writeFileSync(privateKeyPath, wallet.privateKey.slice(2), { mode: 0o600 });

// Save address
const addressPath = path.join(secretsDir, 'clawyard-wallet-address');
fs.writeFileSync(addressPath, wallet.address, { mode: 0o600 });

console.log('✅ Wallet credentials saved securely');
console.log('Private key:', privateKeyPath);
console.log('Address:', addressPath);

console.log('\n⚠️  IMPORTANT: Fund this wallet with ETH on Base network for gas fees');
console.log('Base network: Chain ID 8453');
console.log('Fund address:', wallet.address);