module.exports = {
  apps: [
    {
      name: "roomdesign-storage-cleanup",
      cwd: __dirname,
      script: "scripts/storage-cleanup.mjs",
      args: "--execute",
      node_args: "--experimental-transform-types",
      interpreter: "node",
      autorestart: false,
      cron_restart: "15 3 * * *",
      env_production: { NODE_ENV: "production" },
    },
  ],
};
