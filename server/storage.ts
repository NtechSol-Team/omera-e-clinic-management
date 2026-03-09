import {
  type Patient,
  type InsertPatient,
  type Visit,
  type InsertVisit,
  type Medicine,
  type InsertMedicine,
  type Treatment,
  type InsertTreatment,
  type Bill,
  type InsertBill,
  type Expense,
  type InsertExpense,
  type BillTreatmentItem,
  type BillMedicineItem,
  type Appointment,
  type InsertAppointment,
  type User,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { pool } from "./db";

export interface IStorage {
  // Patients
  getPatients(): Promise<Patient[]>;
  getPatient(id: string): Promise<Patient | undefined>;
  createPatient(patient: InsertPatient): Promise<Patient>;
  updatePatient(id: string, patient: InsertPatient): Promise<Patient | undefined>;
  deletePatient(id: string): Promise<boolean>;

  // Visits
  getVisits(): Promise<Visit[]>;
  getVisit(id: string): Promise<Visit | undefined>;
  getVisitsByPatient(patientId: string): Promise<Visit[]>;
  createVisit(visit: InsertVisit): Promise<Visit>;
  updateVisit(id: string, visit: InsertVisit): Promise<Visit | undefined>;

  // Medicines
  getMedicines(): Promise<Medicine[]>;
  getMedicine(id: string): Promise<Medicine | undefined>;
  createMedicine(medicine: InsertMedicine): Promise<Medicine>;
  updateMedicine(id: string, medicine: InsertMedicine): Promise<Medicine | undefined>;
  deleteMedicine(id: string): Promise<boolean>;
  updateMedicineStock(id: string, quantity: number): Promise<Medicine | undefined>;

  // Treatments
  getTreatments(): Promise<Treatment[]>;
  getTreatment(id: string): Promise<Treatment | undefined>;
  createTreatment(treatment: InsertTreatment): Promise<Treatment>;
  updateTreatment(id: string, treatment: InsertTreatment): Promise<Treatment | undefined>;
  deleteTreatment(id: string): Promise<boolean>;

  // Bills
  getBills(): Promise<Bill[]>;
  getBill(id: string): Promise<Bill | undefined>;
  createBill(bill: InsertBill, patientName: string): Promise<Bill>;
  createBillWithStockUpdate(bill: InsertBill, patientName: string): Promise<Bill>;
  updateBill(id: string, bill: InsertBill, patientName: string): Promise<Bill | undefined>;
  updateBillPayment(id: string, amountPaid: number, paymentMode?: 'Cash' | 'Online' | null): Promise<Bill | undefined>;
  updatePatientBillsName(patientId: string, patientName: string): Promise<void>;
  deleteBill(id: string): Promise<boolean>;

  // Expenses
  getExpenses(): Promise<Expense[]>;
  getExpense(id: string): Promise<Expense | undefined>;
  createExpense(expense: InsertExpense): Promise<Expense>;
  updateExpense(id: string, expense: InsertExpense): Promise<Expense | undefined>;
  deleteExpense(id: string): Promise<boolean>;

  // Appointments
  getAppointments(): Promise<Appointment[]>;
  getAppointment(id: string): Promise<Appointment | undefined>;
  getAppointmentsByPatient(patientId: string): Promise<Appointment[]>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, appointment: InsertAppointment): Promise<Appointment | undefined>;
  deleteAppointment(id: string): Promise<boolean>;

  // Users/Auth
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: Partial<User>): Promise<User>;
}

// User table and auth-related types removed

type DbPatientRow = {
  id: string | number;
  name: string;
  phone: string;
  registration_date: string;
};

type DbVisitRow = {
  id: string | number;
  patient_id: string | number;
  date: string;
  complaints: string;
  diagnosis: string;
  visit_number: number;
  photo_file_ids?: string[] | null;
};

type DbMedicineRow = {
  id: string | number;
  name: string;
  purchase_cost: number;
  selling_price: number;
  quantity: number;
};

type DbTreatmentRow = {
  id: string | number;
  name: string;
  default_price: number;
};

type DbBillRow = {
  id: string | number;
  patient_id: string | number;
  patient_name: string;
  date: string;
  treatments: BillTreatmentItem[] | string;
  medicines: BillMedicineItem[] | string;
  treatment_total: number;
  medicine_total: number;
  grand_total: number;
  discount: number;
  final_amount: number;
  amount_paid: number;
  pending_amount: number;
  payment_mode?: 'Cash' | 'Online' | null;
  cash_amount?: number;
  online_amount?: number;
};

type DbExpenseRow = {
  id: string | number;
  description: string;
  amount: number;
  date: string;
  category: string;
};

type DbAppointmentRow = {
  id: string | number;
  patient_id: string | number;
  patient_name?: string; // We might join this or fetch it separately
  date: string;
  time: string;
  reason: string;
  status: string;
};

type DbUserRow = {
  id: number;
  username: string;
  password?: string;
  role: 'admin' | 'receptionist';
  created_at: string;
};

