This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## 🚀 Production Deployment

VeriStream is designed to be highly portable. Follow these steps to deploy to a production environment.

### 1. Signaling Server
The signaling server (`server/signaling.ts`) is the heart of the WebRTC handshake. 
- Deploy it to a Node.js-capable environment (AWS EC2, DigitalOcean, Heroku).
- **SSL is Mandatory**: In production, browsers require HTTPS for camera access. You must use `wss://` for the signaling URL.
- Recommended: Use a reverse proxy like Nginx or Caddy with Let's Encrypt for SSL termination.

### 2. Environment Variables
Set the following environment variable in both the **Capture Client** and **Admin Dashboard**:
`NEXT_PUBLIC_SIGNALING_URL=wss://your-signaling-domain.com`

### 3. Client & Admin Apps
Both apps are Next.js projects and can be deployed to Vercel, Netlify, or any Docker-ready host.
- For Docker: Use the provided `Dockerfile` (standalone mode is enabled in `next.config.ts`).

### 📦 Docker Compose (Full Stack)
```bash
docker-compose up -d --build
```

## 🔒 Security Best Practices
- **Restrict CORS**: Update `server/signaling.ts` to only allow your specific production domains.
- **Turn Server**: For users behind strict corporate firewalls, consider adding a TURN server (e.g., [Coturn](https://github.com/coturn/coturn)) to the `ICE_SERVERS` configuration in `useWebRTC.ts`.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
