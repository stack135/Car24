const { Pool } = require("pg");
const Redis = require("ioredis");

const pool = new Pool({
  host: "100.117.158.50",
  port: 5432,       
  user: "admin",
  password: "admin",
  database: "car24"
});

const redis = new Redis("redis://redis:6379", {
  retryStrategy: (times) => {
    console.log("Retrying Redis...", times);
    return Math.min(times * 100, 2000);
  }
});
// const redis = new Redis({
//   host: "redis",
//   port: 6379,
//   maxRetriesPerRequest: null 
// });
async function connecttodb() {
  try {
    await pool.query("SELECT 1");  
    await redis.ping();             

    console.log("✅ Connected to PostgreSQL and Redis");
  } catch (e) {
    console.log("❌ Error connecting to DB/Redis:", e.message);
  }
}

module.exports = {connecttodb, pool, redis };