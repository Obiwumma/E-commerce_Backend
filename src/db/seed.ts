// src/db/seed.ts
import { db } from './index.js'; // Import our centralized database connection
import { products } from './schema.js'; // Import the table blueprint

const fakeProducts = [
  {
    title: "Minimalist Coffee Mug",
    price: "14.99", // Remember, we set this as a numeric/string type in Drizzle
    description: "A sleek, matte black ceramic mug perfect for your morning brew.",
    imageUrl: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=500",
    stockQuantity: 50,
  },
  {
    title: "Jimmy choos",
    price: "28.99", // Remember, we set this as a numeric/string type in Drizzle
    description: "The best shoes in town.",
    imageUrl: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=500",
    stockQuantity: 40,
  },
  {
    title: "Cargo pants",
    price: "20.99", // Remember, we set this as a numeric/string type in Drizzle
    description: "It has 10 pockets.",
    imageUrl: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=500",
    stockQuantity: 20,
  },
  {
    title: "Fendy beauty",
    price: "17.99", // Remember, we set this as a numeric/string type in Drizzle
    description: "The secret to beauty.",
    imageUrl: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=500",
    stockQuantity: 30,
  },
];

async function seed() {
  console.log(" Seeding database...");
  
  try {
    // This tells Drizzle to insert the entire array into the products table
    await db.insert(products).values(fakeProducts);
    console.log(" Seeding complete!");
  } catch (error) {
    console.error(" Error seeding database:", error);
  } finally {
    process.exit(0); // Closes the script when finished
  }
}

// Execute the function
seed();