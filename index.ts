import express, { Request, Response } from 'express';

// 1. Initialize the Express application
const app = express();


// 3. Define the port we want our server to listen on
const port =  process.env.PORT || 3000;

// --- MIDDLEWARE ---
// This built-in middleware tells Express to automatically parse incoming JSON payloads. 
// Without this, when our Next.js frontend eventually sends the cart data for checkout, Express won't be able to read it.
app.use(express.json());

// --- ROUTES ---
// A simple health-check route to verify our server is working
app.get('/', (req: Request, res: Response) => {
  res.json({ message: "E-commerce API is live and breathing!" });
});

// --- SERVER BOOTUP ---
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});