import db from './db-knex';
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

async function main() {
  const users = await db('users');

  // await db('users').update({ username: 'mom'}).where('id', 1)

  console.log(users)
}

main().then(() => {
  process.exit(0);

})
