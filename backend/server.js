const express = require("express");
const cors = require("cors");
const multer = require("multer");
const crypto = require("crypto");
require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
});

const {
    S3Client,
    PutObjectCommand
} = require("@aws-sdk/client-s3");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const BUCKET_NAME = "student-management-system-anu-26";
const AWS_REGION = "ap-southeast-2";

// AWS S3 Client - uses EC2 IAM Role
const s3 = new S3Client({
    region: AWS_REGION
});

// Multer configuration
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "application/pdf"
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only JPG, PNG and PDF files are allowed"));
        }
    }
});

// Test route
app.get("/", (req, res) => {
    res.send("Student Management Backend is Running!");
});

// Health check API
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "Backend is working successfully"
    });
});

// S3 File Upload API
app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Please select a file"
            });
        }

        const safeName = req.file.originalname.replace(
            /[^a-zA-Z0-9._-]/g,
            "_"
        );

        const fileKey = `uploads/${crypto.randomUUID()}-${safeName}`;

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileKey,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        });

        await s3.send(command);

        res.status(200).json({
            success: true,
            message: "File uploaded successfully to S3",
            bucket: BUCKET_NAME,
            fileKey: fileKey
        });

    } catch (error) {
        console.error("S3 Upload Error:", error);

        res.status(500).json({
            success: false,
            message: "File upload failed",
            error: error.message
        });
    }
});


// STUDENT CRUD APIs

// GET ALL STUDENTS
app.get("/api/students", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM students ORDER BY id");
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ADD STUDENT
app.post("/api/students", async (req, res) => {
    try {
        const { name, email, course } = req.body;
        const result = await pool.query(
            "INSERT INTO students (name, email, course) VALUES ($1, $2, $3) RETURNING *",
            [name, email, course]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// UPDATE STUDENT
app.put("/api/students/:id", async (req, res) => {
    try {
        const { name, email, course } = req.body;
        const result = await pool.query(
            "UPDATE students SET name=$1, email=$2, course=$3 WHERE id=$4 RETURNING *",
            [name, email, course, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE STUDENT
app.delete("/api/students/:id", async (req, res) => {
    try {
        const result = await pool.query(
            "DELETE FROM students WHERE id=$1 RETURNING *",
            [req.params.id]
        );
        res.json({ message: "Student deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
