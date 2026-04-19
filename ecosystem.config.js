module.exports = {
  apps: [
    {
      name: "veristream-web",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        NEXT_PUBLIC_SIGNALING_URL: "ws://localhost:3002"
      },
      instances: "max",
      exec_mode: "cluster"
    },
    {
      name: "veristream-signal",
      script: "npx",
      args: "tsx server/signaling.ts",
      env: {
        NODE_ENV: "production",
        SIGNALING_PORT: 3002
      },
      watch: false,
      autorestart: true
    }
  ]
};
