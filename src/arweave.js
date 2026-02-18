const { Uploader } = require('@irys/upload');
const { BaseEth } = require('@irys/upload-ethereum');

let uploaderInstance = null;

async function getUploader() {
  if (uploaderInstance) return uploaderInstance;
  
  const key = process.env.ETH_PRIVATE_KEY;
  if (!key) {
    console.warn('⚠️  ETH_PRIVATE_KEY not set - Arweave uploads will be stubbed');
    return null;
  }
  
  uploaderInstance = await Uploader(BaseEth).withWallet(key);
  console.log('✅ Arweave uploader initialized (Irys via Base)');
  return uploaderInstance;
}

/**
 * Upload order items to Arweave permanently
 * @param {string} orderId 
 * @param {Array} items - Order items array
 * @returns {Promise<string>} Arweave transaction ID (use as arweave.net/{id})
 */
async function uploadItems(orderId, items) {
  const uploader = await getUploader();
  if (!uploader) return '';
  
  const data = JSON.stringify({
    orderId,
    items: items.map(i => ({
      id: i.id,
      name: i.name,
      qty: i.qty,
      price: i.price,
      imageUrl: i.imageUrl || null
    })),
    uploadedAt: new Date().toISOString()
  });
  
  const receipt = await uploader.upload(data, {
    tags: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'App-Name', value: 'Clawyard' },
      { name: 'Type', value: 'order-items' },
      { name: 'Order-Id', value: orderId }
    ]
  });
  
  console.log(`📦 Items uploaded to Arweave: ${receipt.id}`);
  return receipt.id;
}

/**
 * Upload order metadata to Arweave permanently
 * @param {string} orderId
 * @param {Object} metadata - Full order metadata
 * @returns {Promise<string>} Arweave transaction ID
 */
async function uploadMetadata(orderId, metadata) {
  const uploader = await getUploader();
  if (!uploader) return '';
  
  const data = JSON.stringify({
    orderId,
    ...metadata,
    uploadedAt: new Date().toISOString()
  });
  
  const receipt = await uploader.upload(data, {
    tags: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'App-Name', value: 'Clawyard' },
      { name: 'Type', value: 'order-metadata' },
      { name: 'Order-Id', value: orderId }
    ]
  });
  
  console.log(`📋 Metadata uploaded to Arweave: ${receipt.id}`);
  return receipt.id;
}

module.exports = { getUploader, uploadItems, uploadMetadata };
