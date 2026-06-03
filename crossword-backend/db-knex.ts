import knex from 'knex'
import config from './knexfile'

const environment = process.env.NODE_ENV || 'development'
const dbConfig = config[environment] || config['development'] || config['development']

const db = knex(dbConfig)

export default db
