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