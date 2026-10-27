const { z } = require('zod');
const { PAYMENT_METHODS } = require('../config/constants');

/* Primitives */
const mobile = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{8,15}$/, 'Enter a valid mobile number');
const otpCode = z.string().trim().regex(/^[0-9]{6}$/, 'OTP must be 6 digits');
const id = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const positiveInt = z.coerce.number().int().min(1).max(20);

const addressInput = z.object({
  name: z.string().trim().min(2).max(80),
  phone: mobile,
  pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Pincode must be 6 digits'),
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).optional().default(''),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  isDefault: z.coerce.boolean().optional().default(false),
});

/* --------------------------------------------------------------- auth */
const schemas = {
  sendOtp: z.object({
    mobile,
    guestId: z.string().trim().max(64).optional(),
  }),

  verifyOtp: z.object({
    mobile,
    otp: otpCode,
    guestId: z.string().trim().max(64).optional(),
    name: z.string().trim().min(2).max(60).optional(),
  }),

  /* ------------------------------------------------------------- products */
  productQuery: z.object({
    search: z.string().trim().max(80).optional(),
    category: z.union([z.string().trim().max(80), z.array(z.string().trim().max(80))]).optional(),
    gender: z.string().trim().max(20).optional(),
    size: z.union([z.string().trim().max(10), z.array(z.string().trim().max(10))]).optional(),
    color: z.union([z.string().trim().max(30), z.array(z.string().trim().max(30))]).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    sort: z.enum(['newest', 'oldest', 'price_asc', 'price_desc', 'popularity', 'discount']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(12),
    featured: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  }),

  productInput: z.object({
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().min(10).max(4000),
    brand: z.string().trim().max(60).default('Surplus'),
    category: id,
    gender: z.enum(['men', 'women', 'kids', 'unisex']).default('unisex'),
    images: z.array(z.object({ url: z.string().url(), alt: z.string().max(120).optional().default('') })).min(1),
    sizes: z
      .array(z.object({ size: z.string().trim().min(1).max(8), stock: z.coerce.number().int().min(0) }))
      .min(1),
    colors: z.array(z.string().trim().min(1).max(30)).default([]),
    price: z.coerce.number().min(0),
    mrp: z.coerce.number().min(0),
    tags: z.array(z.string().trim().max(30)).default([]),
    isFeatured: z.coerce.boolean().default(false),
    isActive: z.coerce.boolean().default(true),
  }).refine((p) => p.mrp >= p.price, { message: 'MRP must be greater than or equal to the selling price', path: ['mrp'] }),

  /** PATCH variant: every field optional, but mrp/price must still be consistent when both sent. */
  productPatch: z
    .object({
      title: z.string().trim().min(3).max(140),
      description: z.string().trim().min(10).max(4000),
      brand: z.string().trim().max(60),
      category: id,
      gender: z.enum(['men', 'women', 'kids', 'unisex']),
      images: z.array(z.object({ url: z.string().url(), alt: z.string().max(120).optional().default('') })).min(1),
      sizes: z.array(z.object({ size: z.string().trim().min(1).max(8), stock: z.coerce.number().int().min(0) })).min(1),
      colors: z.array(z.string().trim().min(1).max(30)),
      price: z.coerce.number().min(0),
      mrp: z.coerce.number().min(0),
      tags: z.array(z.string().trim().max(30)),
      isFeatured: z.coerce.boolean(),
      isActive: z.coerce.boolean(),
    })
    .partial()
    .refine((p) => p.price === undefined || p.mrp === undefined || p.mrp >= p.price, {
      message: 'MRP must be greater than or equal to the selling price',
      path: ['mrp'],
    }),

  categoryInput: z.object({
    name: z.string().trim().min(2).max(60),
    image: z.string().trim().max(400).default(''),
    description: z.string().trim().max(300).default(''),
    group: z.enum(['men', 'women', 'kids', 'accessories', 'other']).default('other'),
    isActive: z.coerce.boolean().default(true),
    sort: z.coerce.number().int().default(0),
  }),

  /* --------------------------------------------------------------- cart */
  cartItemInput: z.object({
    productId: id,
    size: z.string().trim().max(8).default(''),
    color: z.string().trim().max(30).default(''),
    qty: positiveInt.default(1),
    guestId: z.string().trim().max(64).optional(),
  }),

  cartUpdateInput: z.object({
    itemId: id,
    qty: positiveInt,
    guestId: z.string().trim().max(64).optional(),
  }),

  cartRemoveInput: z.object({
    itemId: id,
    guestId: z.string().trim().max(64).optional(),
  }),

  /* ------------------------------------------------------------ checkout */
  orderInput: z.object({
    addressId: id.optional(),
    address: addressInput.optional(),
    paymentMethod: z.enum(PAYMENT_METHODS),
    couponCode: z.string().trim().max(24).optional(),
    guestId: z.string().trim().max(64).optional(),
  }).refine((o) => Boolean(o.addressId || o.address), {
    message: 'A delivery address is required',
    path: ['address'],
  }),

  paymentVerify: z.object({
    orderId: id,
    razorpayOrderId: z.string().trim().min(4).max(64),
    razorpayPaymentId: z.string().trim().min(4).max(64),
    signature: z.string().trim().min(8).max(256),
  }),

  cancelOrder: z.object({ reason: z.string().trim().max(300).default('') }),
  returnOrder: z.object({ reason: z.string().trim().min(5).max(300) }),

  /* --------------------------------------------------------------- users */
  profileInput: z.object({
    name: z.string().trim().min(2).max(60),
    email: z.string().trim().email().or(z.literal('')).optional(),
  }),

  addressCreate: addressInput,

  wishlistToggle: z.object({ productId: id }),

  contactInput: z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().or(z.literal('')).default(''),
    mobile: z.string().trim().max(20).default(''),
    subject: z.string().trim().max(120).default('General'),
    message: z.string().trim().min(5).max(2000),
  }),

  /* -------------------------------------------------------------- admin */
  couponInput: z.object({
    code: z.string().trim().min(3).max(24).transform((v) => v.toUpperCase()),
    description: z.string().trim().max(200).default(''),
    type: z.enum(['percent', 'flat']),
    value: z.coerce.number().min(0),
    minOrder: z.coerce.number().min(0).default(0),
    maxDiscount: z.coerce.number().min(0).default(0),
    active: z.coerce.boolean().default(true),
    startsAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional().nullable(),
    usageLimit: z.coerce.number().int().min(0).default(0),
    perUserLimit: z.coerce.number().int().min(1).default(1),
  }).refine((c) => c.type !== 'percent' || c.value <= 100, {
    message: 'Percentage discount cannot exceed 100',
    path: ['value'],
  }),

  /** PATCH variant for partial coupon updates. */
  couponPatch: z
    .object({
      code: z.string().trim().min(3).max(24).transform((v) => v.toUpperCase()),
      description: z.string().trim().max(200),
      type: z.enum(['percent', 'flat']),
      value: z.coerce.number().min(0),
      minOrder: z.coerce.number().min(0),
      maxDiscount: z.coerce.number().min(0),
      active: z.coerce.boolean(),
      startsAt: z.coerce.date(),
      expiresAt: z.coerce.date().nullable(),
      usageLimit: z.coerce.number().int().min(0),
      perUserLimit: z.coerce.number().int().min(1),
    })
    .partial(),

  orderStatusUpdate: z.object({
    status: z.enum(['placed', 'packed', 'shipped', 'delivered', 'cancelled']),
    note: z.string().trim().max(300).default(''),
  }),

  reviewInput: z.object({
    rating: z.coerce.number().int().min(1).max(5),
    comment: z.string().trim().max(500).default(''),
  }),
};

module.exports = schemas;
