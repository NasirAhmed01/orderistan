// Start the HTTP server FIRST, connect to MongoDB in the background.
// (Cloudflare Containers / Vercel / pm2 need the port to open at once; every request already waits for the DB through init() in core.js.)
require("dotenv").config();
const { app, init, trust } = require("./app");
const jobs = require("./jobs");
const port = process.env.PORT || 5000;
app.listen(port, "0.0.0.0", () => console.log(`Orderistan API on port ${port} | trust proxy=${trust}`));
init().then(() => jobs.backfill()).catch((e) => console.error("Startup (DB) failed - will retry on the next request:", e.message));
