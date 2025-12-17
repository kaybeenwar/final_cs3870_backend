import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import { sendAppointmentConfirmation } from "./emailService.js";
import dotenv from "dotenv";

dotenv.config();

// Server configuration
const PORT = process.env.PORT ?? 8081;
const HOST = process.env.HOST ?? "0.0.0.0";

// MongoDB configuration
const MONGO_URI = process.env.MONGO_URI;
const DBNAME = process.env.DBNAME;
const COLLECTION = process.env.COLLECTION;

// MongoDB SSL options - FIX: These need to be passed to MongoClient!
const mongoOptions = {
  ssl: true,
  tls: true,
  tlsAllowInvalidCertificates: false,
  tlsAllowInvalidHostnames: false
};

// Create MongoDB client with SSL options
const client = new MongoClient(MONGO_URI, mongoOptions);
let db;

// Connect to MongoDB once at startup
async function connectToMongoDB() {
  try {
    await client.connect();
    db = client.db(DBNAME);
    console.log("✅ Connected to MongoDB successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ============ APPOINTMENTS ENDPOINTS ============

// POST: Create new appointment
app.post("/appointments", async (req, res) => {
  try {
    // Validate request body
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "Bad request: No data provided." });
    }

    // Extract appointment fields from body
    const { name, email, phone, date, service } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !date || !service) {
      return res.status(400).json({ 
        message: "Bad request: All fields (name, email, phone, date, service) are required." 
      });
    }

    // Reference appointments collection - FIX: Use COLLECTION variable
    const appointmentsCol = db.collection(COLLECTION);

    // Create new appointment document
    const newAppointment = {
      name,
      email,
      phone,
      date,
      service,
      status: "pending",
      createdAt: new Date(),
    };
    
    console.log("New appointment:", newAppointment);

    // Insert appointment into MongoDB
    const result = await appointmentsCol.insertOne(newAppointment);
    console.log("Appointment inserted:", result);

    // Send confirmation email
    const emailResult = await sendAppointmentConfirmation({
      name,
      email,
      phone,
      date,
      service
    });

    if (emailResult.success) {
      console.log("Confirmation email sent to:", email);
    } else {
      console.error("Failed to send confirmation email:", emailResult.error);
      // Note: We still return success even if email fails
    }

    // Send success response
    res.status(201).json({ 
      message: "Appointment booked successfully",
      appointmentId: result.insertedId,
      emailSent: emailResult.success
    });

  } catch (error) {
    console.error("Error in POST /appointments:", error);
    res.status(500).json({ 
      message: "Failed to book appointment: " + error.message 
    });
  }
});

// GET: Retrieve all appointments
app.get("/appointments", async (req, res) => {
  try {
    // FIX: Use COLLECTION variable
    const results = await db
      .collection(COLLECTION)
      .find({})
      .limit(100)
      .toArray();
    
    console.log(`Found ${results.length} appointments`);
    res.status(200).json(results);
    
  } catch (error) {
    console.error("Error in GET /appointments:", error);
    res.status(500).json({ 
      message: "Failed to retrieve appointments: " + error.message 
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    message: "Server is running",
    mongoConnected: !!db
  });
});

// Start server after connecting to MongoDB
connectToMongoDB().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running at http://${HOST}:${PORT}`);
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await client.close();
  process.exit(0);
});
