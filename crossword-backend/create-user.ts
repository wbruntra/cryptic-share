import db from './db-knex';
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

async function main() {
  const rl = createInterface({ input, output });

  try {
    console.log('--- Create New User ---');
    console.log('Note: Password input will be visible in the terminal.\n');
    
    const username = await rl.question('Username: ');
    if (!username.trim()) {
      console.error('Error: Username is required.');
      process.exit(1);
    }

    const password = await rl.question('Password: ');
    if (!password.trim()) {
      console.error('Error: Password is required.');
      process.exit(1);
    }

    // Check if user exists
    const existingUser = await db('users').where({ username }).first();
    if (existingUser) {
      console.error(`\nError: User '${username}' already exists.`);
      process.exit(1);
    }

    // Hash password
    console.log('\nHashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    await db('users').insert({
      username,
      password_hash: hashedPassword
    });

    console.log(`Success! User '${username}' created.`);

  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    rl.close();
    await db.destroy(); // Close DB connection
    process.exit(0);
  }
}

main();
