const { Pool } = require("pg");
const Redis = require("ioredis");

const pool = new Pool({
  host: "localhost",
  port: 5432,
  user: "admin",
  password: "admin",
  database: "car24"
});

const redis = new Redis({
  host: "127.0.0.1",
  port: 6379
});

function connecttodb() {
  try {
    console.log("Connected to PostgreSQL and Redis");
  } catch (e) {
    console.log("Error connecting to db", e);
  }
}

module.exports = {connecttodb, pool, redis };