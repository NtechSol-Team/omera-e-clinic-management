import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertPatientSchema,
  insertVisitSchema,
  insertMedicineSchema,
  insertTreatmentSchema,
  insertBillSchema,
  insertExpenseSchema,
  paymentAdjustmentSchema,
  insertAppointmentSchema,
  paginationSchema,
  // registerSchema, loginSchema removed with auth
} from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import { uploadToStorage, getSignedUrlFromStorage, deleteFromStorage } from "./storage-service";

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/heif", "image/heic"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, and HEIF are allowed."));
    }
  },
});

import { ensureAuthenticated } from "./auth";

// Simple in-memory cache for signed URLs to speed up photo loading
// Key: fileId, Value: { url: string, expires: number }
const signedUrlCache = new Map<string, { url: string, expires: number }>();
const CACHE_TTL = 4 * 60 * 1000; // 4 minutes (slightly less than the 5min signed URL expiry)

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Protect all API routes registered below
  // Note: /api/login and /api/logout are registered in setupAuth() before this function
  app.use("/api", ensureAuthenticated);

  // ==================== PATIENTS ====================

  app.get("/api/patients", async (req, res) => {
    try {
      const { limit, offset } = paginationSchema.parse(req.query);
      const { data, total } = await storage.getPatientsPaginated(limit, offset);
      res.json({ data, total, limit, offset });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to fetch patients" });
    }
  });

  app.get("/api/patients/:id", async (req, res) => {
    try {
      const patient = await storage.getPatient(req.params.id);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      res.json(patient);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch patient" });
    }
  });

  app.post("/api/patients", async (req, res) => {
    try {
      const validated = insertPatientSchema.parse(req.body);
      const patient = await storage.createPatient(validated);
      res.status(201).json(patient);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create patient" });
    }
  });

  app.patch("/api/patients/:id", async (req, res) => {
    try {
      const validated = insertPatientSchema.parse(req.body);
      const patient = await storage.updatePatient(req.params.id, validated);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      // Update all related bills with the new patient name
      await storage.updatePatientBillsName(req.params.id, patient.name);
      res.json(patient);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update patient" });
    }
  });

  app.delete("/api/patients/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePatient(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Patient not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete patient" });
    }
  });

  // ==================== VISITS ====================

  app.get("/api/visits", async (req, res) => {
    try {
      const visits = await storage.getVisits();
      res.json(visits);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch visits" });
    }
  });

  app.get("/api/visits/:patientId", async (req, res) => {
    try {
      const visits = await storage.getVisitsByPatient(req.params.patientId);

      // Process in small batches to avoid overwhelming the storage service
      const BATCH_SIZE = 3;
      const visitsWithUrls: any[] = [];

      for (let i = 0; i < visits.length; i += BATCH_SIZE) {
        const batch = visits.slice(i, i + BATCH_SIZE);
        const resolvedBatch = await Promise.all(batch.map(async (visit) => {
          const photoIds: string[] = visit.photoFileIds ?? [];
          if (photoIds.length === 0) return { ...visit, photoUrls: [], photoUrl: undefined };

          const urls = await Promise.all(photoIds.map(async (fileId) => {
            const cached = signedUrlCache.get(fileId);
            if (cached && cached.expires > Date.now()) return cached.url;
            try {
              const signedUrl = await getSignedUrlFromStorage(fileId);
              signedUrlCache.set(fileId, { url: signedUrl, expires: Date.now() + CACHE_TTL });
              return signedUrl;
            } catch (err: any) {
              console.log(`[Storage] Failed URL: ${fileId.slice(-6)} - ${err.code || 'Error'}`);
              return null;
            }
          }));

          const validUrls = urls.filter(Boolean) as string[];
          return { ...visit, photoUrls: validUrls, photoUrl: validUrls[0] };
        }));
        visitsWithUrls.push(...resolvedBatch);
      }

      res.json(visitsWithUrls);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch visits" });
    }
  });

  app.post("/api/visits", async (req, res) => {
    try {
      const validated = insertVisitSchema.parse(req.body);
      const visit = await storage.createVisit(validated);
      res.status(201).json(visit);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create visit" });
    }
  });

  app.patch("/api/visits/:id", async (req, res) => {
    try {
      const validated = insertVisitSchema.parse(req.body);
      const visit = await storage.updateVisit(req.params.id, validated);
      if (!visit) {
        return res.status(404).json({ error: "Visit not found" });
      }
      res.json(visit);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update visit" });
    }
  });

  app.post("/api/visits/:id/photo", upload.single("photo"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No photo uploaded" });
      }

      const visitId = req.params.id;
      const targetVisit = await storage.getVisit(visitId);

      if (!targetVisit) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: "Visit not found" });
      }

      const patient = await storage.getPatient(targetVisit.patientId);
      if (!patient) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: "Patient not found" });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const extension = path.extname(req.file.originalname) || ".jpg";
      // Use patient ID + visit ID + timestamp for unique, privacy-safe filenames
      const fileName = `patient_${patient.id}_visit_${targetVisit.visitNumber}_${timestamp}${extension}`;

      const fileId = await uploadToStorage(req.file.path, fileName);

      // Append photo to visit's photo_file_ids array
      const updatedVisit = await storage.addPhotoToVisit(visitId, fileId);

      // Remove local temp file
      fs.unlinkSync(req.file.path);

      // Generate signed URL immediately for preview
      const signedUrl = await getSignedUrlFromStorage(fileId);

      res.json({ message: "Photo uploaded successfully", fileId, url: signedUrl, visit: updatedVisit });
    } catch (error) {
      if (req.file) fs.unlinkSync(req.file.path);
      console.error("Photo upload error:", error);
      res.status(500).json({ error: "Failed to upload photo" });
    }
  });

  app.get("/api/visits/:id/photo-url", async (req, res) => {
    try {
      const visit = await storage.getVisit(req.params.id);

      if (!visit || !visit.photoFileId) {
        return res.status(404).json({ error: "Photo not found for this visit" });
      }

      const cached = signedUrlCache.get(visit.photoFileId);
      if (cached && cached.expires > Date.now()) {
        return res.json({ url: cached.url });
      }

      const signedUrl = await getSignedUrlFromStorage(visit.photoFileId);

      // Update cache
      signedUrlCache.set(visit.photoFileId, {
        url: signedUrl,
        expires: Date.now() + CACHE_TTL
      });

      res.json({ url: signedUrl });
    } catch (error) {
      console.error("Error getting signed URL:", error);
      res.status(500).json({ error: "Failed to get photo URL" });
    }
  });

  app.delete("/api/visits/:id/photo", async (req, res) => {
    try {
      const visit = await storage.getVisit(req.params.id);
      const fileId = req.query.fileId as string;

      if (!visit || !visit.photoFileIds || visit.photoFileIds.length === 0) {
        return res.status(404).json({ error: "No photos found for this visit" });
      }

      const targetFileId = fileId || visit.photoFileIds[0];

      // Delete from storage service
      try {
        await deleteFromStorage(targetFileId);
      } catch (storageError) {
        console.error("Error deleting from storage service:", storageError);
        // Continue even if storage deletion fails, to clear it from our DB
      }

      // Remove specific photo from visit's array
      await storage.removePhotoFromVisit(visit.id, targetFileId);

      // Invalidate signed URL cache
      signedUrlCache.delete(targetFileId);

      res.json({ message: "Photo deleted successfully" });
    } catch (error) {
      console.error("Error deleting photo:", error);
      res.status(500).json({ error: "Failed to delete photo" });
    }
  });

  // ==================== MEDICINES ====================

  app.get("/api/medicines", async (req, res) => {
    try {
      const { limit, offset } = paginationSchema.parse(req.query);
      const { data, total } = await storage.getMedicinesPaginated(limit, offset);
      res.json({ data, total, limit, offset });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to fetch medicines" });
    }
  });

  app.get("/api/medicines/:id", async (req, res) => {
    try {
      const medicine = await storage.getMedicine(req.params.id);
      if (!medicine) {
        return res.status(404).json({ error: "Medicine not found" });
      }
      res.json(medicine);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch medicine" });
    }
  });

  app.post("/api/medicines", async (req, res) => {
    try {
      const validated = insertMedicineSchema.parse(req.body);
      const medicine = await storage.createMedicine(validated);
      res.status(201).json(medicine);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create medicine" });
    }
  });

  app.patch("/api/medicines/:id", async (req, res) => {
    try {
      const validated = insertMedicineSchema.parse(req.body);
      const medicine = await storage.updateMedicine(req.params.id, validated);
      if (!medicine) {
        return res.status(404).json({ error: "Medicine not found" });
      }
      res.json(medicine);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update medicine" });
    }
  });

  app.delete("/api/medicines/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMedicine(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Medicine not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete medicine" });
    }
  });

  // ==================== TREATMENTS ====================

  app.get("/api/treatments", async (req, res) => {
    try {
      const { limit, offset } = paginationSchema.parse(req.query);
      try {
        const { data, total } = await storage.getTreatmentsPaginated(limit, offset);
        res.json({ data, total, limit, offset });
      } catch (paginationError) {
        // Fallback to non-paginated method
        console.error("Paginated query failed, using fallback:", paginationError);
        const allTreatments = await storage.getTreatments();
        const data = allTreatments.slice(offset, offset + limit);
        const total = allTreatments.length;
        res.json({ data, total, limit, offset });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Treatments fetch error:", error);
      res.status(500).json({ error: "Failed to fetch treatments" });
    }
  });

  app.get("/api/treatments/:id", async (req, res) => {
    try {
      const treatment = await storage.getTreatment(req.params.id);
      if (!treatment) {
        return res.status(404).json({ error: "Treatment not found" });
      }
      res.json(treatment);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch treatment" });
    }
  });

  app.post("/api/treatments", async (req, res) => {
    try {
      const validated = insertTreatmentSchema.parse(req.body);
      const treatment = await storage.createTreatment(validated);
      res.status(201).json(treatment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create treatment" });
    }
  });

  app.patch("/api/treatments/:id", async (req, res) => {
    try {
      const validated = insertTreatmentSchema.parse(req.body);
      const treatment = await storage.updateTreatment(req.params.id, validated);
      if (!treatment) {
        return res.status(404).json({ error: "Treatment not found" });
      }
      res.json(treatment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update treatment" });
    }
  });

  app.delete("/api/treatments/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTreatment(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Treatment not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete treatment" });
    }
  });

  // ==================== BILLS ====================

  app.get("/api/bills", async (req, res) => {
    try {
      const { limit, offset } = paginationSchema.parse(req.query);
      const { data, total } = await storage.getBillsPaginated(limit, offset);
      res.json({ data, total, limit, offset });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to fetch bills" });
    }
  });

  app.get("/api/bills/:id", async (req, res) => {
    try {
      const bill = await storage.getBill(req.params.id);
      if (!bill) {
        return res.status(404).json({ error: "Bill not found" });
      }
      res.json(bill);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bill" });
    }
  });

  app.post("/api/bills", async (req, res) => {
    try {
      const validated = insertBillSchema.parse(req.body);

      // Get patient name
      const patient = await storage.getPatient(validated.patientId);
      if (!patient) {
        return res.status(400).json({ error: "Patient not found" });
      }

      const bill = await storage.createBillWithStockUpdate(validated, patient.name);
      res.status(201).json(bill);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof Error && (error.message.startsWith("Insufficient stock") || error.message.includes("not found"))) {
        return res.status(400).json({ error: error.message });
      }
      console.error("Error creating bill:", error);
      res.status(500).json({ error: "Failed to create bill", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch("/api/bills/:id", async (req, res) => {
    try {
      const validated = insertBillSchema.parse(req.body);

      // Get patient name
      const patient = await storage.getPatient(validated.patientId);
      if (!patient) {
        return res.status(400).json({ error: "Patient not found" });
      }

      // Get existing bill to restore medicine stock
      const existingBill = await storage.getBill(req.params.id);
      if (existingBill) {
        // Restore medicine stock from old bill
        for (const med of existingBill.medicines) {
          await storage.updateMedicineStock(med.medicineId, med.quantity);
        }
      }

      // Reduce medicine stock for new bill
      for (const med of validated.medicines) {
        await storage.updateMedicineStock(med.medicineId, -med.quantity);
      }

      const bill = await storage.updateBill(req.params.id, validated, patient.name);
      if (!bill) {
        return res.status(404).json({ error: "Bill not found" });
      }
      res.json(bill);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update bill" });
    }
  });

  app.patch("/api/bills/:id/payment", async (req, res) => {
    try {
      const { addAmount, setAmount, paymentMode } = req.body;

      if (typeof addAmount !== "undefined" && typeof addAmount !== "number") {
        return res.status(400).json({ error: "Invalid addAmount" });
      }
      if (typeof setAmount !== "undefined" && typeof setAmount !== "number") {
        return res.status(400).json({ error: "Invalid setAmount" });
      }

      const currentBill = await storage.getBill(req.params.id);
      if (!currentBill) {
        return res.status(404).json({ error: "Bill not found" });
      }

      let newTotalPaid: number;
      let delta: number | undefined; // the incremental amount being added this payment

      if (typeof setAmount === "number") {
        // Absolute override — reset mode tracking to the chosen mode
        if (setAmount < 0 || setAmount > currentBill.grandTotal) {
          return res.status(400).json({ error: "setAmount must be between 0 and bill total" });
        }
        newTotalPaid = setAmount;
        delta = undefined; // signal setAmount mode (no delta)
      } else {
        // Additive payment
        const add = typeof addAmount === "number" ? addAmount : undefined;
        if (typeof add === "undefined" || add < 0) {
          return res.status(400).json({ error: "Invalid payment amount" });
        }
        newTotalPaid = currentBill.amountPaid + add;
        if (newTotalPaid > currentBill.grandTotal) {
          return res.status(400).json({
            error: `Cannot exceed bill amount. Remaining: ₹${(currentBill.grandTotal - currentBill.amountPaid).toFixed(2)}`
          });
        }
        delta = add; // pass the increment so storage can track per-mode
      }

      const bill = await storage.updateBillPayment(req.params.id, newTotalPaid, paymentMode, delta);
      if (!bill) {
        return res.status(404).json({ error: "Bill not found" });
      }
      res.json(bill);
    } catch (error) {
      res.status(500).json({ error: "Failed to update payment" });
    }
  });


  app.delete("/api/bills/:id", async (req, res) => {
    try {
      const bill = await storage.getBill(req.params.id);
      if (!bill) {
        return res.status(404).json({ error: "Bill not found" });
      }

      // Restore medicine stock for deleted bill
      const medicines = Array.isArray(bill.medicines) ? bill.medicines : [];
      for (const med of medicines) {
        if (med && med.medicineId && med.quantity) {
          await storage.updateMedicineStock(med.medicineId, med.quantity);
        }
      }

      const deleted = await storage.deleteBill(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Bill not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Delete bill error:", error);
      res.status(500).json({ error: "Failed to delete bill" });
    }
  });

  // ==================== EXPENSES ====================

  app.get("/api/expenses", async (req, res) => {
    try {
      const { limit, offset } = paginationSchema.parse(req.query);
      const { data, total } = await storage.getExpensesPaginated(limit, offset);
      res.json({ data, total, limit, offset });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to fetch expenses" });
    }
  });

  app.get("/api/expenses/:id", async (req, res) => {
    try {
      const expense = await storage.getExpense(req.params.id);
      if (!expense) {
        return res.status(404).json({ error: "Expense not found" });
      }
      res.json(expense);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch expense" });
    }
  });

  app.post("/api/expenses", async (req, res) => {
    try {
      const validated = insertExpenseSchema.parse(req.body);
      const expense = await storage.createExpense(validated);
      res.status(201).json(expense);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create expense" });
    }
  });

  app.patch("/api/expenses/:id", async (req, res) => {
    try {
      const validated = insertExpenseSchema.parse(req.body);
      const expense = await storage.updateExpense(req.params.id, validated);
      if (!expense) {
        return res.status(404).json({ error: "Expense not found" });
      }
      res.json(expense);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update expense" });
    }
  });

  app.delete("/api/expenses/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteExpense(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Expense not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete expense" });
    }
  });

  // ==================== APPOINTMENTS ====================

  app.get("/api/appointments", async (req, res) => {
    try {
      const appointments = await storage.getAppointments();
      res.json(appointments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch appointments" });
    }
  });

  app.get("/api/appointments/patient/:patientId", async (req, res) => {
    try {
      const appointments = await storage.getAppointmentsByPatient(req.params.patientId);
      res.json(appointments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch appointments" });
    }
  });

  app.get("/api/appointments/:id", async (req, res) => {
    try {
      const appointment = await storage.getAppointment(req.params.id);
      if (!appointment) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      res.json(appointment);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch appointment" });
    }
  });

  app.post("/api/appointments", async (req, res) => {
    try {
      console.log("Creating appointment with body:", req.body);
      const validated = insertAppointmentSchema.parse(req.body);
      const appointment = await storage.createAppointment(validated);
      res.status(201).json(appointment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.log("Validation error:", JSON.stringify(error.errors));
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create appointment" });
    }
  });

  app.patch("/api/appointments/:id", async (req, res) => {
    try {
      const validated = insertAppointmentSchema.parse(req.body);
      const appointment = await storage.updateAppointment(req.params.id, validated);
      if (!appointment) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      res.json(appointment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update appointment" });
    }
  });

  app.delete("/api/appointments/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteAppointment(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete appointment" });
    }
  });

  return httpServer;
}
