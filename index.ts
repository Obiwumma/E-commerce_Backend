import cors from 'cors';
import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from 'express';



// 1. Import the Postgres driver
import { orders, users } from './src/db/schema.js';

// 2. Import the Drizzle function specifically for Postgres.js
import {  eq } from 'drizzle-orm';

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
  apiVersion: '2026-04-22.dahlia', // Updated to match your installed version!
});

// 3. Define the port we want our server to listen on
const port =  process.env.PORT || 3000;

// use express.raw() here instead of json()
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
    console.error(` Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 3. If the signature is good, check what happened!
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    try {
      // Convert Stripe's cents back into dollars for your numeric field
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

// Auth setup
// Registration
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    // 1. Check if the user already exists
    // We query the database to see if anyone has this email
    const existingUser = await db.select().from(users).where(eq(users.email, email));
    
    if (existingUser.length > 0) {
      return res.status(400).json({ error: "User already exists with this email." });
    }

    // 2. The Cryptography (Hashing)
    // We take their password and scramble it 10 times (called "salt rounds")
    // Example: "password123" becomes something like "$2b$10$wYx1..."
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 3. Save to the Database
    // We save the scrambled password, NEVER the real one.
    const [newUser] = await db.insert(users).values({
      name,
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

    // 1. Find the user in the database
    const userArray = await db.select().from(users).where(eq(users.email, email));
    const user = userArray[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" }); // Vague error on purpose so hackers don't know which one they got wrong!
    }

    // 2. Compare the passwords
    // We hand bcrypt the plain password ("supersecretpassword123") and the hash from the DB. 
    // It runs the math to see if they match.
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // 3. Generate the Digital Wristband (JWT)
    // We bake the user's ID into the token so we know who they are later
    const tokenSecret = process.env.JWT_SECRET || 'fallback_super_secret_key_for_dev';
    const token = jwt.sign(
      { userId: user.id }, 
      tokenSecret, 
      { expiresIn: '7d' } // The wristband expires in 7 days
    );

    // 4. Give the token to the user
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
  // 1. Check if they even brought a wristband
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Access Denied: No token provided" });
  }

  // 2. Extract the actual token from the "Bearer aaaa.bbbb.cccc" string
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: "Access Denied: Malformed token" });
  }

  try {
    // 3. Verify the math using your secret key
    const tokenSecret = process.env.JWT_SECRET || 'fallback_super_secret_key_for_dev';
    const decoded = jwt.verify(token, tokenSecret) as unknown as { userId: number };

    // 4. Attach the user's ID to the response locals so the next function can use it!
    res.locals.userId = decoded.userId;

    // 5. Open the door! (Move to the actual route)
    next();
  } catch (error) {
    // If the token is expired or altered, jwt.verify throws an error
    return res.status(403).json({ error: "Access Denied: Invalid or expired token" });
  }
};

// PROTECTED ROUTES
// ==========================================

app.get('/api/orders/me', verifyToken, async (req: Request, res: Response) => {
  try {
    // 1. Grab the ID that the bouncer attached
    const userId = res.locals.userId;

    // 2. Look up the user in the database to get their email
    const userArray = await db.select().from(users).where(eq(users.id, userId));
    const user = userArray[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // 3. Find all orders that belong to this user's email
    const userOrders = await db.select().from(orders).where(eq(orders.customerEmail, user.email));

    // 4. Send the orders back to the frontend
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