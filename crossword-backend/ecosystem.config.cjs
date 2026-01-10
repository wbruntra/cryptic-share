module.exports = {
  apps: [
    {
      name: 'crossword-backend',
      script: 'index.ts',
      interpreter: '/home/william/.bun/bin/bun',
      interpreter_args: 'run',
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 8921,
      },
    },
  ],
}
