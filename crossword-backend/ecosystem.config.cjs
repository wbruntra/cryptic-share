module.exports = {
  apps: [
    {
      name: 'crossword-backend',
      cwd: __dirname,

      // Bun invocation
      interpreter: 'bun',
      script: 'bin/server.ts',

      exec_mode: 'fork',

      env: {
        NODE_ENV: 'production',
        PORT: 8921,
      },

      // Crash/restart behavior
      min_uptime: 5000,
      max_restarts: 10,
      exp_backoff_restart_delay: 1000,
    },
  ],
}
