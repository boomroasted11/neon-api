import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import pkg from 'pg'

const { Pool } = pkg
dotenv.config()

const app = express()

// Enable JSON body parsing
app.use(express.json())

// Enable CORS, including Origin:null for file:// requests
app.use(
  cors({
    origin: true, // reflect the Origin header
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

// Explicitly handle preflight for /insert
app.options('/insert', (req, res) => res.sendStatus(204))

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

app.post('/insert', async (req, res) => {
  const { date, description, category, amount, currency, type } = req.body
  try {
    await pool.query(
      'INSERT INTO transactions (date, description, category, amount, currency, type) VALUES ($1, $2, $3, $4, $5, $6)',
      [date, description, category, amount, currency, type]
    )
    res.status(200).json({ message: 'Inserted successfully' })
  } catch (err) {
    console.error('❌ INSERT ERROR:', err.message)
    res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

