// --------------------
// Load environment variables
// --------------------
const requiredEnvVars = [
  'DB_DATABASE',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_HOSTNAME'
];

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

// --------------------
// Imports
// --------------------
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import fs from 'fs';
import https from 'https';

// Sequelize + models (single source of truth)
import db from './models/index.js';
const { sequelize } = db;

// Cache (dependency-injected)
import hotlink from './controllers/hotlink.js';

// Routes
import categoryRoutes from "./routes/category.js";
import feedRoutes from "./routes/feed.js";
import articleRoutes from "./routes/article.js";
import crawlRoutes from "./routes/crawl.js";
import managerRoutes from "./routes/manager.js";
import settingRoutes from "./routes/setting.js";
import feverRoutes from "./routes/fever.js";
import healthRoutes from "./routes/health.js";
import cleanupRoutes from "./routes/cleanup.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";
import mcpRoutes from "./routes/mcp.js";
import agentRoutes from "./routes/agent.js";
import opmlRoutes from "./routes/opml.js";
import actionRoutes from "./routes/action.js";
import rssRoutes from "./routes/rss.js";
import tagRoutes from "./routes/tag.js";
import smartFolderRoutes from "./routes/smartFolder.js";
import greaderRoutes from "./routes/greader.js";
import clusterRoutes from "./routes/cluster.js";

// Controller
import errorController from "./controllers/error.js";

// --------------------
// Express app
// --------------------
const app = express();

// Logging
app.use(
  morgan('[:date[clf]] :remote-addr - :method :url -> :status (:response-time ms)')
);

// Static assets
app.use(express.static("dist"));

// CORS
app.use(cors());

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Explicit CORS headers
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "OPTIONS, GET, POST, PUT, PATCH, DELETE"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// --------------------
// Routes
// --------------------
app.use("/api/categories", categoryRoutes);
app.use("/api/feeds", feedRoutes);
app.use("/api/articles", articleRoutes);
app.use("/api/crawl", crawlRoutes);
app.use("/api/manager", managerRoutes);
app.use("/api/setting", settingRoutes);
app.use("/api/fever", feverRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/cleanup", cleanupRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/mcp", mcpRoutes);
app.use("/agent", agentRoutes);
app.use("/api/opml", opmlRoutes);
app.use("/api/actions", actionRoutes);
app.use("/api/tags", tagRoutes);
app.use("/api/smartfolders", smartFolderRoutes);
app.use("/api/clusters", clusterRoutes);
app.use("/api/greader", greaderRoutes);
app.use("/rss", rssRoutes);

// 404 handler
app.use(errorController.get404);

// --------------------
// Server startup
// --------------------
const port = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // DB
    await sequelize.authenticate();
    console.log('Database connection established');

    if (process.env.DISABLE_LISTENER === 'true') {
      console.log('Server listener disabled by DISABLE_LISTENER env.');
      return;
    }

    if (process.env.ENABLE_HTTPS === 'true') {
      const options = {
        cert: fs.readFileSync('cert/fullchain.pem'),
        key: fs.readFileSync('cert/privkey.pem')
      };

      https.createServer(options, app).listen(port, () => {
        console.log(`HTTPS server running on port ${port}`);
      });
    } else {
      app.listen(port, () => {
        console.log(`HTTP server running on port ${port}`);
      });
    }
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
};

await startServer();

// --------------------
// Process-level safety
// --------------------
process.on('uncaughtException', err => {
  if (err?.name === 'RequestError') {
    console.error('UncaughtException:', err.message);
  } else {
    console.error('UncaughtException:', err);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// --------------------
// Clear cache refresh
// --------------------
const CACHE_REFRESH_INTERVAL = 5 * 60 * 1000;

setInterval(() => {
  hotlink.clearCache();
}, CACHE_REFRESH_INTERVAL);

export default app;