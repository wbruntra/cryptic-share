import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import db from '../db-knex'
import { JWT_SECRET } from '../config'

export class AuthService {
  static async register(
    username: string,
    password: string,
  ): Promise<{ token: string; user: { id: number; username: string } }> {
    const existingUser = await db('users').where({ username }).first()
    if (existingUser) {
      throw new Error('Username already exists')
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const [id] = await db('users').insert({
      username,
      password_hash: hashedPassword,
    })

    if (!id) {
      throw new Error('Failed to create user')
    }

    const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '30d' })
    return { token, user: { id, username } }
  }

  static async login(
    username: string,
    password: string,
  ): Promise<{ token: string; user: { id: number; username: string } }> {
    const user = await db('users').where({ username }).first()
    if (!user) {
      throw new Error('Invalid credentials')
    }

    const validPassword = await bcrypt.compare(password, user.password_hash)
    if (!validPassword) {
      throw new Error('Invalid credentials')
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
      expiresIn: '30d',
    })
    return { token, user: { id: user.id, username: user.username } }
  }
}
