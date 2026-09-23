const port = process.env.PORT || "3000";

module.exports = {
  apps: [
    {
      name: "room-design",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${port}`,
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env_production: {
        NODE_ENV: "production",
        PORT: port,
      },
    },
  ],
};
