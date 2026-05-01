import { pgTable, serial, text, numeric, integer } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  // 'serial' automatically increments the ID, just like autoincrement()
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  
  // 'numeric' is the PostgreSQL equivalent to Decimal, perfect for money
  price: numeric('price').notNull(), 
  
  description: text('description').notNull(),
  imageUrl: text('image_url').notNull(),
  stockQuantity: integer('stock_quantity').notNull().default(0),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  totalAmount: numeric('total_amount').notNull(),
  status: text('status').notNull().default('PENDING'),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id).notNull(),
  productId: integer('product_id').references(() => products.id).notNull(),
  quantity : integer('quantity').notNull(),
  price : numeric('price').notNull(),
});