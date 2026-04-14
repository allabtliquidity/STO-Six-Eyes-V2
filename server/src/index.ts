import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

import tradesRouter from "./routes/trades.js";
import strategiesRouter from "./routes/strategies.js";
import knowledgeRouter from "./routes/knowledge.js";
import marketRouter from "./routes/market.js";
import newsRouter from "./routes/news.js";
import dashboardRouter from "./routes/dashboard.js";
import setupRouter from "./routes/setup.js";
import discretionRouter from "./routes/discretion.js";
import backtestRouter from "./routes/backtest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api", tradesRouter);
app.use("/api", strategiesRouter);
app.use("/api", knowledgeRouter);
app.use("/api", marketRouter);
app.use("/api", newsRouter);
app.use("/api", dashboardRouter);
app.use("/api", setupRouter);
app.use("/api", discretionRouter);
app.use("/api", backtestRouter);

// Health check
app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));

// Serve frontend in production
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
