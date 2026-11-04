import 'reflect-metadata';
import argon2 from 'argon2';
import { Pool } from 'pg';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const rl = createInterface({ input: stdin, output: stdout });
  const username = (await rl.question('Usuário TI: ')).trim().toLowerCase();
  const name = (await rl.question('Nome: ')).trim();
  // Non-interactive deployment: password must be supplied via a secret manager.
  // Do not pass passwords as CLI arguments (shell histories/process lists).
  const password = process.env.CREATE_USER_PASSWORD;
  rl.close();
  if (!username || username.length > 80 || name.length < 2 || name.length > 120 || !password || password.length < 12) {
    throw new Error('Informe usuário/nome válidos e CREATE_USER_PASSWORD com 12+ caracteres no ambiente.');
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL,
    ...(process.env.DATABASE_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}) });
  try {
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    await pool.query('INSERT INTO technicians(username,name,password_hash) VALUES ($1,$2,$3)', [username, name, hash]);
    console.log('Técnico cadastrado com sucesso.');
  } finally { await pool.end(); }
}
void main().catch(err => { console.error('Falha ao cadastrar técnico:', err.message); process.exitCode = 1; });
