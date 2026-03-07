import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { User } from "@shared/schema";
import { storage } from "./storage";

import { log } from "./index";

export function setupAuth(app: Express) {
    const MemoryStore = createMemoryStore(session);
    const sessionSettings: session.SessionOptions = {
        secret: process.env.SESSION_SECRET || "super_secret_key_change_in_prod",
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === "production",
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
        },
        store: new MemoryStore({
            checkPeriod: 86400000 // prune expired entries every 24h
        }),
    };

    if (app.get("env") === "production") {
        app.set("trust proxy", 1); // trust first proxy
    }

    app.use(session(sessionSettings));
    app.use(passport.initialize());
    app.use(passport.session());

    passport.use(
        new LocalStrategy(async (username, password, done) => {
            try {
                const user = await storage.getUserByUsername(username);
                if (!user || user.password !== password) {
                    return done(null, false, { message: "Invalid username or password" });
                }
                // Don't return the password to the frontend
                const { password: _, ...userWithoutPassword } = user;
                return done(null, userWithoutPassword as User);
            } catch (err) {
                return done(err);
            }
        }),
    );

    passport.serializeUser((user, done) => {
        done(null, (user as User).id);
    });

    passport.deserializeUser(async (id: string, done) => {
        try {
            const user = await storage.getUser(id);
            if (!user) {
                return done(null, false);
            }
            const { password: _, ...userWithoutPassword } = user;
            done(null, userWithoutPassword as User);
        } catch (err) {
            done(err);
        }
    });

    app.post("/api/login", (req, res, next) => {
        passport.authenticate("local", (err: any, user: User, info: any) => {
            if (err) {
                return next(err);
            }
            if (!user) {
                return res.status(401).json({ message: info?.message || "Authentication failed" });
            }
            req.login(user, (err) => {
                if (err) {
                    return next(err);
                }
                log(`User logged in: ${user.username}`, "auth");
                return res.json({ message: "Login successful", user });
            });
        })(req, res, next);
    });

    app.post("/api/logout", (req, res, next) => {
        req.logout((err) => {
            if (err) {
                return next(err);
            }
            res.json({ message: "Logout successful" });
        });
    });

    app.get("/api/user", (req, res) => {
        if (req.isAuthenticated()) {
            res.json(req.user);
        } else {
            res.status(401).json({ message: "Not authenticated" });
        }
    });
}

export function ensureAuthenticated(req: any, res: any, next: any) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: "Not authenticated" });
}
