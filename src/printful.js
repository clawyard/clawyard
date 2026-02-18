const axios = require('axios');

const PRINTFUL_API_BASE = 'https://api.printful.com';
const API_KEY = process.env.PRINTFUL_API_KEY;

if (!API_KEY) {
  console.warn('⚠️  PRINTFUL_API_KEY not set - Printful integration will be stubbed');
}

const printfulAPI = axios.create({
  baseURL: PRINTFUL_API_BASE,
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Clawyard/1.0'
  }
});

/**
 * Create a Printful order
 * @param {Object} orderData 
 * @param {string} orderData.orderId - Internal order ID
 * @param {Array} orderData.items - Order items
 * @param {Object} orderData.shippingAddress - Shipping details
 * @param {string} orderData.shippingMethod - Selected shipping method (e.g., "Flat Rate")
 * @param {number} orderData.shippingCost - Cost of shipping in USD
 * @returns {Promise<number>} Printful order ID
 */
async function createOrder(orderData) {
  if (!API_KEY) {
    console.log(`📋 [STUB] Printful order creation for ${orderData.orderId}`);
    return Math.floor(Math.random() * 1000000); // Stub order ID
  }

  try {
    const { orderId, items, shippingAddress } = orderData;
    
    // Map our items to Printful format (one-off orders, no sync needed)
    const printfulItems = items.map(item => ({
      variant_id: item.printfulVariantId,
      quantity: item.qty,
      retail_price: item.price ? item.price.toFixed(2) : '4.20',
      files: [
        {
          type: 'default',
          url: item.imageUrl || `https://clawyard.dev/images/${item.id}.png`
        }
      ]
    }));

    const printfulOrder = {
      external_id: `CLW-${orderId.slice(0, 8)}`,
      shipping: 'STANDARD', // or based on customer selection
      recipient: {
        name: shippingAddress.name,
        company: shippingAddress.company || '',
        address1: shippingAddress.address1,
        address2: shippingAddress.address2 || '',
        city: shippingAddress.city,
        state_code: shippingAddress.state,
        country_code: shippingAddress.country,
        zip: shippingAddress.zip,
        phone: shippingAddress.phone || '',
        email: shippingAddress.email || ''
      },
      items: printfulItems,
      retail_costs: {
        currency: 'USD',
        subtotal: items.reduce((sum, item) => sum + item.total, 0).toFixed(2),
        discount: '0.00',
        shipping: '0.00', // TODO: Calculate shipping
        tax: '0.00' // TODO: Calculate tax if needed
      }
    };

    console.log(`📋 Creating Printful order for ${orderId}...`);
    const response = await printfulAPI.post('/orders', printfulOrder);
    
    if (response.data && response.data.result) {
      const printfulOrderId = response.data.result.id;
      console.log(`✅ Printful order created (draft): ${printfulOrderId}, confirming...`);
      
      // Confirm the order so it enters production
      await printfulAPI.post(`/orders/${printfulOrderId}/confirm`);
      console.log(`✅ Printful order confirmed: ${printfulOrderId}`);
      return printfulOrderId;
    } else {
      throw new Error('Invalid response from Printful API');
    }

  } catch (error) {
    console.error('Printful order creation failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get Printful order status
 * @param {number} printfulOrderId 
 * @returns {Promise<Object>} Order status
 */
async function getOrderStatus(printfulOrderId) {
  if (!API_KEY) {
    return {
      id: printfulOrderId,
      status: 'pending',
      shipping: null,
      tracking: null
    };
  }

  try {
    const response = await printfulAPI.get(`/orders/${printfulOrderId}`);
    
    if (response.data && response.data.result) {
      const order = response.data.result;
      return {
        id: order.id,
        status: order.status,
        shipping: order.shipments?.[0] || null,
        tracking: order.shipments?.[0]?.tracking_number || null,
        estimatedDelivery: order.estimated_fulfillment || null
      };
    } else {
      throw new Error('Invalid response from Printful API');
    }

  } catch (error) {
    console.error('Failed to get Printful order status:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Cancel a Printful order
 * @param {number} printfulOrderId 
 * @returns {Promise<boolean>} Success
 */
async function cancelOrder(printfulOrderId) {
  if (!API_KEY) {
    console.log(`📋 [STUB] Cancel Printful order ${printfulOrderId}`);
    return true;
  }

  try {
    await printfulAPI.delete(`/orders/${printfulOrderId}`);
    console.log(`🗑️  Printful order cancelled: ${printfulOrderId}`);
    return true;
  } catch (error) {
    console.error('Failed to cancel Printful order:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get available products and variants
 * @returns {Promise<Array>} Products
 */
async function getProducts() {
  if (!API_KEY) {
    return [
      {
        id: 1,
        name: 'Stickers',
        variants: [
          { id: 1, name: '3x3 inch square sticker', price: 4.99 }
        ]
      }
    ];
  }

  try {
    const response = await printfulAPI.get('/products');
    return response.data.result || [];
  } catch (error) {
    console.error('Failed to get Printful products:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Estimate shipping costs
 * @param {Array} items - Order items
 * @param {Object} address - Shipping address
 * @returns {Promise<Object>} Shipping estimate
 */
async function estimateShipping(items, address) {
  if (!API_KEY) {
    return {
      standard: { cost: 4.99, currency: 'USD' },
      express: { cost: 12.99, currency: 'USD' }
    };
  }

  try {
    const estimateRequest = {
      recipient: {
        country_code: address.country,
        state_code: address.state || '',
        city: address.city,
        zip: address.zip
      },
      items: items.map(item => ({
        variant_id: item.printfulVariantId,
        quantity: item.qty
      }))
    };

    const response = await printfulAPI.post('/shipping/rates', estimateRequest);
    return response.data.result || {};
  } catch (error) {
    console.error('Failed to estimate shipping:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  createOrder,
  getOrderStatus,
  cancelOrder,
  getProducts,
  estimateShipping
};