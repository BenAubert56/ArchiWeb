import mongoose from 'mongoose'

export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('BDD OK')
  } catch (err) {
    console.error('BDD KO', err.message)
    process.exit(1)
  }
}
