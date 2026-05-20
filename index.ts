import cors from 'cors';
import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from 'express';

// 1. Import the Postgres driver
import { orders, users } from './src/db/schema.js';

// 2. Import the Drizzle function specifically for Postgres.js
import { eq } from 'drizzle-orm';

// --- DATABASE SETUP ---
import { db } from './src/db/index.js'  
import { products } from './src/db/schema.js'  

// -----auth setup-----
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Import stripe
import Stripe from 'stripe';

// 1. Initialize the Express application
const app = express();

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2026-04-22.dahlia', 
});

// 3. Define the port we want our server to listen on
const port = process.env.PORT || 3000;

// ==========================================
// 🚨 GLOBAL MIDDLEWARE (MUST BE AT THE TOP)
// ==========================================
app.use(cors()); // Moving CORS to the top fixes the fetch catalog errors completely!

// ==========================================
// --- STRIPE WEBHOOK (MUST BE ABOVE express.json) ---
// ==========================================
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, 
      sig as string, 
      process.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err: any) {
    console.error(` Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    try {
      const dollars = (session.amount_total! / 100).toString();

      await db.insert(orders).values({
        customerName: session.customer_details?.name || 'Guest User',
        customerEmail: session.customer_details?.email || 'guest@example.com',
        totalAmount: dollars,
        status: 'PAID',
        stripeSessionId: session.id,
      });
      
      console.log(` Order saved securely for ${session.customer_details?.name}`);
    } catch (dbError) {
      console.error(" CRITICAL: Payment succeeded, but database failed!", dbError);
    }
  }

  res.status(200).send();
});

// ==========================================
// --- STANDARD JSON MIDDLEWARE (FOR ALL OTHER ROUTES) ---
// ==========================================
app.use(express.json());

// ==========================================
// --- ROUTES ---
// ==========================================

// The root route
app.get('/', (req: Request, res: Response) => {
  res.json({ message: "E-commerce API is live and breathing!" });
});

// get all products
app.get('/api/products', async (req: Request, res: Response) => {
  try {
    const allProducts = await db.select().from(products)
    res.json({ 
      message: "All products successfully!", 
      productsList: allProducts 
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to retrieve products." });
  }
})

app.get('/api/products/:id', async (req: Request, res: Response) => {
  try {
    const productId = Number(req.params.id);
    const product = await db.select().from(products).where(eq(products.id, productId));

    if (product.length === 0) {
      return res.status(404).json({ error: "Product not found." });
    }

    res.json({ 
      message: "Your product!", 
      product: product[0]
    });
  } catch (error) {
    console.error("Error fetching single product:", error);
    res.status(500).json({ error: "Failed to retrieve product." });
  }
});

// Registration
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    // Check if user exists
    const existingUser = await db.select().from(users).where(eq(users.email, email));
    if (existingUser.length > 0) {
      return res.status(400).json({ error: "User already exists with this email." });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // FIX: If 'name' is not provided by the frontend, extract the part of the email before the '@' to use as the name.
    const finalName = name || email.split('@')[0];

    const [newUser] = await db.insert(users).values({
      name: finalName, // Use the fallback name here
      email,
      passwordHash: hashedPassword,
    }).returning(); 

    if (!newUser) {
      throw new Error("Failed to create user");
    }

    res.status(201).json({ 
      user: { id: newUser.id, name: newUser.name, email: newUser.email }
    });
  } catch (error: any) {
    console.error("Registration Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Login process
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const userArray = await db.select().from(users).where(eq(users.email, email));
    const user = userArray[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" }); 
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const tokenSecret = process.env.JWT_SECRET || 'fallback_super_secret_key_for_dev';
    const token = jwt.sign(
      { userId: user.id }, 
      tokenSecret, 
      { expiresIn: '7d' } 
    );

    res.status(200).json({
      message: "Login successful",
      token: token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ======= AUTHENTICATION MIDDLEWARE ==========
const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Access Denied: No token provided" });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: "Access Denied: Malformed token" });
  }

  try {
    const tokenSecret = process.env.JWT_SECRET || 'fallback_super_secret_key_for_dev';
    const decoded = jwt.verify(token, tokenSecret) as unknown as { userId: number };
    res.locals.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Access Denied: Invalid or expired token" });
  }
};

// PROTECTED ROUTES
app.get('/api/orders/me', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const userArray = await db.select().from(users).where(eq(users.id, userId));
    const user = userArray[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const userOrders = await db.select().from(orders).where(eq(orders.customerEmail, user.email));

    res.status(200).json({
      message: "Orders retrieved successfully",
      orders: userOrders
    });
  } catch (error) {
    console.error("Fetch Orders Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post('/api/checkout', async (req: Request, res: Response) => {
  try {
    const { items } = req.body;
    const lineItems = items.map((item: any) => {
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.title,
            images: [item.imageUrl], 
          },
          unit_amount: Math.round(Number(item.price) * 100),
        },
        quantity: item.quantity,
      };
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: 'http://localhost:3001/success',
      cancel_url: 'http://localhost:3001/cart',
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe Checkout Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- SERVER BOOTUP ---
app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});