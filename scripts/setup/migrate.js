#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://delego:delego@localhost:5432/delego";

async function run() {
  console.log(`[delego] db:migrate — connecting to database: ${databaseUrl}`);
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    
    // Read 001_initial.sql
    const sqlPath = path.join(__dirname, "../../database/schema/001_initial.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    
    console.log("[delego] db:migrate — running initial schema migration...");
    await client.query(sql);
    console.log("[delego] db:migrate — schema migrated successfully.");

    // Run versioned migrations from database/migrations
    const migrationsDir = path.join(__dirname, "../../database/migrations");
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith(".sql"))
        .sort();
      
      for (const file of files) {
        console.log(`[delego] db:migrate — running migration: ${file}...`);
        const migrationPath = path.join(migrationsDir, file);
        const migrationSql = fs.readFileSync(migrationPath, "utf8");
        
        try {
          await client.query(migrationSql);
          console.log(`[delego] db:migrate — migration ${file} applied successfully.`);
        } catch (err) {
          if (err.message && err.message.includes("already exists")) {
            console.log(`[delego] db:migrate — warning: relation or type in ${file} already exists, skipping...`);
          } else {
            throw err;
          }
        }
      }
    }
  } catch (err) {
    console.error("[delego] db:migrate — migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
