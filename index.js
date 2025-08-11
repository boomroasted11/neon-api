import express from 'express'
import dotenv from 'dotenv'
import pkg from 'pg'

const { Pool } = pkg
dotenv.config()

const app = express()

// Parse JSON
app.use(express.json())

// --- Minimal CORS without external dependency ---
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*') // allows file:// (Origin: null) and any site
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204) // preflight OK
  }
  next()
})
// ------------------------------------------------

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

