import cors from 'cors';
import "dotenv/config";
import express, { type Request, type Response } from 'express';



// 1. Import the Postgres driver
import postgres from 'postgres';

// 2. Import the Drizzle function specifically for Postgres.js
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql, eq } from 'drizzle-orm';

// --- DATABASE SETUP ---
import { db } from './src/db/index.js'  
import { products } from './src/db/schema.js'  

// Import stripe
import Stripe from 'stripe';

// 1. Initialize the Express application
const app = express();

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2026-04-22.dahlia', // Updated to match your installed version!
});

// 3. Define the port we want our server to listen on
const port =  process.env.PORT || 3000;

// =====================================================================
// 🚨 STRIPE WEBHOOK (MUST BE ABOVE express.json!)
// Notice we use express.raw() here instead of json()
// =====================================================================
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  // 1. Grab the signature Stripe left in the headers
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // 2. Use your new Secret Key to verify the message is actually from Stripe
    event = stripe.webhooks.constructEvent(
      req.body, 
      sig as string, 
      process.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err: any) {
    console.error(`⚠️ Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 3. If the signature is good, check what happened!
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    console.log(" SUCCESS! WE GOT THE MONEY!");
    console.log("Order total:", session.amount_total);
    console.log("Customer email:", session.customer_details?.email);
    
    // YOUR FUTURE TURN: This is where you will write the Drizzle code 
    // to save the final order into your PostgreSQL database!
  }

  // 4. Send a 200 OK back to Stripe so they know we received it
  res.status(200).send();
});

// --- MIDDLEWARE ---
// This built-in middleware tells Express to automatically parse incoming JSON payloads. 
// Without this, when our Next.js frontend eventually sends the cart data for checkout, Express won't be able to read it.
app.use(express.json());

app.use(cors());
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

app.get('/api/products/:id', async (req: Request, res: Response) => {
  try {
    // 1. Grab the ID from the URL (Express stores this in req.params)
    const productId = Number(req.params.id);

    // 2. Ask Drizzle to find the ONE product where the id matches
    const product = await db.select().from(products).where(eq(products.id, productId));

    // 3. Check if the product actually exists
    if (product.length === 0) {
      // Send a 404 status and an error message if it's not found
      return res.status(404).json({ error: "Product not found." });
    }

    // 4. Send the single product back to the frontend
    // YOUR CODE HERE (Hint: Drizzle returns an array even if it finds one item, so send product[0])
    res.json({ 
      message: "Your product!", 
      product: product[0]
    });

  } catch (error) {
    console.error("Error fetching single product:", error);
    res.status(500).json({ error: "Failed to retrieve product." });
  }
});

app.post('/api/checkout', async (req: Request, res: Response) => {
  try {
    // 1. Grab the cart items sent from the Next.js frontend
    const { items } = req.body;

    // 2. Format the items into the exact shape Stripe requires
    const lineItems = items.map((item: any) => {
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.title,
            images: [item.imageUrl], // Stripe will actually show your product image on the checkout page!
          },
          // Stripe requires prices to be in CENTS, not dollars. 
          // So $14.99 becomes 1499. We multiply by 100 to convert it.
          unit_amount: Math.round(Number(item.price) * 100),
        },
        quantity: item.quantity,
      };
    });

    // 3. Tell Stripe to create a secure checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      // Where should Stripe send the user when they successfully pay?
      success_url: 'http://localhost:3001/success',
      // Where should Stripe send them if they hit the back button?
      cancel_url: 'http://localhost:3001/cart',
    });

    // 4. Send the unique Stripe URL back to the frontend
    res.json({ url: session.url });

  } catch (error: any) {
    console.error("Stripe Checkout Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// A simple health-check route to verify our server is working
// app.get('/test-db', async (req: Request, res: Response) => {
//   try {
//     // We send a raw SQL command asking the database for the current time
//     const result = await db.execute(sql`SELECT NOW()`);
    
//     res.json({ 
//       message: "Database connected successfully!", 
//       databaseTime: result 
//     });
//   } catch (error) {
//     console.error("DB Connection Error:", error);
//     res.status(500).json({ error: "Failed to connect to the database." });
//   }
// });
// --- SERVER BOOTUP ---

app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});