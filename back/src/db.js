import mongoose from 'mongoose'

export async function connectDB(uri) {
  const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://root:root@localhost:27017/google-like?authSource=admin'
  try {
    await mongoose.connect(mongoUri)
    console.log('BDD OK')
  } catch (err) {
    console.error('BDD KO', err.message)
    process.exit(1)
  }
}
