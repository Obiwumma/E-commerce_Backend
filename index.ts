import "dotenv/config";
import express, { type Request, type Response } from 'express';

// 1. Import the Postgres driver
import postgres from 'postgres';

// 2. Import the Drizzle function specifically for Postgres.js
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm';

// --- DATABASE SETUP ---
import { db } from './src/db/index.js'  
import { products } from './src/db/schema.js'  

// 1. Initialize the Express application
const app = express();


// 3. Define the port we want our server to listen on
const port =  process.env.PORT || 3000;

// --- MIDDLEWARE ---
// This built-in middleware tells Express to automatically parse incoming JSON payloads. 
// Without this, when our Next.js frontend eventually sends the cart data for checkout, Express won't be able to read it.
app.use(express.json());

// --- ROUTES ---

// The root route (handles visits to exactly http://localhost:3000/)
app.get('/', (req: Request, res: Response) => {
  res.json({ message: "E-commerce API is live and breathing!" });
});

// get all products
app.get('/api/products', async (req: Request, res: Response) => {
  try {
    // 1. Use Drizzle to fetch all products from the database
    const allProducts = await db.select().from(products)
    
    // 2. Send 'allProducts' back to the client with a successful JSON response
    res.json({ 
      message: "All products successfully!", 
      productsList: allProducts 
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    // 3. Send back a 500 status code and an error message JSON
    res.status(500).json({ error: "Failed to retrieve products." });
  }
})
// A simple health-check route to verify our server is working
app.get('/test-db', async (req: Request, res: Response) => {
  try {
    // We send a raw SQL command asking the database for the current time
    const result = await db.execute(sql`SELECT NOW()`);
    
    res.json({ 
      message: "Database connected successfully!", 
      databaseTime: result 
    });
  } catch (error) {
    console.error("DB Connection Error:", error);
    res.status(500).json({ error: "Failed to connect to the database." });
  }
});
// --- SERVER BOOTUP ---
app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});