module.exports = {
  apps: [
    {
      name: 'tenders-whizzonby',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};
