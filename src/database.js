const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

let db;

function init() {
  const dbPath = path.join(__dirname, '..', 'data', 'clawyard.db');
  
  // Ensure data directory exists
  const fs = require('fs');
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath);
  
  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');
  
  // Create tables
  createTables();
}

function createTables() {
  // Orders table
  const createOrdersTable = `
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      items TEXT NOT NULL, -- JSON array
      shipping_address TEXT NOT NULL, -- JSON object
      total_usdc TEXT NOT NULL,
      tx_hash TEXT,
      printful_order_id INTEGER,
      attestation_uid TEXT,
      agent_id TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  db.exec(createOrdersTable);
  
  // Create indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_wallet ON orders(wallet)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tx_hash ON orders(tx_hash) WHERE tx_hash IS NOT NULL');
  
  console.log('✅ Database tables created');
}

function createOrder(orderData) {
  const orderId = uuidv4();
  
  const stmt = db.prepare(`
    INSERT INTO orders (
      id, wallet, items, shipping_address, total_usdc, agent_id, tx_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  try {
    stmt.run(
      orderId,
      orderData.wallet,
      JSON.stringify(orderData.items),
      JSON.stringify(orderData.shippingAddress),
      orderData.totalUSDC,
      orderData.agentId || null,
      orderData.paymentTxHash || null
    );
    
    console.log(`📝 Order created: ${orderId}`);
    return orderId;
  } catch (error) {
    console.error('Failed to create order:', error);
    throw error;
  }
}

function getOrder(orderId) {
  const stmt = db.prepare(`
    SELECT * FROM orders WHERE id = ?
  `);
  
  try {
    const row = stmt.get(orderId);
    if (!row) return null;
    
    return {
      id: row.id,
      wallet: row.wallet,
      items: JSON.parse(row.items),
      shippingAddress: JSON.parse(row.shipping_address),
      totalUSDC: row.total_usdc,
      txHash: row.tx_hash,
      printfulOrderId: row.printful_order_id,
      attestationUID: row.attestation_uid,
      agentId: row.agent_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  } catch (error) {
    console.error('Failed to get order:', error);
    throw error;
  }
}

function updateOrderStatus(orderId, status) {
  const stmt = db.prepare(`
    UPDATE orders 
    SET status = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `);
  
  try {
    const result = stmt.run(status, orderId);
    return result.changes > 0;
  } catch (error) {
    console.error('Failed to update order status:', error);
    throw error;
  }
}

function updateOrderPrintful(orderId, printfulOrderId) {
  const stmt = db.prepare(`
    UPDATE orders 
    SET printful_order_id = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `);
  
  try {
    const result = stmt.run(printfulOrderId, orderId);
    return result.changes > 0;
  } catch (error) {
    console.error('Failed to update Printful order ID:', error);
    throw error;
  }
}

function updateOrderTxHash(orderId, txHash) {
  const stmt = db.prepare(`
    UPDATE orders 
    SET tx_hash = ?, status = 'paid', updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `);
  
  try {
    const result = stmt.run(txHash, orderId);
    return result.changes > 0;
  } catch (error) {
    console.error('Failed to update transaction hash:', error);
    throw error;
  }
}

function updateOrderAttestation(orderId, attestationUID) {
  const stmt = db.prepare(`
    UPDATE orders 
    SET attestation_uid = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `);
  
  try {
    const result = stmt.run(attestationUID, orderId);
    return result.changes > 0;
  } catch (error) {
    console.error('Failed to update attestation UID:', error);
    throw error;
  }
}

function getOrdersByWallet(wallet, limit = 10) {
  const stmt = db.prepare(`
    SELECT * FROM orders 
    WHERE wallet = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  
  try {
    const rows = stmt.all(wallet, limit);
    return rows.map(row => ({
      id: row.id,
      wallet: row.wallet,
      items: JSON.parse(row.items),
      shippingAddress: JSON.parse(row.shipping_address),
      totalUSDC: row.total_usdc,
      txHash: row.tx_hash,
      printfulOrderId: row.printful_order_id,
      attestationUID: row.attestation_uid,
      agentId: row.agent_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  } catch (error) {
    console.error('Failed to get orders by wallet:', error);
    throw error;
  }
}

function getStats() {
  try {
    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get();
    const totalRevenue = db.prepare('SELECT SUM(CAST(total_usdc AS REAL)) as revenue FROM orders WHERE status != "pending"').get();
    const ordersByStatus = db.prepare('SELECT status, COUNT(*) as count FROM orders GROUP BY status').all();
    
    return {
      totalOrders: totalOrders.count,
      totalRevenue: totalRevenue.revenue || 0,
      ordersByStatus: ordersByStatus.reduce((acc, row) => {
        acc[row.status] = row.count;
        return acc;
      }, {})
    };
  } catch (error) {
    console.error('Failed to get stats:', error);
    throw error;
  }
}

function close() {
  if (db) {
    db.close();
    console.log('📦 Database connection closed');
  }
}

// Graceful shutdown
process.on('SIGTERM', close);
process.on('SIGINT', close);

function getOrderByTxHash(txHash) {
  const stmt = db.prepare('SELECT id FROM orders WHERE tx_hash = ?');
  return stmt.get(txHash) || null;
}

module.exports = {
  init,
  createOrder,
  getOrder,
  getOrderByTxHash,
  updateOrderStatus,
  updateOrderPrintful,
  updateOrderTxHash,
  updateOrderAttestation,
  getOrdersByWallet,
  getStats,
  close
};