import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Receipt,
  Search,
  Plus,
  Trash2,
  Phone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type {
  Patient,
  Medicine,
  Treatment,
  BillMedicineItem,
  BillTreatmentItem,
} from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { extractPaginatedData } from "@/lib/utils";
import { format } from "date-fns";

export default function BillingCreate() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [billDate, setBillDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const [selectedTreatments, setSelectedTreatments] = useState<BillTreatmentItem[]>([]);
  const [selectedMedicines, setSelectedMedicines] = useState<BillMedicineItem[]>([]);
  const [discount, setDiscount] = useState("");
  const [amountPaid, setAmountPaid] = useState("");

  const { data: patientsResponse, isLoading: patientsLoading } = useQuery({
    queryKey: ["/api/patients"],
  });
  const patients = extractPaginatedData<Patient>(patientsResponse);

  // Handle patient pre-selection from URL or Session Storage and clear it
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let patientId = params.get("patientId");

    // Check session storage if not in URL
    if (!patientId) {
      patientId = sessionStorage.getItem("preselectedPatientId");
    }

    if (patientId && patients.length > 0 && !selectedPatient) {
      const patient = patients.find(p => String(p.id) === patientId);
      if (patient) {
        setSelectedPatient(patient);
        // Clear session storage to prevent persistence
        sessionStorage.removeItem("preselectedPatientId");
      }
    }
  }, [patients, selectedPatient]);

  const { data: medicinesResponse } = useQuery({
    queryKey: ["/api/medicines"],
  });
  const medicines = extractPaginatedData<Medicine>(medicinesResponse);

  const { data: treatmentsResponse } = useQuery({
    queryKey: ["/api/treatments"],
  });
  const treatments = extractPaginatedData<Treatment>(treatmentsResponse);

  const filteredPatients = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.phone.includes(searchQuery)
  );

  const createBillMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) throw new Error("Please select a patient");

      const treatmentTotal = selectedTreatments.reduce((sum, t) => sum + t.price, 0);
      const medicineNetTotal = selectedMedicines.reduce((sum, m) => sum + m.total, 0);
      const medicineGrossTotal = selectedMedicines.reduce((sum, m) => sum + (m.unitPrice * m.quantity), 0);
      const totalMedicineDiscount = selectedMedicines.reduce((sum, m) => sum + (m.discount || 0), 0);

      const grandTotal = treatmentTotal + medicineGrossTotal; // Gross Total
      const discountValue = totalMedicineDiscount; // Total Discount Amount
      const finalAmount = treatmentTotal + medicineNetTotal; // Net Total
      const paid = parseFloat(amountPaid) || 0;

      return await apiRequest("POST", "/api/bills", {
        patientId: selectedPatient.id,
        date: billDate,
        treatments: selectedTreatments,
        medicines: selectedMedicines,
        treatmentTotal,
        medicineTotal: medicineNetTotal, // We store Net total in medicine_total column usually or Gross? 
        // Existing schema says medicine_total. 
        // Logic in Bills page shows "Medicine Total (Net)" so it expects net.
        grandTotal, // Saving Gross here
        discount: discountValue,
        finalAmount,
        amountPaid: paid,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/medicines"] });
      toast({
        title: "Bill Created",
        description: "Bill has been saved successfully.",
      });
      resetForm();
      // Force page reload as requested
      window.location.reload();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Create Bill",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSelectedPatient(null);
    setSelectedTreatments([]);
    setSelectedMedicines([]);
    setAmountPaid("");
    setDiscount("");
    setSearchQuery("");
    setBillDate(format(new Date(), "yyyy-MM-dd"));
  };

  const addTreatment = (treatmentId: string) => {
    const treatment = treatments.find((t) => t.id === treatmentId);
    if (treatment) {
      setSelectedTreatments([
        ...selectedTreatments,
        {
          treatmentId: treatment.id,
          treatmentName: treatment.name,
          price: treatment.defaultPrice,
        },
      ]);
    }
  };

  const updateTreatmentPrice = (index: number, price: number) => {
    const updated = [...selectedTreatments];
    updated[index].price = price;
    setSelectedTreatments(updated);
  };

  const removeTreatment = (index: number) => {
    setSelectedTreatments(selectedTreatments.filter((_, i) => i !== index));
  };

  const addMedicine = () => {
    setSelectedMedicines([
      ...selectedMedicines,
      {
        medicineId: "",
        medicineName: "",
        quantity: 1,
        unitPrice: 0,
        discountPercent: 0,
        discount: 0,
        total: 0,
      },
    ]);
  };

  const updateMedicineName = (index: number, name: string) => {
    const updated = [...selectedMedicines];
    updated[index].medicineName = name;
    // Clear ID if name is changed manually, so server knows to search/add
    updated[index].medicineId = "";
    setSelectedMedicines(updated);
  };

  const updateMedicine = (index: number, medicine: Medicine) => {
    const updated = [...selectedMedicines];
    updated[index] = {
      medicineId: medicine.id,
      medicineName: medicine.name,
      quantity: 1,
      unitPrice: medicine.sellingPrice,
      discountPercent: 0,
      discount: 0,
      total: medicine.sellingPrice,
    };
    setSelectedMedicines(updated);
  };

  const updateMedicineQuantity = (index: number, quantity: number) => {
    const updated = [...selectedMedicines];
    updated[index].quantity = quantity;
    const gross = updated[index].unitPrice * quantity;
    const discount = (gross * (updated[index].discountPercent || 0)) / 100;
    updated[index].discount = discount;
    updated[index].total = gross - discount;
    setSelectedMedicines(updated);
  };

  const updateMedicinePrice = (index: number, price: number) => {
    const updated = [...selectedMedicines];
    updated[index].unitPrice = price;
    const gross = price * updated[index].quantity;
    const discount = (gross * (updated[index].discountPercent || 0)) / 100;
    updated[index].discount = discount;
    updated[index].total = gross - discount;
    setSelectedMedicines(updated);
  };

  const updateMedicineDiscount = (index: number, percent: number) => {
    const updated = [...selectedMedicines];
    updated[index].discountPercent = percent;
    const gross = updated[index].unitPrice * updated[index].quantity;
    const discount = (gross * percent) / 100;
    updated[index].discount = discount;
    updated[index].total = gross - discount;
    setSelectedMedicines(updated);
  };

  const removeMedicine = (index: number) => {
    setSelectedMedicines(selectedMedicines.filter((_, i) => i !== index));
  };

  const treatmentTotal = selectedTreatments.reduce((sum, t) => sum + t.price, 0);
  const medicineTotal = selectedMedicines.reduce((sum, m) => sum + m.total, 0);
  const totalMedicineDiscount = selectedMedicines.reduce((sum, m) => sum + (m.discount || 0), 0);

  // Grand total is the sum of net totals (because medicine.total is now net)
  // If we want "Gross Total" before discount:
  const medicineGrossTotal = selectedMedicines.reduce((sum, m) => sum + (m.unitPrice * m.quantity), 0);
  const grossGrandTotal = treatmentTotal + medicineGrossTotal;

  // Total discount is just medicine discount (user disabled bill-level discount)
  const discountValue = totalMedicineDiscount;

  // Final Amount
  const finalAmount = treatmentTotal + medicineTotal; // Since medicineTotal is already net

  const paid = parseFloat(amountPaid) || 0;
  const pendingAmount = Math.max(0, finalAmount - paid);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create New Bill</h1>
        <p className="text-muted-foreground">
          Create a bill for a patient with treatments and medicines
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="w-5 h-5 text-primary" />
            Bill Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Bill Date */}
          <div>
            <label className="text-sm font-medium mb-2 block">Bill Date</label>
            <Input
              type="date"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
              className="max-w-xs"
              data-testid="input-bill-date"
            />
          </div>

          {/* Patient Selection */}
          <div className="border-t pt-4">
            <label className="text-sm font-medium mb-2 block">Select Patient</label>
            {selectedPatient ? (
              <div className="p-4 rounded-lg bg-muted/50 border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                      {selectedPatient.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{selectedPatient.name}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {selectedPatient.phone}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedPatient(null)}
                  >
                    Change
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-patient-search"
                  />
                </div>
                {searchQuery && (
                  <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                    {filteredPatients.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        No patients found
                      </div>
                    ) : (
                      filteredPatients.map((patient) => (
                        <button
                          key={patient.id}
                          onClick={() => {
                            setSelectedPatient(patient);
                            setSearchQuery("");
                          }}
                          className="w-full p-3 text-left hover-elevate flex items-center gap-3"
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
                            {patient.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{patient.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {patient.phone}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedPatient && (
            <>
              {/* Treatments Section */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">Treatments</label>
                  <Select onValueChange={addTreatment}>
                    <SelectTrigger className="w-48" data-testid="select-treatment">
                      <SelectValue placeholder="Add treatment" />
                    </SelectTrigger>
                    <SelectContent>
                      {treatments.map((treatment) => (
                        <SelectItem key={treatment.id} value={treatment.id}>
                          {treatment.name} - ₹{treatment.defaultPrice}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedTreatments.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4 bg-muted/30 rounded-lg">
                    No treatments added
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedTreatments.map((treatment, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                      >
                        <span className="text-sm font-medium">{treatment.treatmentName}</span>
                        <div className="flex items-center gap-3">
                          <Input
                            type="number"
                            min="0"
                            value={treatment.price}
                            onChange={(e) =>
                              updateTreatmentPrice(index, parseFloat(e.target.value) || 0)
                            }
                            className="h-8 w-24"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => removeTreatment(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Medicines Section */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">Medicines</label>
                  <Button variant="outline" size="sm" onClick={addMedicine}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Medicine
                  </Button>
                </div>
                {selectedMedicines.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4 bg-muted/30 rounded-lg">
                    No medicines added
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedMedicines.map((med, index) => (
                      <div key={index} className="p-3 bg-muted/30 rounded-lg space-y-3">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 space-y-2">
                            <div className="relative">
                              <Input
                                placeholder="Type medicine name..."
                                value={med.medicineName}
                                onChange={(e) => updateMedicineName(index, e.target.value)}
                                className="h-9"
                              />
                              {med.medicineName && !med.medicineId && (
                                <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto bg-popover border rounded-md shadow-md divide-y">
                                  {medicines
                                    .filter(m => m.name.toLowerCase().includes(med.medicineName!.toLowerCase()))
                                    .map(suggestion => (
                                      <button
                                        key={suggestion.id}
                                        type="button"
                                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors flex justify-between items-center"
                                        onClick={() => updateMedicine(index, suggestion)}
                                      >
                                        <span>{suggestion.name}</span>
                                        <span className="text-xs text-muted-foreground italic">₹{suggestion.sellingPrice}</span>
                                      </button>
                                    ))}
                                </div>
                              )}
                              {med.medicineId && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" title="In Master List" />
                                </div>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-destructive shrink-0"
                            onClick={() => removeMedicine(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground">Qty</label>
                            <Input
                              type="number"
                              min="1"
                              value={med.quantity}
                              onChange={(e) =>
                                updateMedicineQuantity(index, parseInt(e.target.value) || 1)
                              }
                              className="h-8"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Price</label>
                            <Input
                              type="number"
                              min="0"
                              value={med.unitPrice}
                              onChange={(e) =>
                                updateMedicinePrice(index, parseFloat(e.target.value) || 0)
                              }
                              className="h-8"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Disc %</label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={med.discountPercent}
                              onChange={(e) =>
                                updateMedicineDiscount(index, parseFloat(e.target.value) || 0)
                              }
                              className="h-8"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Total (Net)</label>
                            <div className="h-8 flex flex-col justify-center font-medium text-sm">
                              <span>₹{med.total.toFixed(2)}</span>
                              {med.discount ? <span className="text-xs text-green-600">(-₹{med.discount.toFixed(2)})</span> : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bill Summary */}
              <div className="border-t pt-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Treatment Total</span>
                  <span>₹{treatmentTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Medicine Total (Net)</span>
                  <span>₹{medicineTotal.toFixed(2)}</span>
                </div>
                {totalMedicineDiscount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Total Discount</span>
                    <span>-₹{totalMedicineDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg border-t pt-3">
                  <span>Gross Total</span>
                  <span>₹{grossGrandTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-xl border-t pt-3 text-primary">
                  <span>Final Amount</span>
                  <span>₹{finalAmount.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="border-t pt-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Amount Paid</label>
                    <Input
                      type="number"
                      min="0"
                      max={finalAmount}
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      placeholder="0"
                      className="max-w-xs"
                      data-testid="input-amount-paid"
                    />
                  </div>
                  <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount Paid:</span>
                      <span>₹{paid.toFixed(2)}</span>
                    </div>
                    <div className={`flex justify-between text-sm font-semibold ${pendingAmount > 0 ? 'text-destructive' : 'text-green-600'}`}>
                      <span>Pending Amount:</span>
                      <span>₹{pendingAmount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="border-t pt-4 flex gap-3 justify-end">
                <Button variant="outline" onClick={resetForm}>
                  Clear
                </Button>
                <Button
                  size="lg"
                  disabled={
                    createBillMutation.isPending ||
                    !selectedPatient ||
                    (selectedTreatments.length === 0 && selectedMedicines.length === 0)
                  }
                  onClick={() => createBillMutation.mutate()}
                  data-testid="button-create-bill"
                >
                  {createBillMutation.isPending ? "Creating..." : "Create Bill"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
