module.exports = {
  apps: [
    {
      name: 'crossword-backend',
      script: 'start.js',
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
