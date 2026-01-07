module.exports = {
  apps: [
    {
      name: 'crossword-backend',
      script: 'index.ts',
      interpreter: '/home/william/.bun/bin/bun',
      env: {
        NODE_ENV: 'development',
        PORT: 8921,
      },
    },
  ],
}
