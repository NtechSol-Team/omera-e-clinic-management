import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Phone,
  Calendar,
  FileText,
  Stethoscope,
  Plus,
  User,
  Pencil,
  X,
  Check,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Patient, Visit, Bill } from "@shared/schema";
import { insertVisitSchema, insertPatientSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { extractPaginatedData } from "@/lib/utils";
import { format } from "date-fns";
import { z } from "zod";
import { VisitPhotoUpload } from "@/components/VisitPhotoUpload";
import { PatientPhotoGallery } from "@/components/PatientPhotoGallery";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutGrid, ClipboardList } from "lucide-react";

const addVisitSchema = z.object({
  date: z.string(),
  complaints: z.string().min(1, "Complaints are required"),
  diagnosis: z.string().min(1, "Diagnosis is required"),
});

type AddVisitForm = z.infer<typeof addVisitSchema>;

export default function PatientDetails() {
  const [, params] = useRoute("/patient/:id");
  const patientId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isEditingPatient, setIsEditingPatient] = useState(false);
  const { user } = useAuth();
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null);
  const [, setLocation] = useRoute("/patient/:id"); // Used for navigation after delete

  const { data: patient, isLoading: patientLoading } = useQuery<Patient>({
    queryKey: ["/api/patients", patientId],
    enabled: !!patientId,
  });

  const { data: visits = [], isLoading: visitsLoading } = useQuery<Visit[]>({
    queryKey: ["/api/visits", patientId],
    enabled: !!patientId,
  });

  const { data: billsResponse } = useQuery({
    queryKey: ["/api/bills"],
  });
  const bills = extractPaginatedData<Bill>(billsResponse);
  const patientBills = bills
    .filter((b) => b.patientId === patientId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const form = useForm<AddVisitForm>({
    resolver: zodResolver(addVisitSchema),
    defaultValues: {
      date: format(new Date(), "yyyy-MM-dd"),
      complaints: "",
      diagnosis: "",
    },
  });

  const patientForm = useForm<z.infer<typeof insertPatientSchema>>({
    resolver: zodResolver(insertPatientSchema),
    defaultValues: {
      name: patient?.name || "",
      phone: patient?.phone || "",
      registrationDate: patient?.registrationDate || format(new Date(), "yyyy-MM-dd"),
    },
  });

  const editForm = useForm<AddVisitForm>({
    resolver: zodResolver(addVisitSchema),
    defaultValues: {
      date: format(new Date(), "yyyy-MM-dd"),
      complaints: "",
      diagnosis: "",
    },
  });

  const addVisitMutation = useMutation({
    mutationFn: async (data: AddVisitForm) => {
      return await apiRequest("POST", "/api/visits", {
        patientId,
        ...data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/visits", patientId] });
      toast({
        title: "Visit Added",
        description: "New visit has been recorded successfully.",
      });
      setIsDialogOpen(false);
      form.reset({
        date: format(new Date(), "yyyy-MM-dd"),
        complaints: "",
        diagnosis: "",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Add Visit",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updatePatientMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertPatientSchema>) => {
      return await apiRequest("PATCH", `/api/patients/${patientId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({
        title: "Patient Updated",
        description: "Patient information has been updated successfully.",
      });
      setIsEditingPatient(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Update Patient",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateVisitMutation = useMutation({
    mutationFn: async (data: AddVisitForm) => {
      if (!patientId || !editingVisit) throw new Error("No visit selected");
      return await apiRequest("PATCH", `/api/visits/${editingVisit.id}`, {
        patientId,
        ...data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/visits", patientId] });
      toast({
        title: "Visit Updated",
        description: "Visit details have been updated successfully.",
      });
      handleEditDialogChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Update Visit",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePatientMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/patients/${patientId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visits"] });

      toast({
        title: "Patient Deleted",
        description: "Patient and all associated records have been deleted.",
      });
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Delete Patient",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const openEditDialog = (visit: Visit) => {
    setEditingVisit(visit);
    editForm.reset({
      date: visit.date,
      complaints: visit.complaints,
      diagnosis: visit.diagnosis,
    });
    setIsEditDialogOpen(true);
  };

  const handleEditDialogChange = (open: boolean) => {
    setIsEditDialogOpen(open);
    if (!open) {
      setEditingVisit(null);
    }
  };

  const sortedVisits = [...visits].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  if (patientLoading || visitsLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center py-12">
          <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-1">Patient Not Found</h3>
          <p className="text-muted-foreground text-sm mb-4">
            The patient you're looking for doesn't exist.
          </p>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          {isEditingPatient ? (
            <div className="flex-1">
              <Form {...patientForm}>
                <form
                  onSubmit={patientForm.handleSubmit((data) =>
                    updatePatientMutation.mutate(data)
                  )}
                  className="space-y-3"
                >
                  <FormField
                    control={patientForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            placeholder="Patient name"
                            {...field}
                            className="text-2xl font-semibold"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={patientForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input placeholder="Phone number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={updatePatientMutation.isPending}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      {updatePatientMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditingPatient(false)}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          ) : (
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1
                  className="text-2xl font-semibold tracking-tight"
                  data-testid="text-patient-name"
                >
                  {patient?.name}
                </h1>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    patientForm.reset({
                      name: patient?.name || "",
                      phone: patient?.phone || "",
                      registrationDate:
                        patient?.registrationDate || format(new Date(), "yyyy-MM-dd"),
                    });
                    setIsEditingPatient(true);
                  }}
                  data-testid="button-edit-patient"
                >
                  <Pencil className="w-4 h-4" />
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      data-testid="button-delete-patient"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the patient
                        <strong> {patient?.name}</strong> and all their associated visits,
                        bills, and records from the database.
                        <br /><br />
                        Any paid amounts will also be removed from revenue reports.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => deletePatientMutation.mutate()}
                      >
                        {deletePatientMutation.isPending ? "Deleting..." : "Delete Patient"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground text-sm mt-2">
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {patient?.phone}
                </span>
                <span className="text-border">|</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Registered: {format(new Date(patient?.registrationDate || ""), "dd MMM yyyy")}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
          <div>
            <CardTitle className="text-lg">Visit History</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {sortedVisits.length} visit{sortedVisits.length !== 1 ? "s" : ""} recorded
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-visit">
                <Plus className="w-4 h-4 mr-2" />
                Add Visit
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add New Visit</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit((data) => addVisitMutation.mutate(data))}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Visit Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-visit-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="complaints"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Complaints</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter patient's complaints..."
                            className="min-h-[80px] resize-none"
                            {...field}
                            data-testid="input-visit-complaints"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="diagnosis"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Diagnosis</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter diagnosis..."
                            className="min-h-[80px] resize-none"
                            {...field}
                            data-testid="input-visit-diagnosis"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={addVisitMutation.isPending}
                      data-testid="button-save-visit"
                    >
                      {addVisitMutation.isPending ? "Saving..." : "Save Visit"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </CardHeader>

        <Tabs defaultValue="history" className="w-full">
          <div className="px-6 pb-2 border-b">
            <TabsList className="bg-slate-100/50 p-1">
              <TabsTrigger value="history" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <ClipboardList className="h-3.5 w-3.5 mr-2" />
                Visit History
              </TabsTrigger>
              <TabsTrigger value="gallery" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <LayoutGrid className="h-3.5 w-3.5 mr-2" />
                Photo Gallery
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="history" className="m-0">
            <CardContent className="pt-6">
              {sortedVisits.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No visits recorded yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sortedVisits.map((visit, index) => (
                    <div
                      key={visit.id}
                      className="relative pl-6 pb-6 last:pb-0 border-l-2 border-border last:border-transparent"
                      data-testid={`card-visit-${visit.id}`}
                    >
                      <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-primary border-4 border-background" />

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-medium">
                              {format(new Date(visit.date), "dd MMM yyyy")}
                            </span>
                            <Badge variant="secondary">
                              {sortedVisits.length - index === 1 ? "1st" :
                                sortedVisits.length - index === 2 ? "2nd" :
                                  sortedVisits.length - index === 3 ? "3rd" :
                                    `${sortedVisits.length - index}th`} Visit
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => openEditDialog(visit)}
                            data-testid={`button-edit-visit-${visit.id}`}
                          >
                            <Pencil className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                              <FileText className="w-4 h-4" />
                              Complaints
                            </div>
                            <p className="text-sm" data-testid={`text-complaints-${visit.id}`}>
                              {visit.complaints}
                            </p>
                          </div>

                          <div className="p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                              <Stethoscope className="w-4 h-4" />
                              Diagnosis
                            </div>
                            <p className="text-sm" data-testid={`text-diagnosis-${visit.id}`}>
                              {visit.diagnosis}
                            </p>
                          </div>
                        </div>

                        {/* Show medicines from bills on the same date */}
                        {(() => {
                          const visitDateStr = format(new Date(visit.date), "yyyy-MM-dd");
                          const visitBills = patientBills.filter(
                            (b) => format(new Date(b.date), "yyyy-MM-dd") === visitDateStr && b.medicines.length > 0
                          );
                          if (visitBills.length === 0) return null;
                          const allMedicines = visitBills.flatMap((b) => b.medicines);
                          return (
                            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 mt-2">
                              <div className="flex items-center gap-2 text-sm font-medium text-primary mb-2">
                                <FileText className="w-4 h-4" />
                                Medicines Given
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {allMedicines.map((m, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {m.medicineName} x{m.quantity}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Visit Photo - Professional & Compact */}
                        <div className="mt-4 pt-3 border-t border-slate-100">
                          <VisitPhotoUpload
                            visitId={visit.id}
                            initialPhotoFileId={visit.photoFileId}
                            initialPhotoUrl={(visit as any).photoUrl}
                            onUploadSuccess={() => {
                              queryClient.invalidateQueries({ queryKey: ["/api/visits", patientId] });
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </TabsContent>

          <TabsContent value="gallery" className="m-0">
            <CardContent className="pt-6">
              <PatientPhotoGallery visits={visits} />
            </CardContent>
          </TabsContent>
        </Tabs>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={handleEditDialogChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Visit</DialogTitle>
          </DialogHeader>
          {editingVisit ? (
            <Form {...editForm}>
              <form
                onSubmit={editForm.handleSubmit((data) => updateVisitMutation.mutate(data))}
                className="space-y-4"
              >
                <FormField
                  control={editForm.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Visit Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-edit-visit-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="complaints"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Complaints</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Update patient's complaints..."
                          className="min-h-[80px] resize-none"
                          {...field}
                          data-testid="input-edit-visit-complaints"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="diagnosis"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Diagnosis</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Update diagnosis..."
                          className="min-h-[80px] resize-none"
                          {...field}
                          data-testid="input-edit-visit-diagnosis"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="mt-4 pt-4 border-t">
                  <VisitPhotoUpload
                    visitId={editingVisit.id}
                    initialPhotoFileId={editingVisit.photoFileId}
                    initialPhotoUrl={(editingVisit as any).photoUrl}
                    onUploadSuccess={() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/visits", patientId] });
                    }}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleEditDialogChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateVisitMutation.isPending}
                    data-testid="button-save-visit-edit"
                  >
                    {updateVisitMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <p className="text-sm text-muted-foreground">Select a visit to edit.</p>
          )}
        </DialogContent>
      </Dialog>
      {
        user?.role === 'admin' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
              <div>
                <CardTitle className="text-lg">Bill History</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {patientBills.length} bill{patientBills.length !== 1 ? "s" : ""} generated
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {patientBills.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No bills generated yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {patientBills.map((bill) => (
                    <div
                      key={bill.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover-elevate"
                      data-testid={`card-bill-${bill.id}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {format(new Date(bill.date), "dd MMM yyyy")}
                          </span>
                          <Badge variant={bill.pendingAmount > 0 ? "destructive" : "outline"} className={bill.pendingAmount === 0 ? "text-green-600 border-green-200 bg-green-50" : ""}>
                            {bill.pendingAmount > 0 ? "Pending" : "Paid"}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {bill.treatments.length} Treatments, {bill.medicines.length} Medicines
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">
                          ₹{bill.finalAmount.toFixed(2)}
                        </div>
                        {bill.discount > 0 && (
                          <div className="text-xs text-muted-foreground line-through">
                            ₹{bill.grandTotal.toFixed(2)}
                          </div>
                        )}
                        {bill.pendingAmount > 0 && (
                          <div className="text-sm text-destructive font-medium">
                            Due: ₹{bill.pendingAmount.toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      }
    </div >
  );
}
