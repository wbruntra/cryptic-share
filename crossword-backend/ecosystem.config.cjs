module.exports = {
  apps: [
    {
      name: 'crossword-backend',
      cwd: __dirname,
      script: '/home/william/.bun/bin/bun',
      args: 'run bin/server.ts',
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 8921,
      },
      restart_delay: 5000,
    },
  ],
}