const createTableStatements = [
  `CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    registration_date TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS visits (
    id UUID PRIMARY KEY,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    complaints TEXT NOT NULL,
    diagnosis TEXT NOT NULL,
    visit_number INTEGER NOT NULL,
    photo_file_ids TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS visits_patient_idx ON visits(patient_id)`,
  `CREATE TABLE IF NOT EXISTS medicines (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    purchase_cost DOUBLE PRECISION NOT NULL,
    selling_price DOUBLE PRECISION NOT NULL,
    quantity INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS treatments (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    default_price DOUBLE PRECISION NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bills (
    id UUID PRIMARY KEY,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    patient_name TEXT NOT NULL,
    date TEXT NOT NULL,
    treatments JSONB NOT NULL,
    medicines JSONB NOT NULL,
    treatment_total DOUBLE PRECISION NOT NULL,
    medicine_total DOUBLE PRECISION NOT NULL,
    grand_total DOUBLE PRECISION NOT NULL,
    discount DOUBLE PRECISION DEFAULT 0,
    final_amount DOUBLE PRECISION DEFAULT 0,
    amount_paid DOUBLE PRECISION NOT NULL,
    pending_amount DOUBLE PRECISION NOT NULL,
    payment_mode TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS bills_patient_idx ON bills(patient_id)`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY,
    description TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    date TEXT NOT NULL,
    category TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS appointments_patient_idx ON appointments(patient_id)`,
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
];

async function ensureTables(): Promise<void> {
  // Migration: Drop users table if it uses UUID to recreate as SERIAL
  const { rows: userTableExists } = await pool.query(
    "SELECT 1 FROM information_schema.tables WHERE table_name = 'users'"
  );
  if (userTableExists.length > 0) {
    const { rows: idType } = await pool.query(
      "SELECT data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'id'"
    );
    if (idType[0]?.data_type === 'uuid') {
      console.log("Dropping users table to migrate ID from UUID to SERIAL...");
      await pool.query("DROP TABLE users");
    }
  }

  for (const statement of createTableStatements) {
    await pool.query(statement);
  }
  // Migration for new time column
  await pool.query("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS time TEXT DEFAULT ''");

  // Migration for visits photo_file_ids array (multi-photo)
  await pool.query("ALTER TABLE visits ADD COLUMN IF NOT EXISTS photo_file_id TEXT");
  await pool.query("ALTER TABLE visits ADD COLUMN IF NOT EXISTS photo_file_ids TEXT[] DEFAULT '{}'");
  // Backfill photo_file_ids from legacy photo_file_id for existing rows
  await pool.query("UPDATE visits SET photo_file_ids = ARRAY[photo_file_id] WHERE photo_file_id IS NOT NULL AND (photo_file_ids IS NULL OR array_length(photo_file_ids, 1) IS NULL)");

  // Migration for discount fields
  await pool.query("ALTER TABLE bills ADD COLUMN IF NOT EXISTS discount DOUBLE PRECISION DEFAULT 0");
  await pool.query("ALTER TABLE bills ADD COLUMN IF NOT EXISTS final_amount DOUBLE PRECISION DEFAULT 0");
  await pool.query("ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_mode TEXT");
  // Migration for per-mode payment tracking
  await pool.query("ALTER TABLE bills ADD COLUMN IF NOT EXISTS cash_amount DOUBLE PRECISION DEFAULT 0");
  await pool.query("ALTER TABLE bills ADD COLUMN IF NOT EXISTS online_amount DOUBLE PRECISION DEFAULT 0");
  // Backfill: if payment_mode is Cash set cash_amount, if Online set online_amount
  await pool.query("UPDATE bills SET cash_amount = amount_paid WHERE cash_amount = 0 AND payment_mode = 'Cash' AND amount_paid > 0");
  await pool.query("UPDATE bills SET online_amount = amount_paid WHERE online_amount = 0 AND payment_mode = 'Online' AND amount_paid > 0");

  // Backfill final_amount for existing records if it's 0 but grand_total is not (optional but good for consistency)
  await pool.query("UPDATE bills SET final_amount = grand_total WHERE final_amount = 0 AND discount = 0 AND grand_total > 0");

  // Backfill payment_mode for legacy records where amount_paid > 0 but payment_mode is NULL
  await pool.query("UPDATE bills SET payment_mode = 'Cash' WHERE payment_mode IS NULL AND amount_paid > 0");

  // Seed default users if none exist
  const { rows: userCount } = await pool.query("SELECT COUNT(*) FROM users");
  if (parseInt(userCount[0].count) === 0) {
    console.log("Seeding default users (plain text passwords)...");
    const adminPass = process.env.ADMIN_PASSWORD || "Dr.Admin";
    const recepPass = process.env.RECEPTIONIST_PASSWORD || "Clinic.123";

    await pool.query(
      "INSERT INTO users (username, password, role) VALUES ($1, $2, $3), ($4, $5, $6)",
      [
        "admin", adminPass, "admin",
        "receptionist", recepPass, "receptionist"
      ]
    );
    console.log("Default users seeded.");
  }
}

class DataCache {
  private store = new Map<string, { value: unknown; expires: number }>();
  constructor(private ttlMs: number) { }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }

  invalidate(prefix?: string): void {
    if (!prefix) {
      this.store.clear();
      return;
    }
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}

type EntityTable = "patients" | "visits" | "medicines" | "treatments" | "bills" | "expenses" | "appointments";
type IdMode = "numeric" | "text";

async function getColumnDataType(table: string, column: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ data_type: string }>(
    `SELECT data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return rows[0]?.data_type;
}

