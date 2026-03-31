const { Pool } = require("pg");
const Redis = require("ioredis");

const pool = new Pool({
  host: "100.117.158.50",
  port: 5432,       
  user: "admin",
  password: "admin",
  database: "car24"
});

// const redis = new Redis("redis://redis:6379", {
//   retryStrategy: (times) => {
//     console.log("Retrying Redis...", times);
//     return Math.min(times * 100, 2000);
//   }
// });
const redis = new Redis({
  host: "redis",
  port: 6379,
  maxRetriesPerRequest: null 
});
function connecttodb() {
  try {
    if(pool){
console.log("Connected to PostgreSQL and Redis");
    }else{
      console.log("error connecting to db")
    }
    
  } catch (e) {
    console.log("Error connecting to db", e);
  }
}

module.exports = {connecttodb, pool, redis };