const Joi = require('joi');

const addressSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  company: Joi.string().max(100).allow(''),
  address1: Joi.string().min(5).max(200).required(),
  address2: Joi.string().max(200).allow(''),
  city: Joi.string().min(2).max(100).required(),
  state: Joi.string().min(2).max(100).required(),
  country: Joi.string().length(2).uppercase().required(),
  zip: Joi.string().min(3).max(20).required(),
  phone: Joi.string().min(10).max(20).allow(''),
  email: Joi.string().email().allow('')
});

const stickerItemSchema = Joi.object({
  id: Joi.string().min(1).max(100).required(),
  qty: Joi.number().integer().min(1).max(50).required()
});

const orderSchema = Joi.object({
  stickers: Joi.array().items(stickerItemSchema).min(1).max(20).required(),
  shippingAddress: addressSchema.required(),
  agentId: Joi.string().max(200).allow(''),
  notes: Joi.string().max(500).allow(''),
  shippingMethod: Joi.string().min(1).max(100).required(),
  shippingCost: Joi.number().precision(2).min(0).required(),
  paymentTxHash: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).optional(),
  payerWallet: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional()
});

function validateOrder(data) {
  return orderSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

function validateAddress(data) {
  return addressSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}

module.exports = {
  validateOrder,
  validateAddress,
  schemas: {
    order: orderSchema,
    address: addressSchema,
    stickerItem: stickerItemSchema
  }
};