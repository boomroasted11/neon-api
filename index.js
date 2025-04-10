import express from 'express'
import dotenv from 'dotenv'
import pkg from 'pg'

const { Pool } = pkg
dotenv.config()

const app = express()
app.use(express.json())

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
  res.status(500).json({ error: err.message }) // sends actual error back
}
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
