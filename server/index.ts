import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import compression from "compression";
import chalk from "chalk";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import helmet from "helmet";
import { setupAuth } from "./auth";
import { User } from "@shared/schema";

const app = express();

// Use Helmet for security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // unsafe-eval needed for some dev tools/vite
        imgSrc: ["'self'", "data:", "blob:", "https://s3.wasabisys.com"],
        connectSrc: ["'self'", "ws:", "wss:"], // needed for HMR
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      },
    },
  })
);

// When running behind a proxy (e.g. Render, Heroku), enable trust proxy
// so Express knows the original request protocol (https)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Enable gzip compression for responses to reduce transfer size
app.use(compression());

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Setup Authentication (Session + Passport)
setupAuth(app);

const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Configure CORS to allow requests from the frontend
const clientOrigin = process.env.CLIENT_ORIGIN || (process.env.NODE_ENV === "production" ? "http://localhost:3000" : "*");
app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  }),
);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const status = res.statusCode;
      const statusIcon = status >= 200 && status < 300 ? chalk.green("✓") : status >= 400 ? chalk.red("✗") : "";
      const user = (req as any).user as User | undefined;
      const userLabel = user ? ` (${user.username})` : "";

      let methodLabel = req.method;
      if (req.method === "GET") methodLabel = chalk.blue(req.method);
      else if (req.method === "POST") methodLabel = chalk.yellow(req.method);
      else if (req.method === "PATCH") methodLabel = chalk.cyan(req.method);
      else if (req.method === "DELETE") methodLabel = chalk.red(req.method);

      const statusLabel = status >= 200 && status < 300 ? chalk.green(status) : chalk.red(status);

      const logLine = `${methodLabel} ${path}${userLabel} ${statusLabel} ${statusIcon} in ${duration}ms`;
      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    await registerRoutes(httpServer, app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      // Only send response if headers haven't been sent yet
      if (!res.headersSent) {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";
        res.status(status).json({ message });
      }
      console.error("Unhandled error:", err);
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || "3000", 10);
    httpServer.listen(port, "0.0.0.0", () => {
      log(`serving on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();