async function detectIdModes(): Promise<Record<string, IdMode>> {
  const tables = ["patients", "visits", "medicines", "treatments", "bills", "expenses", "appointments", "users"];
  const entries = await Promise.all(
    tables.map(async (table) => {
      const dataType = await getColumnDataType(table, "id");
      const mode: IdMode = dataType === "bigint" || dataType === "integer" ? "numeric" : "text";
      return [table, mode] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<string, IdMode>;
}

const normalizeId = (value: string | number): string => value.toString();

const mapUser = (row: DbUserRow): User => ({
  id: Number(row.id),
  username: row.username,
  password: row.password,
  role: row.role,
  createdAt: row.created_at,
});

const mapPatient = (row: DbPatientRow): Patient => ({
  id: normalizeId(row.id),
  name: row.name,
  phone: row.phone,
  registrationDate: row.registration_date,
});

const mapVisit = (row: DbVisitRow): Visit => {
  const ids = Array.isArray(row.photo_file_ids) ? row.photo_file_ids : [];
  return {
    id: normalizeId(row.id),
    patientId: normalizeId(row.patient_id),
    date: row.date,
    complaints: row.complaints,
    diagnosis: row.diagnosis,
    visitNumber: row.visit_number,
    photoFileIds: ids,
    photoFileId: ids.length > 0 ? ids[0] : null,
  };
};

const mapMedicine = (row: DbMedicineRow): Medicine => ({
  id: normalizeId(row.id),
  name: row.name,
  purchaseCost: row.purchase_cost,
  sellingPrice: row.selling_price,
  quantity: row.quantity,
});

const mapTreatment = (row: DbTreatmentRow): Treatment => ({
  id: normalizeId(row.id),
  name: row.name,
  defaultPrice: row.default_price,
});

const mapBill = (row: DbBillRow): Bill => {
  // Parse medicines if it's a string (stored as JSON in DB)
  let medicines = row.medicines ?? [];
  if (typeof medicines === "string") {
    try {
      medicines = JSON.parse(medicines);
    } catch (e) {
      medicines = [];
    }
  }

  // Parse treatments if it's a string (stored as JSON in DB)
  let treatments = row.treatments ?? [];
  if (typeof treatments === "string") {
    try {
      treatments = JSON.parse(treatments);
    } catch (e) {
      treatments = [];
    }
  }

  // Properly handle finalAmount - only fallback to grand_total if finalAmount is truly null/undefined
  const finalAmount = row.final_amount !== null && row.final_amount !== undefined
    ? row.final_amount
    : row.grand_total;

  return {
    id: normalizeId(row.id),
    patientId: normalizeId(row.patient_id),
    patientName: row.patient_name,
    date: row.date,
    treatments: treatments as BillTreatmentItem[],
    medicines: medicines as BillMedicineItem[],
    treatmentTotal: row.treatment_total,
    medicineTotal: row.medicine_total,
    grandTotal: row.grand_total,
    discount: row.discount || 0,
    finalAmount: finalAmount,
    amountPaid: row.amount_paid,
    pendingAmount: row.pending_amount,
    paymentMode: row.payment_mode as 'Cash' | 'Online' | null,
    cashAmount: row.cash_amount ?? 0,
    onlineAmount: row.online_amount ?? 0,
  };
};

const mapExpense = (row: DbExpenseRow): Expense => ({
  id: normalizeId(row.id),
  description: row.description,
  amount: row.amount,
  date: row.date,
  category: row.category,
});

const mapAppointment = (row: DbAppointmentRow): Appointment => ({
  id: normalizeId(row.id),
  patientId: normalizeId(row.patient_id),
  patientName: row.patient_name,
  date: row.date,
  time: row.time || "09:00", // Default for legacy data
  reason: row.reason,
  status: row.status,
  isUpcoming: new Date(row.date) >= new Date(new Date().setHours(0, 0, 0, 0)),
});

export class PostgresStorage implements IStorage {
  private ready: Promise<void>;
  private idModes: Record<EntityTable, IdMode> = {
    patients: "text",
    visits: "text",
    medicines: "text",
    treatments: "text",
    bills: "text",
    expenses: "text",
    appointments: "text",
  };
  private cache = new DataCache(5_000);

  constructor() {
    this.ready = (async () => {
      await ensureTables();
      this.idModes = await detectIdModes();
    })();
  }

  private async waitForReady() {
    await this.ready;
  }

  private usesNumericId(table: EntityTable): boolean {
    return this.idModes[table] === "numeric";
  }

  private convertId(table: EntityTable, id: string): string | number {
    if (!this.usesNumericId(table)) {
      return id;
    }
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) {
      throw new Error(`Invalid ${table} id: ${id}`);
    }
    return numericId;
  }

  // Patients
  async getPatients(): Promise<Patient[]> {
    await this.waitForReady();
    const cached = this.cache.get<Patient[]>("patients");
    if (cached) {
      return cached;
    }
    const { rows } = await pool.query<DbPatientRow>(
      "SELECT id, name, phone, registration_date FROM patients ORDER BY registration_date DESC"
    );
    const patients = rows.map(mapPatient);
    this.cache.set("patients", patients);
    return patients;
  }

  async getPatient(id: string): Promise<Patient | undefined> {
    await this.waitForReady();
    const normalizedId = normalizeId(id);
    const cacheKey = `patient:${normalizedId}`;
    const cached = this.cache.get<Patient>(cacheKey);
    if (cached) {
      return cached;
    }
    const dbId = this.convertId("patients", id);
    const { rows } = await pool.query<DbPatientRow>(
      "SELECT id, name, phone, registration_date FROM patients WHERE id = $1",
      [dbId]
    );
    const patient = rows[0] ? mapPatient(rows[0]) : undefined;
    if (patient) {
      this.cache.set(cacheKey, patient);
    }
    return patient;
  }

  async createPatient(insertPatient: InsertPatient): Promise<Patient> {
    await this.waitForReady();
    const useNumericId = this.usesNumericId("patients");
    const query = useNumericId
      ? `INSERT INTO patients (name, phone, registration_date)
         VALUES ($1, $2, $3)
         RETURNING id, name, phone, registration_date`
      : `INSERT INTO patients (id, name, phone, registration_date)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, phone, registration_date`;
    const params = useNumericId
      ? [insertPatient.name, insertPatient.phone, insertPatient.registrationDate]
      : [randomUUID(), insertPatient.name, insertPatient.phone, insertPatient.registrationDate];
    const { rows } = await pool.query<DbPatientRow>(query, params);
    const patient = mapPatient(rows[0]);
    this.cache.invalidate("patients");
    this.cache.invalidate("patient:");
    return patient;
  }

  async updatePatient(id: string, insertPatient: InsertPatient): Promise<Patient | undefined> {
    await this.waitForReady();
    const { rows } = await pool.query<DbPatientRow>(
      `UPDATE patients
       SET name = $1, phone = $2, registration_date = $3
       WHERE id = $4
       RETURNING id, name, phone, registration_date`,
      [insertPatient.name, insertPatient.phone, insertPatient.registrationDate, id]
    );
    const patient = rows[0] ? mapPatient(rows[0]) : undefined;
    if (patient) {
      this.cache.invalidate("patients");
      this.cache.invalidate("patient:");
    }
    return patient;
  }

  async deletePatient(id: string): Promise<boolean> {
    await this.waitForReady();
    const dbId = this.convertId("patients", id);

    // 1. Get all bills for this patient to restore medicine stock
    const { rows: patientBills } = await pool.query<DbBillRow>(
      "SELECT * FROM bills WHERE patient_id = $1",
      [dbId]
    );

    // 2. Restore stock for each bill
    for (const row of patientBills) {
      const bill = mapBill(row);
      for (const med of bill.medicines) {
        if (med.medicineId && med.quantity > 0) {
          try {
            await this.updateMedicineStock(med.medicineId, med.quantity);
          } catch (e) {
            console.error(`Failed to restore stock for medicine ${med.medicineId} in bill ${bill.id}`, e);
          }
        }
      }
    }

    // 3. Delete patient (Cascade will delete bills and visits)
    const result = await pool.query("DELETE FROM patients WHERE id = $1", [dbId]);
    const success = (result.rowCount ?? 0) > 0;

    if (success) {
      this.cache.invalidate("patients");
      this.cache.invalidate(`patient:${normalizeId(id)}`);
      this.cache.invalidate("bills");
      this.cache.invalidate("medicines");
      this.cache.invalidate("visits");
    }

    return success;
  }

  // Visits
  async getVisits(): Promise<Visit[]> {
    await this.waitForReady();
    const cached = this.cache.get<Visit[]>("visits:all");
    if (cached) {
      return cached;
    }
    const { rows } = await pool.query<DbVisitRow>(
      "SELECT id, patient_id, date, complaints, diagnosis, visit_number, photo_file_ids FROM visits ORDER BY date DESC, visit_number DESC"
    );
    const visits = rows.map(mapVisit);
    this.cache.set("visits:all", visits);
    return visits;
  }

  async getVisit(id: string): Promise<Visit | undefined> {
    await this.waitForReady();
    const normalizedId = normalizeId(id);
    const cacheKey = `visit:${normalizedId}`;
    const cached = this.cache.get<Visit>(cacheKey);
    if (cached) {
      return cached;
    }
    const dbId = this.convertId("visits", id);
    const { rows } = await pool.query<DbVisitRow>(
      "SELECT id, patient_id, date, complaints, diagnosis, visit_number, photo_file_ids FROM visits WHERE id = $1",
      [dbId]
    );
    const visit = rows[0] ? mapVisit(rows[0]) : undefined;
    if (visit) {
      this.cache.set(cacheKey, visit);
    }
    return visit;
  }

  async getVisitsByPatient(patientId: string): Promise<Visit[]> {
    await this.waitForReady();
    const normalizedPatientId = normalizeId(patientId);
    const cacheKey = `visits: patient: ${normalizedPatientId}`;
    const cached = this.cache.get<Visit[]>(cacheKey);
    if (cached) {
      return cached;
    }
    const dbPatientId = this.convertId("patients", patientId);
    const { rows } = await pool.query<DbVisitRow>(
      "SELECT id, patient_id, date, complaints, diagnosis, visit_number, photo_file_ids FROM visits WHERE patient_id = $1 ORDER BY visit_number DESC",
      [dbPatientId]
    );
    const visits = rows.map(mapVisit);
    this.cache.set(cacheKey, visits);
    return visits;
  }

  async createVisit(insertVisit: InsertVisit): Promise<Visit> {
    await this.waitForReady();
    const patientIdValue = this.convertId("patients", insertVisit.patientId);
    const [{ visit_number }] = (
      await pool.query<{ visit_number: number }>(
        `SELECT COALESCE(MAX(visit_number), 0) + 1 AS visit_number
         FROM visits
         WHERE patient_id = $1`,
        [patientIdValue]
      )
    ).rows;

    const visitNumber = Number(visit_number ?? 1);
    const usesNumericVisitId = this.usesNumericId("visits");
    const initialPhotoIds = insertVisit.photoFileIds ?? (insertVisit.photoFileId ? [insertVisit.photoFileId] : []);
    const insertQuery = usesNumericVisitId
      ? `INSERT INTO visits(patient_id, date, complaints, diagnosis, visit_number, photo_file_ids)
         VALUES($1, $2, $3, $4, $5, $6)
         RETURNING id, patient_id, date, complaints, diagnosis, visit_number, photo_file_ids`
      : `INSERT INTO visits(id, patient_id, date, complaints, diagnosis, visit_number, photo_file_ids)
         VALUES($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, patient_id, date, complaints, diagnosis, visit_number, photo_file_ids`;
    const insertParams = usesNumericVisitId
      ? [patientIdValue, insertVisit.date, insertVisit.complaints, insertVisit.diagnosis, visitNumber, initialPhotoIds]
      : [
        randomUUID(),
        patientIdValue,
        insertVisit.date,
        insertVisit.complaints,
        insertVisit.diagnosis,
        visitNumber,
        initialPhotoIds,
      ];
    const { rows } = await pool.query<DbVisitRow>(insertQuery, insertParams);
    const visit = mapVisit(rows[0]);
    this.cache.invalidate("visits");
    this.cache.invalidate(`visits: patient: ${normalizeId(insertVisit.patientId)}`);
    return visit;
  }

  async updateVisit(id: string, insertVisit: InsertVisit): Promise<Visit | undefined> {
    await this.waitForReady();
    const dbVisitId = this.convertId("visits", id);
    const updatedPhotoIds = insertVisit.photoFileIds ?? (insertVisit.photoFileId ? [insertVisit.photoFileId] : []);
    const { rows } = await pool.query<DbVisitRow>(
      `UPDATE visits
       SET date = $2,
            complaints = $3,
            diagnosis = $4,
            photo_file_ids = $5
       WHERE id = $1
       RETURNING id, patient_id, date, complaints, diagnosis, visit_number, photo_file_ids`,
      [dbVisitId, insertVisit.date, insertVisit.complaints, insertVisit.diagnosis, updatedPhotoIds]
    );
    const visit = rows[0] ? mapVisit(rows[0]) : undefined;
    if (visit) {
      this.cache.invalidate("visits");
      this.cache.invalidate(`visit:${normalizeId(id)}`);
      this.cache.invalidate(`visits: patient: ${normalizeId(visit.patientId)}`);
    }
    return visit;
  }

  async addPhotoToVisit(visitId: string, fileId: string): Promise<Visit | undefined> {
    await this.waitForReady();
    const dbVisitId = this.convertId("visits", visitId);
    const { rows } = await pool.query<DbVisitRow>(
      `UPDATE visits
       SET photo_file_ids = array_append(COALESCE(photo_file_ids, '{}'), $2)
       WHERE id = $1
       RETURNING id, patient_id, date, complaints, diagnosis, visit_number, photo_file_ids`,
      [dbVisitId, fileId]
    );
    const visit = rows[0] ? mapVisit(rows[0]) : undefined;
    if (visit) {
      this.cache.invalidate("visits");
      this.cache.invalidate(`visit:${normalizeId(visitId)}`);
      this.cache.invalidate(`visits: patient: ${normalizeId(visit.patientId)}`);
    }
    return visit;
  }

  async removePhotoFromVisit(visitId: string, fileId: string): Promise<Visit | undefined> {
    await this.waitForReady();
    const dbVisitId = this.convertId("visits", visitId);
    const { rows } = await pool.query<DbVisitRow>(
      `UPDATE visits
       SET photo_file_ids = array_remove(photo_file_ids, $2)
       WHERE id = $1
       RETURNING id, patient_id, date, complaints, diagnosis, visit_number, photo_file_ids`,
      [dbVisitId, fileId]
    );
    const visit = rows[0] ? mapVisit(rows[0]) : undefined;
    if (visit) {
      this.cache.invalidate("visits");
      this.cache.invalidate(`visit:${normalizeId(visitId)}`);
      this.cache.invalidate(`visits: patient: ${normalizeId(visit.patientId)}`);
    }
    return visit;
  }

  // Medicines
  async getMedicines(): Promise<Medicine[]> {
    await this.waitForReady();
    const cached = this.cache.get<Medicine[]>("medicines");
    if (cached) {
      return cached;
    }
    const { rows } = await pool.query<DbMedicineRow>(
      "SELECT id, name, purchase_cost, selling_price, quantity FROM medicines ORDER BY name ASC"
    );
    const medicines = rows.map(mapMedicine);
    this.cache.set("medicines", medicines);
    return medicines;
  }

  async getMedicine(id: string): Promise<Medicine | undefined> {
    await this.waitForReady();
    const normalizedId = normalizeId(id);
    const cacheKey = `medicine:${normalizedId} `;
    const cached = this.cache.get<Medicine>(cacheKey);
    if (cached) {
      return cached;
    }
    const dbId = this.convertId("medicines", id);
    const { rows } = await pool.query<DbMedicineRow>(
      "SELECT id, name, purchase_cost, selling_price, quantity FROM medicines WHERE id = $1",
      [dbId]
    );
    const medicine = rows[0] ? mapMedicine(rows[0]) : undefined;
    if (medicine) {
      this.cache.set(cacheKey, medicine);
    }
    return medicine;
  }

  async createMedicine(insertMedicine: InsertMedicine): Promise<Medicine> {
    await this.waitForReady();
    const useNumericId = this.usesNumericId("medicines");
    const query = useNumericId
      ? `INSERT INTO medicines(name, purchase_cost, selling_price, quantity)
          VALUES($1, $2, $3, $4)
         RETURNING id, name, purchase_cost, selling_price, quantity`
      : `INSERT INTO medicines(id, name, purchase_cost, selling_price, quantity)
          VALUES($1, $2, $3, $4, $5)
         RETURNING id, name, purchase_cost, selling_price, quantity`;
    const params = useNumericId
      ? [insertMedicine.name, insertMedicine.purchaseCost, insertMedicine.sellingPrice, insertMedicine.quantity]
      : [
        randomUUID(),
        insertMedicine.name,
        insertMedicine.purchaseCost,
        insertMedicine.sellingPrice,
        insertMedicine.quantity,
      ];
    const { rows } = await pool.query<DbMedicineRow>(query, params);
    const medicine = mapMedicine(rows[0]);
    this.cache.invalidate("medicines");
    this.cache.invalidate("medicine:");
    return medicine;
  }

  async updateMedicine(id: string, insertMedicine: InsertMedicine): Promise<Medicine | undefined> {
    await this.waitForReady();
    const dbId = this.convertId("medicines", id);
    const { rows } = await pool.query<DbMedicineRow>(
      `UPDATE medicines
       SET name = $2,
            purchase_cost = $3,
            selling_price = $4,
            quantity = $5
       WHERE id = $1
       RETURNING id, name, purchase_cost, selling_price, quantity`,
      [dbId, insertMedicine.name, insertMedicine.purchaseCost, insertMedicine.sellingPrice, insertMedicine.quantity]
    );
    const medicine = rows[0] ? mapMedicine(rows[0]) : undefined;
    if (medicine) {
      this.cache.invalidate("medicines");
      this.cache.invalidate(`medicine:${medicine.id} `);
    }
    return medicine;
  }

  async deleteMedicine(id: string): Promise<boolean> {
    await this.waitForReady();
    const dbId = this.convertId("medicines", id);
    const result = await pool.query("DELETE FROM medicines WHERE id = $1", [dbId]);
    const success = (result.rowCount ?? 0) > 0;
    if (success) {
      this.cache.invalidate("medicines");
      this.cache.invalidate(`medicine:${normalizeId(id)} `);
    }
    return success;
  }

  async updateMedicineStock(id: string, quantityChange: number): Promise<Medicine | undefined> {
    await this.waitForReady();
    const dbId = this.convertId("medicines", id);
    const { rows } = await pool.query<DbMedicineRow>(
      `UPDATE medicines
       SET quantity = GREATEST(0, quantity + $2)
       WHERE id = $1
       RETURNING id, name, purchase_cost, selling_price, quantity`,
      [dbId, quantityChange]
    );
    const medicine = rows[0] ? mapMedicine(rows[0]) : undefined;
    if (medicine) {
      this.cache.invalidate("medicines");
      this.cache.invalidate(`medicine:${medicine.id} `);
    }
    return medicine;
  }

  // Treatments
  async getTreatments(): Promise<Treatment[]> {
    await this.waitForReady();
    const cached = this.cache.get<Treatment[]>("treatments");
    if (cached) {
      return cached;
    }
    const { rows } = await pool.query<DbTreatmentRow>(
      "SELECT id, name, default_price FROM treatments ORDER BY name ASC"
    );
    const treatments = rows.map(mapTreatment);
    this.cache.set("treatments", treatments);
    return treatments;
  }

  async getTreatment(id: string): Promise<Treatment | undefined> {
    await this.waitForReady();
    const normalizedId = normalizeId(id);
    const cacheKey = `treatment:${normalizedId} `;
    const cached = this.cache.get<Treatment>(cacheKey);
    if (cached) {
      return cached;
    }
    const dbId = this.convertId("treatments", id);
    const { rows } = await pool.query<DbTreatmentRow>(
      "SELECT id, name, default_price FROM treatments WHERE id = $1",
      [dbId]
    );
    const treatment = rows[0] ? mapTreatment(rows[0]) : undefined;
    if (treatment) {
      this.cache.set(cacheKey, treatment);
    }
    return treatment;
  }

  async createTreatment(insertTreatment: InsertTreatment): Promise<Treatment> {
    await this.waitForReady();
    const useNumericId = this.usesNumericId("treatments");
    const query = useNumericId
      ? `INSERT INTO treatments(name, default_price)
          VALUES($1, $2)
         RETURNING id, name, default_price`
      : `INSERT INTO treatments(id, name, default_price)
          VALUES($1, $2, $3)
         RETURNING id, name, default_price`;
    const params = useNumericId
      ? [insertTreatment.name, insertTreatment.defaultPrice]
      : [randomUUID(), insertTreatment.name, insertTreatment.defaultPrice];
    const { rows } = await pool.query<DbTreatmentRow>(query, params);
    const treatment = mapTreatment(rows[0]);
    this.cache.invalidate("treatments");
    this.cache.invalidate("treatment:");
    return treatment;
  }

  async updateTreatment(id: string, insertTreatment: InsertTreatment): Promise<Treatment | undefined> {
    await this.waitForReady();
    const dbId = this.convertId("treatments", id);
    const { rows } = await pool.query<DbTreatmentRow>(
      `UPDATE treatments
       SET name = $2,
            default_price = $3
       WHERE id = $1
       RETURNING id, name, default_price`,
      [dbId, insertTreatment.name, insertTreatment.defaultPrice]
    );
    const treatment = rows[0] ? mapTreatment(rows[0]) : undefined;
    if (treatment) {
      this.cache.invalidate("treatments");
      this.cache.invalidate(`treatment:${treatment.id} `);
    }
    return treatment;
  }

  async deleteTreatment(id: string): Promise<boolean> {
    await this.waitForReady();
    const dbId = this.convertId("treatments", id);
    const result = await pool.query("DELETE FROM treatments WHERE id = $1", [dbId]);
    const success = (result.rowCount ?? 0) > 0;
    if (success) {
      this.cache.invalidate("treatments");
      this.cache.invalidate(`treatment:${normalizeId(id)} `);
    }
    return success;
  }

  // Bills
  async getBills(): Promise<Bill[]> {
    await this.waitForReady();
    const cached = this.cache.get<Bill[]>("bills");
    if (cached) {
      return cached;
    }
    const { rows } = await pool.query<DbBillRow>(
      `SELECT id, patient_id, patient_name, date, treatments, medicines,
            treatment_total, medicine_total, grand_total, discount, final_amount, amount_paid, pending_amount, payment_mode
       FROM bills
       ORDER BY date DESC`
    );
    const bills = rows.map(mapBill);
    this.cache.set("bills", bills);
    return bills;
  }

  async getBill(id: string): Promise<Bill | undefined> {
    await this.waitForReady();
    const normalizedId = normalizeId(id);
    const cacheKey = `bill:${normalizedId} `;
    const cached = this.cache.get<Bill>(cacheKey);
    if (cached) {
      return cached;
    }
    const dbId = this.convertId("bills", id);
    const { rows } = await pool.query<DbBillRow>(
      `SELECT id, patient_id, patient_name, date, treatments, medicines,
            treatment_total, medicine_total, grand_total, discount, final_amount, amount_paid, pending_amount, payment_mode
       FROM bills
       WHERE id = $1`,
      [dbId]
    );
    const bill = rows[0] ? mapBill(rows[0]) : undefined;
    if (bill) {
      this.cache.set(cacheKey, bill);
    }
    return bill;
  }

  async createBill(insertBill: InsertBill, patientName: string): Promise<Bill> {
    await this.waitForReady();
    try {
      const patientIdValue = this.convertId("patients", insertBill.patientId);
      const pendingAmount = Math.max(0, insertBill.finalAmount - insertBill.amountPaid);
      const useNumericId = this.usesNumericId("bills");
      const query = useNumericId
        ? `INSERT INTO bills(
              patient_id,
              patient_name,
              date,
              treatments,
              medicines,
              treatment_total,
              medicine_total,
              grand_total,
              discount,
              final_amount,
              amount_paid,
              pending_amount,
              payment_mode
            )
          VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, patient_id, patient_name, date, treatments, medicines,
            treatment_total, medicine_total, grand_total, discount, final_amount, amount_paid, pending_amount, payment_mode`
        : `INSERT INTO bills(
              id,
              patient_id,
              patient_name,
              date,
              treatments,
              medicines,
              treatment_total,
              medicine_total,
              grand_total,
              discount,
              final_amount,
              amount_paid,
              pending_amount,
              payment_mode
            )
          VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id, patient_id, patient_name, date, treatments, medicines,
            treatment_total, medicine_total, grand_total, discount, final_amount, amount_paid, pending_amount, payment_mode`;

      const params = useNumericId
        ? [
          patientIdValue,
          patientName,
          insertBill.date,
          JSON.stringify(insertBill.treatments || []),
          JSON.stringify(insertBill.medicines || []),
          insertBill.treatmentTotal,
          insertBill.medicineTotal,
          insertBill.grandTotal,
          insertBill.discount,
          insertBill.finalAmount,
          insertBill.amountPaid,
          pendingAmount,
          insertBill.paymentMode || null,
        ]
        : [
          randomUUID(),
          patientIdValue,
          patientName,
          insertBill.date,
          JSON.stringify(insertBill.treatments || []),
          JSON.stringify(insertBill.medicines || []),
          insertBill.treatmentTotal,
          insertBill.medicineTotal,
          insertBill.grandTotal,
          insertBill.discount,
          insertBill.finalAmount,
          insertBill.amountPaid,
          pendingAmount,
          insertBill.paymentMode || null,
        ];

      const { rows } = await pool.query<DbBillRow>(query, params);
      if (!rows[0]) {
        throw new Error("Failed to create bill - no rows returned");
      }
      const bill = mapBill(rows[0]);
      this.cache.invalidate("bills");
      this.cache.invalidate("bill:");
      return bill;
    } catch (error) {
      console.error("Error in createBill:", error);
      throw error;
    }
  }

  async createBillWithStockUpdate(insertBill: InsertBill, patientName: string): Promise<Bill> {
    await this.waitForReady();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Validate and Update Stock (with Auto-Add)
      const updatedBillMedicines = [...(insertBill.medicines || [])];

      if (updatedBillMedicines.length > 0) {
        for (let i = 0; i < updatedBillMedicines.length; i++) {
          const med = updatedBillMedicines[i];
          let dbMedicine: Medicine | undefined;
          let dbMedId: any;

          // Try to find by ID if provided
          if (med.medicineId) {
            try {
              dbMedId = this.convertId("medicines", med.medicineId);
              const { rows } = await client.query<DbMedicineRow>(
                "SELECT * FROM medicines WHERE id = $1 FOR UPDATE",
                [dbMedId]
              );
              dbMedicine = rows[0] ? mapMedicine(rows[0]) : undefined;
            } catch (e) {
              // Ignore invalid ID and try name search next
            }
          }

          // If not found by ID, try by name (Case-Insensitive)
          if (!dbMedicine) {
            const { rows: nameMatchRows } = await client.query<DbMedicineRow>(
              "SELECT * FROM medicines WHERE LOWER(name) = LOWER($1) FOR UPDATE",
              [med.medicineName]
            );
            dbMedicine = nameMatchRows[0] ? mapMedicine(nameMatchRows[0]) : undefined;
            if (dbMedicine) {
              dbMedId = this.convertId("medicines", dbMedicine.id);
              // Update the bill item with the found ID
              updatedBillMedicines[i] = { ...med, medicineId: dbMedicine.id };
            }
          }

          // If still not found, create new medicine
          if (!dbMedicine) {
            console.log(`Auto - adding new medicine to master: ${med.medicineName}`);
            const newMedId = randomUUID();
            const { rows: newMedRows } = await client.query<DbMedicineRow>(
              `INSERT INTO medicines(id, name, purchase_cost, selling_price, quantity)
               VALUES($1, $2, $3, $4, $5)
               RETURNING id, name, purchase_cost, selling_price, quantity`,
              [newMedId, med.medicineName, 0, med.unitPrice, 0]
            );
            dbMedicine = mapMedicine(newMedRows[0]);
            dbMedId = newMedId;
            // Update the bill item with the new ID
            updatedBillMedicines[i] = { ...med, medicineId: dbMedicine.id };
          }

          // Deduct stock (it can go negative as per previous behavior/plan)
          await client.query(
            "UPDATE medicines SET quantity = quantity - $2 WHERE id = $1",
            [dbMedId, med.quantity]
          );
        }
      }

      // Update the bill object for insertion
      const insertBillData = { ...insertBill, medicines: updatedBillMedicines };

      // 2. Create Bill
      const patientIdValue = this.convertId("patients", insertBillData.patientId);
      const pendingAmount = Math.max(0, insertBillData.finalAmount - insertBillData.amountPaid);
      const useNumericId = this.usesNumericId("bills");

      const query = useNumericId
        ? `INSERT INTO bills(
        patient_id,
        patient_name,
        date,
        treatments,
        medicines,
        treatment_total,
        medicine_total,
        grand_total,
        discount,
        final_amount,
        amount_paid,
        pending_amount,
        payment_mode
      )
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, patient_id, patient_name, date, treatments, medicines,
        treatment_total, medicine_total, grand_total, discount, final_amount, amount_paid, pending_amount, payment_mode`
        : `INSERT INTO bills(
          id,
          patient_id,
          patient_name,
          date,
          treatments,
          medicines,
          treatment_total,
          medicine_total,
          grand_total,
          discount,
          final_amount,
          amount_paid,
          pending_amount,
          payment_mode
        )
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id, patient_id, patient_name, date, treatments, medicines,
        treatment_total, medicine_total, grand_total, discount, final_amount, amount_paid, pending_amount, payment_mode`;

      const params = useNumericId
        ? [
          patientIdValue,
          patientName,
          insertBillData.date,
          JSON.stringify(insertBillData.treatments || []),
          JSON.stringify(insertBillData.medicines || []),
          insertBillData.treatmentTotal,
          insertBillData.medicineTotal,
          insertBillData.grandTotal,
          insertBillData.discount,
          insertBillData.finalAmount,
          insertBillData.amountPaid,
          pendingAmount,
          insertBillData.paymentMode || null,
        ]
        : [
          randomUUID(),
          patientIdValue,
          patientName,
          insertBillData.date,
          JSON.stringify(insertBillData.treatments || []),
          JSON.stringify(insertBillData.medicines || []),
          insertBillData.treatmentTotal,
          insertBillData.medicineTotal,
          insertBillData.grandTotal,
          insertBillData.discount,
          insertBillData.finalAmount,
          insertBillData.amountPaid,
          pendingAmount,
          insertBillData.paymentMode || null,
        ];

      const { rows } = await client.query<DbBillRow>(query, params);

      if (!rows[0]) {
        throw new Error("Failed to create bill - no rows returned");
      }

      await client.query('COMMIT');

      const bill = mapBill(rows[0]);

      // Invalidate caches
      this.cache.invalidate("bills");
      this.cache.invalidate("bill:");
      this.cache.invalidate("medicines"); // Stocks changed
      this.cache.invalidate("medicine:");

      return bill;

    } catch (error) {
      await client.query('ROLLBACK');
      console.error("Error in createBillWithStockUpdate:", error);
      throw error;
    } finally {
      client.release();
    }
  }
  async updateBill(id: string, insertBill: InsertBill, patientName: string): Promise<Bill | undefined> {
    await this.waitForReady();
    const dbId = this.convertId("bills", id);
    const pendingAmount = Math.max(0, insertBill.finalAmount - insertBill.amountPaid);
    const { rows } = await pool.query<DbBillRow>(
      `UPDATE bills
       SET patient_id = $2,
        patient_name = $3,
        date = $4,
        treatments = $5,
        medicines = $6,
        treatment_total = $7,
        medicine_total = $8,
        grand_total = $9,
        discount = $10,
        final_amount = $11,
        amount_paid = $12,
        pending_amount = $13,
        payment_mode = $14
       WHERE id = $1
       RETURNING id, patient_id, patient_name, date, treatments, medicines,
        treatment_total, medicine_total, grand_total, discount, final_amount, amount_paid, pending_amount, payment_mode`,
      [
        dbId,
        this.convertId("patients", insertBill.patientId),
        patientName,
        insertBill.date,
        JSON.stringify(insertBill.treatments),
        JSON.stringify(insertBill.medicines),
        insertBill.treatmentTotal,
        insertBill.medicineTotal,
        insertBill.grandTotal,
        insertBill.discount,
        insertBill.finalAmount,
        insertBill.amountPaid,
        pendingAmount,
        insertBill.paymentMode || null
      ]
    );
    const bill = rows[0] ? mapBill(rows[0]) : undefined;
    if (bill) {
      this.cache.invalidate("bills");
      this.cache.invalidate(`bill: ${bill.id} `);
    }
    return bill;
  }

  /**
   * updateBillPayment — tracks cash and online amounts independently.
   *
   * addAmount mode: increments the correct per-mode column
   * setAmount mode: resets amount_paid and recalculates columns proportionally
   *                 (for "correct a mistake" use-case, sets all to the new mode)
   */
  async updateBillPayment(
    id: string,
    newTotalPaid: number,
    paymentMode?: 'Cash' | 'Online' | null,
    addAmount?: number   // the increment (optional, for tracking per-mode delta)
  ): Promise<Bill | undefined> {
    await this.waitForReady();
    const dbId = this.convertId("bills", id);

    // Fetch current row to know existing cash/online amounts
    const { rows: cur } = await pool.query<DbBillRow>(
      `SELECT amount_paid, cash_amount, online_amount, final_amount FROM bills WHERE id = $1`,
      [dbId]
    );
    if (!cur[0]) return undefined;

    const prevCash = cur[0].cash_amount ?? 0;
    const prevOnline = cur[0].online_amount ?? 0;

    let newCash = prevCash;
    let newOnline = prevOnline;

    if (typeof addAmount === 'number' && addAmount > 0) {
      // Incremental payment — add to the right column
      if (paymentMode === 'Cash') {
        newCash = prevCash + addAmount;
      } else if (paymentMode === 'Online') {
        newOnline = prevOnline + addAmount;
      } else {
        newCash = prevCash + addAmount; // default to Cash if mode not specified
      }
    } else {
      // setAmount mode — reset and assign entirely to the chosen mode
      if (paymentMode === 'Online') {
        newOnline = newTotalPaid;
        newCash = 0;
      } else {
        newCash = newTotalPaid;
        newOnline = 0;
      }
    }

    const { rows } = await pool.query<DbBillRow>(
      `UPDATE bills
       SET amount_paid = $2,
         pending_amount = GREATEST(0, final_amount - $2),
         payment_mode = $3,
         cash_amount = $4,
         online_amount = $5
       WHERE id = $1
       RETURNING id, patient_id, patient_name, date, treatments, medicines,
        treatment_total, medicine_total, grand_total, discount, final_amount,
        amount_paid, pending_amount, payment_mode, cash_amount, online_amount`,
      [dbId, newTotalPaid, paymentMode || null, newCash, newOnline]
    );
    const bill = rows[0] ? mapBill(rows[0]) : undefined;
    if (bill) {
      this.cache.invalidate("bills");
      this.cache.invalidate(`bill:${bill.id}`);
    }
    return bill;
  }

  async deleteBill(id: string): Promise<boolean> {
    await this.waitForReady();
    const dbId = this.convertId("bills", id);
    const result = await pool.query("DELETE FROM bills WHERE id = $1", [dbId]);
    const success = (result.rowCount ?? 0) > 0;
    if (success) {
      this.cache.invalidate("bills");
      this.cache.invalidate(`bill: ${normalizeId(id)} `);
    }
    return success;
  }

  async updatePatientBillsName(patientId: string, patientName: string): Promise<void> {
    await this.waitForReady();
    const dbPatientId = this.convertId("patients", patientId);
    await pool.query(
      "UPDATE bills SET patient_name = $1 WHERE patient_id = $2",
      [patientName, dbPatientId]
    );
    this.cache.invalidate("bills");
    this.cache.invalidate("bill:");
  }

  // Expenses
  async getExpenses(): Promise<Expense[]> {
    await this.waitForReady();
    const cached = this.cache.get<Expense[]>("expenses");
    if (cached) {
      return cached;
    }
    const { rows } = await pool.query<DbExpenseRow>(
      "SELECT id, description, amount, date, category FROM expenses ORDER BY date DESC"
    );
    const expenses = rows.map(mapExpense);
    this.cache.set("expenses", expenses);
    return expenses;
  }

  async getExpense(id: string): Promise<Expense | undefined> {
    await this.waitForReady();
    const normalizedId = normalizeId(id);
    const cacheKey = `expense: ${normalizedId} `;
    const cached = this.cache.get<Expense>(cacheKey);
    if (cached) {
      return cached;
    }
    const dbId = this.convertId("expenses", id);
    const { rows } = await pool.query<DbExpenseRow>(
      "SELECT id, description, amount, date, category FROM expenses WHERE id = $1",
      [dbId]
    );
    const expense = rows[0] ? mapExpense(rows[0]) : undefined;
    if (expense) {
      this.cache.set(cacheKey, expense);
    }
    return expense;
  }

  async createExpense(insertExpense: InsertExpense): Promise<Expense> {
    await this.waitForReady();
    const useNumericId = this.usesNumericId("expenses");
    const query = useNumericId
      ? `INSERT INTO expenses(description, amount, date, category)
      VALUES($1, $2, $3, $4)
         RETURNING id, description, amount, date, category`
      : `INSERT INTO expenses(id, description, amount, date, category)
      VALUES($1, $2, $3, $4, $5)
         RETURNING id, description, amount, date, category`;
    const params = useNumericId
      ? [insertExpense.description, insertExpense.amount, insertExpense.date, insertExpense.category]
      : [
        randomUUID(),
        insertExpense.description,
        insertExpense.amount,
        insertExpense.date,
        insertExpense.category,
      ];
    const { rows } = await pool.query<DbExpenseRow>(query, params);
    const expense = mapExpense(rows[0]);
    this.cache.invalidate("expenses");
    this.cache.invalidate("expense:");
    return expense;
  }

  async updateExpense(id: string, insertExpense: InsertExpense): Promise<Expense | undefined> {
    await this.waitForReady();
    const dbId = this.convertId("expenses", id);
    const { rows } = await pool.query<DbExpenseRow>(
      `UPDATE expenses
       SET description = $2,
        amount = $3,
        date = $4,
        category = $5
       WHERE id = $1
       RETURNING id, description, amount, date, category`,
      [dbId, insertExpense.description, insertExpense.amount, insertExpense.date, insertExpense.category]
    );
    const expense = rows[0] ? mapExpense(rows[0]) : undefined;
    if (expense) {
      this.cache.invalidate("expenses");
      this.cache.invalidate(`expense: ${expense.id} `);
    }
    return expense;
  }

  async deleteExpense(id: string): Promise<boolean> {
    await this.waitForReady();
    const dbId = this.convertId("expenses", id);
    const result = await pool.query("DELETE FROM expenses WHERE id = $1", [dbId]);
    const success = (result.rowCount ?? 0) > 0;
    if (success) {
      this.cache.invalidate("expenses");
      this.cache.invalidate(`expense: ${normalizeId(id)} `);
    }
    return success;
  }

  // ==================== PAGINATION METHODS ====================

  async getPatientsPaginated(
    limit: number = 50,
    offset: number = 0
  ): Promise<{ data: Patient[]; total: number }> {
    await this.waitForReady();
    const { rows: countResult } = await pool.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM patients"
    );
    const total = parseInt(countResult[0]?.count || "0", 10);

    const { rows } = await pool.query<DbPatientRow>(
      `SELECT id, name, phone, registration_date FROM patients 
       ORDER BY registration_date DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const data = rows.map(mapPatient);
    return { data, total };
  }

  async getMedicinesPaginated(
    limit: number = 50,
    offset: number = 0
  ): Promise<{ data: Medicine[]; total: number }> {
    await this.waitForReady();
    const { rows: countResult } = await pool.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM medicines"
    );
    const total = parseInt(countResult[0]?.count || "0", 10);

    const { rows } = await pool.query<DbMedicineRow>(
      `SELECT id, name, purchase_cost, selling_price, quantity FROM medicines 
       ORDER BY name ASC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const data = rows.map(mapMedicine);
    return { data, total };
  }

  async getTreatmentsPaginated(
    limit: number = 50,
    offset: number = 0
  ): Promise<{ data: Treatment[]; total: number }> {
    await this.waitForReady();
    const { rows: countResult } = await pool.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM treatments"
    );
    const total = parseInt(countResult[0]?.count || "0", 10);

    const { rows } = await pool.query<DbTreatmentRow>(
      `SELECT id, name, default_price FROM treatments 
       ORDER BY name ASC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const data = rows.map(mapTreatment);
    return { data, total };
  }

  async getBillsPaginated(
    limit: number = 50,
    offset: number = 0
  ): Promise<{ data: Bill[]; total: number }> {
    await this.waitForReady();
    const { rows: countResult } = await pool.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM bills"
    );
    const total = parseInt(countResult[0]?.count || "0", 10);

    const { rows } = await pool.query<DbBillRow>(
      `SELECT id, patient_id, patient_name, date, treatments, medicines,
        treatment_total, medicine_total, grand_total, discount, final_amount, amount_paid, pending_amount, payment_mode
       FROM bills
       ORDER BY date DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const data = rows.map(mapBill);
    return { data, total };
  }

  async getExpensesPaginated(
    limit: number = 50,
    offset: number = 0
  ): Promise<{ data: Expense[]; total: number }> {
    await this.waitForReady();
    const { rows: countResult } = await pool.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM expenses"
    );
    const total = parseInt(countResult[0]?.count || "0", 10);

    const { rows } = await pool.query<DbExpenseRow>(
      `SELECT id, description, amount, date, category FROM expenses 
       ORDER BY date DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const data = rows.map(mapExpense);
    return { data, total };
  }

  // Appointments
  async getAppointments(): Promise<Appointment[]> {
    await this.waitForReady();
    const cached = this.cache.get<Appointment[]>("appointments");
    if (cached) {
      return cached;
    }
    const { rows } = await pool.query<DbAppointmentRow>(
      `SELECT a.id, a.patient_id, p.name as patient_name, a.date, a.time, a.reason, a.status 
       FROM appointments a
       LEFT JOIN patients p ON a.patient_id = p.id
       ORDER BY a.date ASC, a.time ASC`
    );
    const appointments = rows.map(mapAppointment);
    this.cache.set("appointments", appointments);
    return appointments;
  }

  async getAppointment(id: string): Promise<Appointment | undefined> {
    await this.waitForReady();
    const normalizedId = normalizeId(id);
    const cacheKey = `appointment: ${normalizedId} `;
    const cached = this.cache.get<Appointment>(cacheKey);
    if (cached) {
      return cached;
    }
    const dbId = this.convertId("appointments", id);
    const { rows } = await pool.query<DbAppointmentRow>(
      `SELECT a.id, a.patient_id, p.name as patient_name, a.date, a.time, a.reason, a.status 
       FROM appointments a
       LEFT JOIN patients p ON a.patient_id = p.id
       WHERE a.id = $1`,
      [dbId]
    );
    const appointment = rows[0] ? mapAppointment(rows[0]) : undefined;
    if (appointment) {
      this.cache.set(cacheKey, appointment);
    }
    return appointment;
  }

  async getAppointmentsByPatient(patientId: string): Promise<Appointment[]> {
    await this.waitForReady();
    const normalizedPatientId = normalizeId(patientId);
    const cacheKey = `appointments: patient: ${normalizedPatientId} `;
    const cached = this.cache.get<Appointment[]>(cacheKey);
    if (cached) {
      return cached;
    }
    const dbPatientId = this.convertId("patients", patientId);
    const { rows } = await pool.query<DbAppointmentRow>(
      `SELECT a.id, a.patient_id, p.name as patient_name, a.date, a.time, a.reason, a.status 
       FROM appointments a
       LEFT JOIN patients p ON a.patient_id = p.id
       WHERE a.patient_id = $1
       ORDER BY a.date ASC, a.time ASC`,
      [dbPatientId]
    );
    const appointments = rows.map(mapAppointment);
    this.cache.set(cacheKey, appointments);
    return appointments;
  }

  async createAppointment(insert: InsertAppointment): Promise<Appointment> {
    await this.waitForReady();
    const useNumericId = this.usesNumericId("appointments");
    const query = useNumericId
      ? `INSERT INTO appointments(patient_id, date, time, reason, status)
      VALUES($1, $2, $3, $4, $5)
         RETURNING id, patient_id, date, time, reason, status`
      : `INSERT INTO appointments(id, patient_id, date, time, reason, status)
      VALUES($1, $2, $3, $4, $5, $6)
         RETURNING id, patient_id, date, time, reason, status`;

    const dbPatientId = this.convertId("patients", insert.patientId);

    const params = useNumericId
      ? [dbPatientId, insert.date, insert.time, insert.reason, insert.status]
      : [randomUUID(), dbPatientId, insert.date, insert.time, insert.reason, insert.status];

    const { rows } = await pool.query<DbAppointmentRow>(query, params);

    // Fetch patient name for the return object
    const patientNameQuery = await pool.query<{ name: string }>("SELECT name FROM patients WHERE id = $1", [dbPatientId]);
    const patientName = patientNameQuery.rows[0]?.name;

    const appointment = mapAppointment({
      ...rows[0],
      patient_name: patientName
    });

    this.cache.invalidate("appointments");
    this.cache.invalidate(`appointments: patient: ${normalizeId(insert.patientId)
      } `);
    return appointment;
  }

  async updateAppointment(id: string, insert: InsertAppointment): Promise<Appointment | undefined> {
    await this.waitForReady();
    const dbId = this.convertId("appointments", id);
    const dbPatientId = this.convertId("patients", insert.patientId);

    const { rows } = await pool.query<DbAppointmentRow>(
      `UPDATE appointments
       SET patient_id = $2, date = $3, time = $4, reason = $5, status = $6
       WHERE id = $1
       RETURNING id, patient_id, date, time, reason, status`,
      [dbId, dbPatientId, insert.date, insert.time, insert.reason, insert.status]
    );

    if (!rows[0]) return undefined;

    // Fetch patient name
    const patientNameQuery = await pool.query<{ name: string }>("SELECT name FROM patients WHERE id = $1", [dbPatientId]);
    const patientName = patientNameQuery.rows[0]?.name;

    const appointment = mapAppointment({
      ...rows[0],
      patient_name: patientName
    });

    this.cache.invalidate("appointments");
    this.cache.invalidate(`appointment:${appointment.id} `);
    this.cache.invalidate(`appointments: patient:${normalizeId(insert.patientId)} `);
    return appointment;
  }

  async deleteAppointment(id: string): Promise<boolean> {
    await this.waitForReady();
    const dbId = this.convertId("appointments", id);

    // Get appointment to invalidate cache
    const appt = await this.getAppointment(id);

    const result = await pool.query("DELETE FROM appointments WHERE id = $1", [dbId]);
    const success = (result.rowCount ?? 0) > 0;

    if (success) {
      this.cache.invalidate("appointments");
      this.cache.invalidate(`appointment:${normalizeId(id)} `);
      if (appt) {
        this.cache.invalidate(`appointments: patient:${appt.patientId} `);
      }
    }
    return success;
  }

  // Users/Auth
  async getUser(id: string): Promise<User | undefined> {
    await this.waitForReady();
    const dbId = this.convertId("users" as any, id);
    const { rows } = await pool.query<DbUserRow>(
      "SELECT * FROM users WHERE id = $1",
      [dbId]
    );
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await this.waitForReady();
    // Case-insensitive username lookup
    const { rows } = await pool.query<DbUserRow>(
      "SELECT * FROM users WHERE LOWER(username) = LOWER($1)",
      [username]
    );
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async createUser(user: Partial<User>): Promise<User> {
    await this.waitForReady();
    const { rows } = await pool.query<DbUserRow>(
      "INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING *",
      [user.username, user.password, user.role]
    );
    return mapUser(rows[0]);
  }
}

export const storage = new PostgresStorage();

