/**
 * BILL MANAGEMENT PAGE
 * 
 * Payment Tracking System:
 * Supports cumulative payments across multiple visits for the same bill.
 * 
 * Example Flow:
 * Visit 1: Create bill for ₹1000, patient pays ₹500 → Paid: ₹500, Pending: ₹500
 * Visit 2: Record payment ₹300 → Enter TOTAL ₹800 → Paid: ₹800, Pending: ₹200
 * Visit 3: Record payment ₹200 → Enter TOTAL ₹1000 → Paid: ₹1000, Pending: ₹0 ✓
 * 
 * Key: User must enter the CUMULATIVE total, not just the current visit amount.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Trash2,
  Edit2,
  Plus,
  AlertCircle,
  Check,
  Phone,
  Printer,
  MessageCircle,
  Share2,
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import type { Bill, Medicine, Treatment, BillMedicineItem, BillTreatmentItem, Patient } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { extractPaginatedData } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from "date-fns";

export default function BillingManage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [recentBillSearch, setRecentBillSearch] = useState("");
  const [pendingBillSearch, setPendingBillSearch] = useState("");
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<Bill | null>(null);
  const [paymentDialogAmount, setPaymentDialogAmount] = useState("");
  const [isEditingPaidAmount, setIsEditingPaidAmount] = useState(false);
  const [editedPaidAmount, setEditedPaidAmount] = useState("");
  const [billToDelete, setBillToDelete] = useState<Bill | null>(null);
  const [billToEdit, setBillToEdit] = useState<Bill | null>(null);
  const [isEditBillDialogOpen, setIsEditBillDialogOpen] = useState(false);
  const [editingTreatments, setEditingTreatments] = useState<BillTreatmentItem[]>([]);
  const [editingMedicines, setEditingMedicines] = useState<BillMedicineItem[]>([]);
  const [dateFilter, setDateFilter] = useState("current-month");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<"Cash" | "Online">("Cash");

  const { data: billsResponse, isLoading: billsLoading } = useQuery({
    queryKey: ["/api/bills"],
  });
  const bills = extractPaginatedData<Bill>(billsResponse);

  const { data: medicinesResponse } = useQuery({
    queryKey: ["/api/medicines"],
  });
  const medicines = extractPaginatedData<Medicine>(medicinesResponse);

  const { data: treatmentsResponse } = useQuery({
    queryKey: ["/api/treatments"],
  });
  const treatments = extractPaginatedData<Treatment>(treatmentsResponse);

  const { data: patientsResponse } = useQuery({
    queryKey: ["/api/patients"],
  });
  const patients = extractPaginatedData<Patient>(patientsResponse);

  const adjustPaymentMutation = useMutation({
    mutationFn: async ({ billId, addAmount, setAmount, paymentMode }: { billId: string; addAmount?: number; setAmount?: number; paymentMode?: string }) => {
      // send whichever param is provided (setAmount takes precedence)
      const body: Record<string, any> = { paymentMode };
      if (typeof setAmount === "number") body.setAmount = setAmount;
      else if (typeof addAmount === "number") body.addAmount = addAmount;
      return await apiRequest("PATCH", `/api/bills/${billId}/payment`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({
        title: "Payment Updated",
        description: "Payment has been recorded successfully.",
      });
      setIsPaymentDialogOpen(false);
      setSelectedBillForPayment(null);
      setPaymentDialogAmount("");
    },
    onError: (error: Error) => {
      toast({
        title: "Payment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateBillMutation = useMutation({
    mutationFn: async ({
      billId,
      treatments,
      medicines,
    }: {
      billId: string;
      treatments: BillTreatmentItem[];
      medicines: BillMedicineItem[];
    }) => {
      const treatmentTotal = treatments.reduce((sum, t) => sum + t.price, 0);
      const medicineTotal = medicines.reduce((sum, m) => sum + m.total, 0);
      const grandTotal = treatmentTotal + medicineTotal;

      if (!billToEdit) throw new Error("Bill not found");

      return await apiRequest("PATCH", `/api/bills/${billId}`, {
        patientId: billToEdit.patientId,
        date: billToEdit.date,
        treatments,
        medicines,
        treatmentTotal,
        medicineTotal,
        grandTotal,
        discount: billToEdit.discount,
        finalAmount: billToEdit.discount > 0 ? grandTotal - (grandTotal * billToEdit.discount / 100) : grandTotal,
        amountPaid: billToEdit.amountPaid,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/medicines"] });
      toast({
        title: "Bill Updated",
        description: "Bill has been updated successfully.",
      });
      setIsEditBillDialogOpen(false);
      setBillToEdit(null);
      setEditingTreatments([]);
      setEditingMedicines([]);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Update Bill",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteBillMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/bills/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/medicines"] });
      toast({
        title: "Bill Deleted",
        description: "Bill has been removed successfully.",
      });
      setBillToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Delete Bill",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const openEditBillDialog = (bill: Bill) => {
    setBillToEdit(bill);
    setEditingTreatments([...bill.treatments]);
    setEditingMedicines([...bill.medicines]);
    setIsEditBillDialogOpen(true);
  };

  const addEditingTreatment = (treatmentId: string) => {
    const treatment = treatments.find((t) => t.id === treatmentId);
    if (treatment) {
      setEditingTreatments([
        ...editingTreatments,
        {
          treatmentId: treatment.id,
          treatmentName: treatment.name,
          price: treatment.defaultPrice,
        },
      ]);
    }
  };

  const updateEditingTreatmentPrice = (index: number, price: number) => {
    const updated = [...editingTreatments];
    updated[index].price = price;
    setEditingTreatments(updated);
  };

  const removeEditingTreatment = (index: number) => {
    setEditingTreatments(editingTreatments.filter((_, i) => i !== index));
  };

  const addEditingMedicine = () => {
    setEditingMedicines([
      ...editingMedicines,
      {
        medicineId: "",
        medicineName: "",
        quantity: 1,
        unitPrice: 0,
        total: 0,
      },
    ]);
  };

  const updateEditingMedicine = (index: number, medicineId: string) => {
    const medicine = medicines.find((m) => m.id === medicineId);
    if (medicine) {
      const updated = [...editingMedicines];
      updated[index] = {
        medicineId: medicine.id,
        medicineName: medicine.name,
        quantity: 1,
        unitPrice: medicine.sellingPrice,
        total: medicine.sellingPrice,
      };
      setEditingMedicines(updated);
    }
  };

  const updateEditingMedicineQuantity = (index: number, quantity: number) => {
    const updated = [...editingMedicines];
    updated[index].quantity = quantity;
    updated[index].total = updated[index].unitPrice * quantity;
    setEditingMedicines(updated);
  };

  const updateEditingMedicinePrice = (index: number, price: number) => {
    const updated = [...editingMedicines];
    updated[index].unitPrice = price;
    updated[index].total = price * updated[index].quantity;
    setEditingMedicines(updated);
  };

  const removeEditingMedicine = (index: number) => {
    setEditingMedicines(editingMedicines.filter((_, i) => i !== index));
  };

  // Calculate date range based on filter
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  let dateRangeStart = monthStart;
  let dateRangeEnd = monthEnd;

  if (dateFilter === "current-month") {
    dateRangeStart = monthStart;
    dateRangeEnd = monthEnd;
  } else if (dateFilter === "last-month") {
    const lastMonth = subMonths(today, 1);
    dateRangeStart = startOfMonth(lastMonth);
    dateRangeEnd = endOfMonth(lastMonth);
  } else if (dateFilter === "last-3-months") {
    dateRangeStart = startOfMonth(subMonths(today, 2));
    dateRangeEnd = monthEnd;
  } else if (dateFilter === "last-6-months") {
    dateRangeStart = startOfMonth(subMonths(today, 5));
    dateRangeEnd = monthEnd;
  } else if (dateFilter === "custom" && customStartDate && customEndDate) {
    dateRangeStart = new Date(customStartDate);
    dateRangeEnd = new Date(customEndDate);
  }

  // Filter bills by date range
  const dateFilteredBills = bills.filter((b) =>
    isWithinInterval(new Date(b.date), { start: dateRangeStart, end: dateRangeEnd })
  );

  // Separate pending and recent bills
  const pendingBills = dateFilteredBills
    .filter((b) => b.pendingAmount > 0)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .filter((bill) =>
      bill.patientName.toLowerCase().includes(pendingBillSearch.toLowerCase().trim())
    );

  const recentBills = dateFilteredBills
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .filter((bill) =>
      bill.patientName.toLowerCase().includes(recentBillSearch.toLowerCase().trim())
    );

  const handlePrintBill = (bill: Bill) => {
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
      <meta charset="UTF-8">
      <title>Bill - ${bill.id}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: white; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1e40af; padding-bottom: 20px; }
        .logo { width: 80px; height: 80px; margin: 0 auto 15px; }
        .logo img { width: 100%; height: 100%; object-fit: contain; }
        .clinic-name { font-size: 28px; font-weight: bold; color: #1e40af; margin-bottom: 5px; }
        .clinic-tag { font-size: 14px; color: #666; font-style: italic; }
        .bill-info { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
        .bill-info-col { flex: 1; }
        .bill-info-col strong { color: #1e40af; }
        .section-title { font-size: 16px; font-weight: bold; color: #1e40af; margin-top: 20px; margin-bottom: 10px; border-bottom: 2px solid #e0e7ff; padding-bottom: 5px; }
        .patient-details { margin-bottom: 20px; font-size: 14px; }
        .patient-details p { margin-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background-color: #1e40af; color: white; padding: 12px; text-align: left; font-weight: bold; }
        td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
        tr:nth-child(even) { background-color: #f9fafb; }
        .text-right { text-align: right; }
        .totals { margin-top: 20px; margin-bottom: 20px; }
        .total-row { display: flex; justify-content: space-between; padding: 10px 0; font-size: 15px; }
        .total-row.grand { font-size: 18px; font-weight: bold; color: #1e40af; border-top: 2px solid #1e40af; border-bottom: 2px solid #1e40af; padding: 15px 0; margin: 15px 0; }
        .total-row.paid { color: #16a34a; }
        .total-row.pending { color: #dc2626; }
        .status-box { margin-top: 20px; padding: 15px; border-radius: 8px; text-align: center; font-size: 14px; }
        .status-settled { background-color: #dcfce7; border: 2px solid #16a34a; color: #166534; }
        .status-pending { background-color: #fee2e2; border: 2px solid #dc2626; color: #991b1b; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb; font-size: 12px; color: #666; }
        .print-date { text-align: center; font-size: 12px; color: #999; margin-top: 10px; }
        @media print {
        body { margin: 0; padding: 0; }
        .container { padding: 0; }
        .no-print { display: none; }
        }
      </style>
      </head>
      <body>
      <div class="container">
        <div class="header">
        <div class="logo">
          <img src="/logo.png" alt="Clinic Care Logo" />
        </div>
        <div class="clinic-name">OMERA CLINIC</div>
        <div class="clinic-tag">Professional Aesthetic & Skin Care</div>
        </div>

        <div class="bill-info">
        <div class="bill-info-col">
          <p><strong>Bill ID:</strong> ${bill.id}</p>
          <p><strong>Date:</strong> ${format(new Date(bill.date), "dd MMM yyyy")}</p>
        </div>
        <div class="bill-info-col">
          <p><strong>Invoice Type:</strong> Medical Bill</p>
          <p><strong>Status:</strong> ${bill.pendingAmount > 0 ? "PENDING" : "SETTLED"}</p>
        </div>
        </div>

        <div class="patient-details">
        <div class="section-title">Patient Information</div>
        <p><strong>Patient Name:</strong> ${bill.patientName}</p>
        </div>

        <div class="section-title">Services Provided</div>
        <table>
        <thead>
          <tr>
          <th>Description</th>
          <th>Type</th>
          <th class="text-right">Rate</th>
          <th class="text-right">Discount</th>
          <th class="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${bill.treatments.map(t => `
          <tr>
            <td>${t.treatmentName}</td>
            <td>Treatment</td>
            <td class="text-right">₹${t.price.toFixed(2)}</td>
            <td class="text-right">-</td>
            <td class="text-right">₹${t.price.toFixed(2)}</td>
          </tr>
          `).join("")}
          ${bill.medicines.map(m => `
          <tr>
            <td>${m.medicineName}</td>
            <td>Medicine (${m.quantity}x)</td>
            <td class="text-right">₹${m.unitPrice.toFixed(2)}</td>
            <td class="text-right">
              ${(m.discount || 0) > 0
        ? `${m.discountPercent ? m.discountPercent + '%' : ''} (₹${(m.discount || 0).toFixed(2)})`
        : '-'}
            </td>
            <td class="text-right">₹${m.total.toFixed(2)}</td>
          </tr>
          `).join("")}
        </tbody>
        </table>

        <div class="totals">
        <div class="total-row">
          <span>Treatment Total:</span>
          <span>₹${bill.treatmentTotal.toFixed(2)}</span>
        </div>
        <div class="total-row">
          <span>Medicine Total:</span>
          <span>₹${bill.medicines.reduce((sum, m) => sum + m.total, 0).toFixed(2)}</span>
        </div>
        <div class="total-row">
          <span>Gross Amount:</span>
          <span>₹${bill.grandTotal.toFixed(2)}</span>
        </div>
        ${(bill.grandTotal - bill.finalAmount) > 0.01 ? `
        <div class="total-row">
          <span>Total Discount:</span>
          <span>-₹${(bill.grandTotal - bill.finalAmount).toFixed(2)}</span>
        </div>
        ` : ""}
        <div class="total-row grand">
          <span>FINAL AMOUNT:</span>
          <span>₹${bill.finalAmount.toFixed(2)}</span>
        </div>
        <div class="total-row paid">
          <span>Amount Paid:</span>
          <span>₹${bill.amountPaid.toFixed(2)}</span>
        </div>
        ${bill.pendingAmount > 0 ? `
          <div class="total-row pending">
          <span>AMOUNT PENDING:</span>
          <span>₹${bill.pendingAmount.toFixed(2)}</span>
          </div>
        ` : ""}
        </div>

        ${bill.pendingAmount === 0 ? `
        <div class="status-box status-settled">
          ✓ BILL FULLY SETTLED - Thank you for your payment
        </div>
        ` : `
        <div class="status-box status-pending">
          ⚠ PAYMENT PENDING - Amount Due: ₹${bill.pendingAmount.toFixed(2)}
        </div>
        `}

        <div class="footer">
        <p>Thank you for choosing Omera Clinic</p>
        <p>For queries, please contact us during business hours</p>
        </div>

        <div class="print-date">
        Printed on: ${format(new Date(), "dd MMM yyyy HH:mm:ss")}
        </div>
      </div>

      <script>
        window.onload = function() {
        window.print();
        setTimeout(() => window.close(), 500);
        };
      </script>
      </body>
      </html>
    `;

    const printWindow = window.open("", "", "width=900,height=1000");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
    }
  };

  const handleShareWhatsApp = async (bill: Bill) => {
    // 1. Generate the same HTML as printing but hidden
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    container.style.width = "800px";

    // Using the same CSS and HTML structure as handlePrintBill but for PDF generation
    // We need to strip the <html>, <head>, etc. for innerHTML if we just want the container
    const tempDiv = document.createElement('div');
    // Simplified version of the printContent for canvas capture
    tempDiv.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 40px; background: white; color: black; line-height: 1.5;">
        <div style="text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1e40af; padding-bottom: 20px;">
          <h1 style="font-size: 28px; font-weight: bold; color: #1e40af; margin-bottom: 5px;">OMERA CLINIC</h1>
          <p style="font-size: 14px; color: #666; font-style: italic;">Professional Aesthetic & Skin Care</p>
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px;">
          <div>
            <p><strong>Bill ID:</strong> ${bill.id}</p>
            <p><strong>Date:</strong> ${format(new Date(bill.date), "dd MMM yyyy")}</p>
          </div>
          <div style="text-align: right;">
            <p><strong>Patient:</strong> ${bill.patientName}</p>
            <p><strong>Status:</strong> ${bill.pendingAmount > 0 ? "PENDING" : "SETTLED"}</p>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #1e40af; color: white;">
              <th style="padding: 10px; text-align: left;">Description</th>
              <th style="padding: 10px; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${bill.treatments.map(t => `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px;">${t.treatmentName}</td>
                <td style="padding: 10px; text-align: right;">₹${t.price.toFixed(2)}</td>
              </tr>
            `).join("")}
            ${bill.medicines.map(m => `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px;">${m.medicineName} (${m.quantity}x)</td>
                <td style="padding: 10px; text-align: right;">₹${m.total.toFixed(2)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div style="margin-left: auto; width: 300px;">
          <div style="display: flex; justify-content: space-between; padding: 5px 0;">
            <span>Gross Total:</span>
            <span>₹${bill.grandTotal.toFixed(2)}</span>
          </div>
          ${(bill.grandTotal - bill.finalAmount) > 0.01 ? `
          <div style="display: flex; justify-content: space-between; padding: 5px 0; color: #16a34a;">
            <span>Discount:</span>
            <span>-₹${(bill.grandTotal - bill.finalAmount).toFixed(2)}</span>
          </div>
          ` : ""}
          <div style="display: flex; justify-content: space-between; border-top: 2px solid #1e40af; padding: 10px 0; font-weight: bold; font-size: 18px; color: #1e40af; margin: 10px 0;">
            <span>FINAL:</span>
            <span>₹${bill.finalAmount.toFixed(2)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 5px 0; color: #16a34a;">
            <span>Paid:</span>
            <span>₹${bill.amountPaid.toFixed(2)}</span>
          </div>
          ${bill.pendingAmount > 0 ? `
          <div style="display: flex; justify-content: space-between; padding: 5px 0; color: #dc2626; font-weight: bold;">
            <span>PENDING:</span>
            <span>₹${bill.pendingAmount.toFixed(2)}</span>
          </div>
          ` : ""}
        </div>

        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
          <p>Thank you for choosing Omera Clinic</p>
          <p>This is a computer generated invoice.</p>
        </div>
      </div>
    `;

    container.appendChild(tempDiv);
    document.body.appendChild(container);

    try {
      toast({ title: "Generating PDF...", description: "Please wait while we prepare your file." });

      const canvas = await html2canvas(tempDiv, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      const pdfBlob = pdf.output("blob");
      const fileName = `Bill_${bill.patientName.replace(/\s+/g, '_')}_${bill.id}.pdf`;
      const file = new File([pdfBlob], fileName, { type: "application/pdf" });

      const patient = patients.find(p => p.id === bill.patientId);
      const phone = patient?.phone || "";

      // WhatsApp Message
      const message = `Hello ${bill.patientName},\n\nPlease find attached the bill for your visit to Omera Clinic on ${format(new Date(bill.date), "dd MMM yyyy")}.\n\nTotal: ₹${bill.finalAmount.toFixed(2)}\nPaid: ₹${bill.amountPaid.toFixed(2)}\nPending: ₹${bill.pendingAmount.toFixed(2)}\n\nThank you for choosing Omera Clinic!`;

      // Try Web Share API for native sharing with file
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "Clinic Bill",
            text: message,
          });
        } catch (shareErr: any) {
          if (shareErr.name !== 'AbortError') console.error("Share failed", shareErr);
        }
      } else {
        // Fallback: Download and open WhatsApp Web
        pdf.save(fileName);

        const encodedMessage = encodeURIComponent(message);
        const whatsappUrl = phone
          ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodedMessage}`
          : `https://wa.me/?text=${encodedMessage}`;
        window.open(whatsappUrl, '_blank');

        toast({
          title: "PDF Downloaded",
          description: "Since file sharing is not supported in this browser, the PDF was downloaded. You can now manually attach it on WhatsApp.",
        });
      }
    } catch (err) {
      console.error("Failed to share PDF", err);
      toast({
        title: "Scaling Error",
        description: "Failed to generate or share PDF. Please try printing instead.",
        variant: "destructive",
      });
    } finally {
      document.body.removeChild(container);
    }
  };

  const BillCard = ({
    bill,
    onPayment,
    onEdit,
    onDelete,
    onPrint,
    onShare,
  }: {
    bill: Bill;
    onPayment: (bill: Bill) => void;
    onEdit: (bill: Bill) => void;
    onDelete: (bill: Bill) => void;
    onPrint: (bill: Bill) => void;
    onShare: (bill: Bill) => void;
  }) => (
    <div className="p-4 border rounded-lg space-y-3 hover-elevate">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="font-medium">{bill.patientName}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Phone className="w-3 h-3" />
            Bill Date: {format(new Date(bill.date), "dd MMM yyyy")}
          </p>
        </div>
        <Badge variant={bill.pendingAmount > 0 ? "destructive" : "default"}>
          {bill.pendingAmount > 0 ? "Pending" : "Settled"}
        </Badge>
      </div>

      <div className="space-y-1 text-sm">
        {bill.treatments.length > 0 && (
          <p className="text-muted-foreground">
            <span className="font-medium">Treatments:</span> {bill.treatments.map((t) => t.treatmentName).join(", ")}
          </p>
        )}
        {bill.medicines.length > 0 && (
          <p className="text-muted-foreground">
            <span className="font-medium">Medicines:</span> {bill.medicines.length} item(s)
          </p>
        )}
      </div>

      <div className="bg-muted/50 p-3 rounded space-y-2">
        {bill.discount > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal:</span>
            <span>₹{bill.grandTotal.toFixed(2)}</span>
          </div>
        )}
        {bill.discount > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Discount ({bill.discount}%):</span>
            <span>-₹{(bill.grandTotal - bill.finalAmount).toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-semibold border-b pb-2">
          <span>Final Amount:</span>
          <span>₹{bill.finalAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Amount Paid (All Visits):</span>
          <span className="font-medium text-green-600">₹{bill.amountPaid.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Still Pending:</span>
          <span className={`font-medium ${bill.pendingAmount > 0 ? 'text-destructive' : 'text-green-600'}`}>
            ₹{bill.pendingAmount.toFixed(2)}
          </span>
        </div>
        {bill.pendingAmount === 0 && (
          <div className="text-xs text-center text-green-600 font-semibold mt-2 pt-2 border-t">
            ✓ Bill Settled
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-blue-600 border-blue-200 hover:bg-blue-50"
          onClick={() => onPrint(bill)}
        >
          <Printer className="w-4 h-4 mr-1" />
          Print Bill
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-green-600 border-green-200 hover:bg-green-50"
          onClick={() => onShare(bill)}
        >
          <MessageCircle className="w-4 h-4 mr-1" />
          WhatsApp
        </Button>
        {bill.pendingAmount > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => onPayment(bill)}
          >
            <Check className="w-4 h-4 mr-1" />
            Record Payment
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onEdit(bill)}
        >
          <Edit2 className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          onClick={() => onDelete(bill)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Bill Management</h1>
        <p className="text-muted-foreground">
          View recent bills and manage pending payments
        </p>
      </div>

      <Card className="bg-card/50">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-sm font-medium">Filter by Date:</label>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Select date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current-month">Current Month</SelectItem>
                <SelectItem value="last-month">Last Month</SelectItem>
                <SelectItem value="last-3-months">Last 3 Months</SelectItem>
                <SelectItem value="last-6-months">Last 6 Months</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            {dateFilter === "custom" && (
              <div className="flex flex-col sm:flex-row gap-2 flex-1">
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  placeholder="Start date"
                  className="flex-1"
                />
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  placeholder="End date"
                  className="flex-1"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Bills */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Recent Bills</CardTitle>
            <div className="mt-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by patient name..."
                value={recentBillSearch}
                onChange={(e) => setRecentBillSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {billsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : recentBills.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No bills found</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {recentBills.map((bill) => (
                  <BillCard
                    key={bill.id}
                    bill={bill}
                    onPayment={(b) => {
                      setSelectedBillForPayment(b);
                      setPaymentDialogAmount("");
                      setIsEditingPaidAmount(false);
                      setEditedPaidAmount("");
                      setIsPaymentDialogOpen(true);
                    }}
                    onEdit={openEditBillDialog}
                    onDelete={(b) => setBillToDelete(b)}
                    onPrint={handlePrintBill}
                    onShare={handleShareWhatsApp}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Bills */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-destructive">Pending Bills</CardTitle>
            <div className="mt-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by patient name..."
                value={pendingBillSearch}
                onChange={(e) => setPendingBillSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {billsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : pendingBills.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No pending bills</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {pendingBills.map((bill) => (
                  <BillCard
                    key={bill.id}
                    bill={bill}
                    onPayment={(b) => {
                      setSelectedBillForPayment(b);
                      setPaymentDialogAmount("");
                      setIsEditingPaidAmount(false);
                      setEditedPaidAmount("");
                      setIsPaymentDialogOpen(true);
                    }}
                    onEdit={openEditBillDialog}
                    onDelete={(b) => setBillToDelete(b)}
                    onPrint={handlePrintBill}
                    onShare={handleShareWhatsApp}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={(open) => {
        setIsPaymentDialogOpen(open);
        if (!open) {
          setIsEditingPaidAmount(false);
          setEditedPaidAmount("");
          setPaymentDialogAmount("");
          setSelectedBillForPayment(null);
          setPaymentMode("Cash");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {selectedBillForPayment && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg space-y-2 text-sm border">
                <div className="text-xs font-semibold text-muted-foreground mb-2">BILL SUMMARY</div>
                <div className="flex justify-between">
                  <span>Final Amount:</span>
                  <span className="font-medium">₹{selectedBillForPayment.finalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>Already Paid:</span>
                  <span className="font-medium">₹{selectedBillForPayment.amountPaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-destructive border-t pt-2 font-semibold">
                  <span>Still Pending:</span>
                  <span>₹{selectedBillForPayment.pendingAmount.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm mb-2">
                  <input
                    type="checkbox"
                    checked={isEditingPaidAmount}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsEditingPaidAmount(checked);
                      if (checked && selectedBillForPayment) {
                        setEditedPaidAmount(selectedBillForPayment.amountPaid.toString());
                      } else {
                        setEditedPaidAmount("");
                      }
                    }}
                  />
                  <span className="font-medium">Edit Already Paid Amount (overwrite)</span>
                </label>

                {isEditingPaidAmount ? (
                  <>
                    <label className="text-sm font-medium mb-2 block">New Paid Total</label>
                    <Input
                      type="number"
                      min="0"
                      max={selectedBillForPayment?.finalAmount}
                      value={editedPaidAmount}
                      onChange={(e) => setEditedPaidAmount(e.target.value)}
                      placeholder="0"
                      className="text-lg"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Overwrites the cumulative paid amount for this bill. Use this to correct mistakes.
                    </p>
                  </>
                ) : (
                  <>
                    <label className="text-sm font-medium mb-2 block">
                      Add Amount
                      <span className="text-xs text-muted-foreground ml-2">(this payment)</span>
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max={selectedBillForPayment?.pendingAmount}
                      value={paymentDialogAmount}
                      onChange={(e) => setPaymentDialogAmount(e.target.value)}
                      placeholder="0"
                      className="text-lg"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Enter only the amount being paid in this transaction. The system will add it to previous payments.
                    </p>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Payment Mode</label>
                <Select value={paymentMode} onValueChange={(v: "Cash" | "Online") => setPaymentMode(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Online">Online</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(paymentDialogAmount || isEditingPaidAmount) && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg space-y-1 text-sm border border-blue-200 dark:border-blue-800">
                  <div className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-2">AFTER THIS ACTION:</div>
                  {isEditingPaidAmount ? (
                    <>
                      <div className="flex justify-between">
                        <span>New Total Paid:</span>
                        <span className="font-medium text-green-600">₹{(parseFloat(editedPaidAmount || '0')).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Remaining Pending:</span>
                        <span className={`font-medium ${((selectedBillForPayment?.finalAmount || 0) - (parseFloat(editedPaidAmount || '0'))) > 0 ? 'text-destructive' : 'text-green-600'}`}>
                          ₹{(((selectedBillForPayment?.finalAmount || 0) - (parseFloat(editedPaidAmount || '0')))).toFixed(2)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span>Total Paid:</span>
                        <span className="font-medium text-green-600">₹{(selectedBillForPayment.amountPaid + parseFloat(paymentDialogAmount || '0')).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Remaining Pending:</span>
                        <span className={`font-medium ${(selectedBillForPayment.pendingAmount - parseFloat(paymentDialogAmount || '0')) > 0 ? 'text-destructive' : 'text-green-600'}`}>
                          ₹{(selectedBillForPayment.pendingAmount - parseFloat(paymentDialogAmount || '0')).toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={adjustPaymentMutation.isPending || (!isEditingPaidAmount && !paymentDialogAmount) || (isEditingPaidAmount && !editedPaidAmount)}
                  onClick={() => {
                    if (!selectedBillForPayment) return;

                    if (isEditingPaidAmount) {
                      const setAmount = parseFloat(editedPaidAmount) || 0;
                      if (setAmount < 0 || setAmount > selectedBillForPayment.finalAmount) {
                        toast({
                          title: "Invalid Amount",
                          description: `Please enter a value between 0 and ₹${selectedBillForPayment.finalAmount.toFixed(2)}`,
                          variant: "destructive",
                        });
                        return;
                      }
                      adjustPaymentMutation.mutate({
                        billId: selectedBillForPayment.id,
                        setAmount,
                        paymentMode,
                      });
                    } else {
                      const addAmount = parseFloat(paymentDialogAmount) || 0;
                      if (addAmount <= 0) {
                        toast({
                          title: "Invalid Amount",
                          description: "Please enter an amount greater than 0",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (addAmount > selectedBillForPayment.pendingAmount) {
                        toast({
                          title: "Amount Exceeds Pending",
                          description: `Only ₹${selectedBillForPayment.pendingAmount.toFixed(2)} pending on this bill`,
                          variant: "destructive",
                        });
                        return;
                      }
                      adjustPaymentMutation.mutate({
                        billId: selectedBillForPayment.id,
                        addAmount,
                        paymentMode,
                      });
                    }
                  }}
                >
                  {adjustPaymentMutation.isPending ? "Saving..." : "Record Payment"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Bill Dialog */}
      <Dialog open={isEditBillDialogOpen} onOpenChange={setIsEditBillDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Bill</DialogTitle>
          </DialogHeader>
          {billToEdit ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Patient: {billToEdit.patientName}</p>
                <p className="text-sm text-muted-foreground">
                  Date: {format(new Date(billToEdit.date), "dd MMM yyyy")}
                </p>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">Treatments</label>
                  <Select onValueChange={addEditingTreatment}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Add treatment" />
                    </SelectTrigger>
                    <SelectContent>
                      {treatments.map((treatment) => (
                        <SelectItem key={treatment.id} value={treatment.id}>
                          {treatment.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {editingTreatments.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-2 bg-muted/30 rounded">
                    No treatments
                  </div>
                ) : (
                  <div className="space-y-2">
                    {editingTreatments.map((treatment, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-muted/30 rounded"
                      >
                        <span className="text-sm font-medium">{treatment.treatmentName}</span>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            value={treatment.price}
                            onChange={(e) =>
                              updateEditingTreatmentPrice(index, parseFloat(e.target.value) || 0)
                            }
                            className="h-7 w-20 text-xs"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => removeEditingTreatment(index)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">Medicines</label>
                  <Button variant="outline" size="sm" onClick={addEditingMedicine}>
                    <Plus className="w-3 h-3 mr-1" />
                    Add
                  </Button>
                </div>
                {editingMedicines.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-2 bg-muted/30 rounded">
                    No medicines
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {editingMedicines.map((med, index) => (
                      <div key={index} className="p-2 bg-muted/30 rounded space-y-2">
                        <div className="flex items-center gap-2">
                          <Select
                            value={med.medicineId}
                            onValueChange={(value) => updateEditingMedicine(index, value)}
                          >
                            <SelectTrigger className="flex-1 h-8 text-xs">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {medicines.map((medicine) => (
                                <SelectItem key={medicine.id} value={medicine.id}>
                                  {medicine.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => removeEditingMedicine(index)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        {med.medicineId && (
                          <div className="grid grid-cols-3 gap-1">
                            <Input
                              type="number"
                              min="1"
                              value={med.quantity}
                              onChange={(e) =>
                                updateEditingMedicineQuantity(index, parseInt(e.target.value) || 1)
                              }
                              className="h-7 text-xs"
                              placeholder="Qty"
                            />
                            <Input
                              type="number"
                              min="0"
                              value={med.unitPrice}
                              onChange={(e) =>
                                updateEditingMedicinePrice(index, parseFloat(e.target.value) || 0)
                              }
                              className="h-7 text-xs"
                              placeholder="Price"
                            />
                            <div className="h-7 flex items-center text-xs font-medium">
                              ₹{med.total.toFixed(0)}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Treatment Total:</span>
                  <span>₹{editingTreatments.reduce((sum, t) => sum + t.price, 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Medicine Total:</span>
                  <span>₹{editingMedicines.reduce((sum, m) => sum + m.total, 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Grand Total:</span>
                  <span>
                    ₹
                    {(
                      editingTreatments.reduce((sum, t) => sum + t.price, 0) +
                      editingMedicines.reduce((sum, m) => sum + m.total, 0)
                    ).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditBillDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={updateBillMutation.isPending}
                  onClick={() => {
                    if (billToEdit) {
                      updateBillMutation.mutate({
                        billId: billToEdit.id,
                        treatments: editingTreatments,
                        medicines: editingMedicines,
                      });
                    }
                  }}
                >
                  {updateBillMutation.isPending ? "Updating..." : "Update Bill"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!billToDelete} onOpenChange={() => setBillToDelete(null)}>
        <AlertDialogContent>
          <div>
            <h2 className="font-semibold mb-2">Delete Bill</h2>
            <AlertDialogDescription>
              Are you sure you want to delete this bill for "{billToDelete?.patientName}"?
              This will also restore the medicine stock. This action cannot be undone.
            </AlertDialogDescription>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => billToDelete && deleteBillMutation.mutate(billToDelete.id)}
            >
              {deleteBillMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
