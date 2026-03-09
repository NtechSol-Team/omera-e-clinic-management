import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Search, Users, Calendar, TrendingUp, AlertCircle, ChevronRight, Phone, ChevronDown, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Patient, Bill, Visit, Appointment } from "@shared/schema";
import { extractPaginatedData } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAppointmentSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { z } from "zod";

type AppointmentForm = z.infer<typeof insertAppointmentSchema>;

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [patientFilter, setPatientFilter] = useState<"all" | "new" | "repeat">("all");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPatientForAppointment, setSelectedPatientForAppointment] = useState<Patient | null>(null);
  const [selectedBillForDetails, setSelectedBillForDetails] = useState<Bill | null>(null);

  const form = useForm<AppointmentForm>({
    resolver: zodResolver(insertAppointmentSchema),
    defaultValues: {
      patientId: "",
      date: format(new Date(), "yyyy-MM-dd"),
      reason: "",
      status: "Scheduled",
    },
  });

  // Reset form when patient is selected
  useEffect(() => {
    if (selectedPatientForAppointment) {
      form.setValue("patientId", selectedPatientForAppointment.id);
    }
  }, [selectedPatientForAppointment, form]);

  const createAppointmentMutation = useMutation({
    mutationFn: async (data: AppointmentForm) => {
      return await apiRequest("POST", "/api/appointments", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({
        title: "Appointment Scheduled",
        description: "Upcoming visit assigned successfully.",
      });
      setSelectedPatientForAppointment(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Schedule",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: patientsResponse, isLoading: patientsLoading } = useQuery({
    queryKey: ["/api/patients"],
  });
  const patients = extractPaginatedData<Patient>(patientsResponse);

  const { data: billsResponse } = useQuery({
    queryKey: ["/api/bills"],
  });
  const bills = extractPaginatedData<Bill>(billsResponse);

  const { data: visitsResponse } = useQuery({
    queryKey: ["/api/visits"],
  });
  const visits = extractPaginatedData<Visit>(visitsResponse);

  const { data: appointmentsResponse, isLoading: appointmentsLoading } = useQuery({
    queryKey: ["/api/appointments"],
  });
  const appointments = Array.isArray(appointmentsResponse) ? appointmentsResponse : [];

  const pendingBills = bills.filter((bill) => bill.pendingAmount > 0);

  // Get today's date string
  const todayDate = format(new Date(), "yyyy-MM-dd");

  // Get unique patient IDs from today's visits
  const patientIdsWithTodayVisits = new Set(
    visits
      .filter((v) => v.date === todayDate)
      .map((v) => v.patientId)
  );

  // Include patients registered today OR with visits today
  const todayPatients = patients.filter(
    (p) => p.registrationDate === todayDate || patientIdsWithTodayVisits.has(p.id)
  );

  // Today's bills calculations
  const todayBills = bills.filter((bill) => bill.date === todayDate);
  const todayPaidRevenue = todayBills.reduce((sum, bill) => sum + bill.amountPaid, 0);
  const todayCashPaid = todayBills.filter(b => b.paymentMode === 'Cash' || !b.paymentMode).reduce((sum, b) => sum + b.amountPaid, 0);
  const todayOnlinePaid = todayBills.filter(b => b.paymentMode === 'Online').reduce((sum, b) => sum + b.amountPaid, 0);
  const todayPendingAmount = todayBills.reduce((sum, bill) => sum + bill.pendingAmount, 0);

  // Today's Appointments
  const todayAppointments = appointments.filter(a => a.date === todayDate);

  // Total pending amount from all bills
  const totalPendingAmount = pendingBills.reduce((sum, bill) => sum + bill.pendingAmount, 0);

  // This month's statistics
  const currentMonthStart = startOfMonth(new Date());
  const currentMonthEnd = endOfMonth(new Date());

  // Get visits for this month
  const thisMonthVisits = visits.filter((v) => {
    const visitDate = new Date(v.date);
    return isWithinInterval(visitDate, { start: currentMonthStart, end: currentMonthEnd });
  });

  // Patients with at least 1 visit this month
  const uniquePatientIdsWithVisitsThisMonth = new Set(thisMonthVisits.map((v) => v.patientId));

  // Filter patients for search
  const filteredPatients = patients.filter(
    (patient) =>
      patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.phone.includes(searchQuery)
  );

  // New patients this month = Patients registered this month
  // (Registration is their first visit, so they are "new" patients)
  const newPatientsThisMonth = patients.filter((p) => {
    const regDate = new Date(p.registrationDate);
    return isWithinInterval(regDate, { start: currentMonthStart, end: currentMonthEnd });
  });

  // Repeat visit patients this month = Patients registered BEFORE this month who have a visit THIS month
  // (They are returning/follow-up patients)
  const repeatPatientsThisMonth = patients.filter((p) => {
    const regDate = new Date(p.registrationDate);
    const wasRegisteredBeforeThisMonth = regDate < currentMonthStart;
    const hasVisitThisMonth = uniquePatientIdsWithVisitsThisMonth.has(p.id);
    return wasRegisteredBeforeThisMonth && hasVisitThisMonth;
  });
  const repeatVisitPatientsCount = repeatPatientsThisMonth.length;

  // Get displayed patients based on filter
  const getDisplayedPatients = () => {
    let basePatients = filteredPatients;

    if (patientFilter === "new") {
      basePatients = newPatientsThisMonth.filter(
        (patient) =>
          patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          patient.phone.includes(searchQuery)
      );
    } else if (patientFilter === "repeat") {
      basePatients = repeatPatientsThisMonth
        .filter(
          (patient) =>
            patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            patient.phone.includes(searchQuery)
        )
        // Sort by last visit date (most recent first)
        .sort((a, b) => {
          const aVisits = visits.filter((v) => v.patientId === a.id);
          const bVisits = visits.filter((v) => v.patientId === b.id);
          const aLastVisit = aVisits.length > 0 ? Math.max(...aVisits.map(v => new Date(v.date).getTime())) : 0;
          const bLastVisit = bVisits.length > 0 ? Math.max(...bVisits.map(v => new Date(v.date).getTime())) : 0;
          return bLastVisit - aLastVisit; // Most recent first
        });
    }

    return basePatients;
  };

  const { user } = useAuth();
  const displayedPatients = getDisplayedPatients();

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Overview of your clinic's activity and patient records
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Patients
            </CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-patients">
              {patientsLoading ? <Skeleton className="h-8 w-16" /> : patients.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Registered in system
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Today's Patients
            </CardTitle>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-today-patients">
              {patientsLoading ? <Skeleton className="h-8 w-16" /> : todayPatients.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {format(new Date(), "dd MMM yyyy")}
            </p>
          </CardContent>
        </Card>

        {user?.role === 'admin' && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Today's Paid
                </CardTitle>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600" data-testid="text-today-paid">
                  {patientsLoading ? <Skeleton className="h-8 w-20" /> : `₹${todayPaidRevenue.toLocaleString()}`}
                </div>
                <div className="flex gap-4 mt-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Cash</span>
                    <span className="text-sm font-medium text-green-700">₹{todayCashPaid.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col border-l pl-4">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Online</span>
                    <span className="text-sm font-medium text-blue-700">₹{todayOnlinePaid.toLocaleString()}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Amount received today
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Today's Pending
                </CardTitle>
                <AlertCircle className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive" data-testid="text-today-pending">
                  {patientsLoading ? <Skeleton className="h-8 w-20" /> : `₹${todayPendingAmount.toLocaleString()}`}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Pending from today's bills
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              New Patients This Month
            </CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600" data-testid="text-monthly-unique-patients">
              {patientsLoading ? <Skeleton className="h-8 w-16" /> : newPatientsThisMonth.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              First-time registrations ({format(currentMonthStart, "MMM yyyy")})
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Repeat Visit Patients
            </CardTitle>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600" data-testid="text-repeat-visit-patients">
              {patientsLoading ? <Skeleton className="h-8 w-16" /> : repeatVisitPatientsCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Follow-up visits this month
            </p>
          </CardContent>
        </Card>

        {user?.role === 'admin' && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Card className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Bills with Pending
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      <AlertCircle className="w-4 h-4 text-muted-foreground" />
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-destructive" data-testid="text-pending-payments">
                      {patientsLoading ? <Skeleton className="h-8 w-16" /> : pendingBills.length}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Click to view all pending bills
                    </p>
                  </CardContent>
                </Card>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0 max-h-96 overflow-hidden" align="start">
                <div className="p-3 border-b bg-muted/50">
                  <h4 className="font-semibold text-sm">Pending Bills ({pendingBills.length})</h4>
                  <p className="text-xs text-muted-foreground">Click on a bill to view details</p>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {pendingBills.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No pending bills
                    </div>
                  ) : (
                    pendingBills
                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                      .map((bill) => (
                        <div
                          key={bill.id}
                          className="flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer border-b last:border-b-0 transition-colors"
                          onClick={() => setSelectedBillForDetails(bill)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
                              <Receipt className="w-4 h-4 text-destructive" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{bill.patientName}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(bill.date), "dd MMM yyyy")}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-destructive text-sm">
                              ₹{bill.pendingAmount.toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              of ₹{bill.finalAmount.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </PopoverContent>
            </Popover>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Pending Amount
                </CardTitle>
                <AlertCircle className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive" data-testid="text-total-pending-amount">
                  {patientsLoading ? <Skeleton className="h-8 w-20" /> : `₹${totalPendingAmount.toLocaleString()}`}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Outstanding balance from all bills
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {todayPatients.length > 0 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Today's Patients ({todayPatients.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Patients registered or visited today - {format(new Date(), "dd MMMM yyyy")}
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {todayPatients.map((patient) => {
                const patientTodayBills = bills.filter(
                  (b) =>
                    b.patientId === patient.id &&
                    b.date === todayDate
                );
                const patientTodayVisits = visits.filter(
                  (v) =>
                    v.patientId === patient.id &&
                    v.date === todayDate
                );
                const todayTotal = patientTodayBills.reduce((sum, b) => sum + b.grandTotal, 0);
                const todayPaid = patientTodayBills.reduce((sum, b) => sum + b.amountPaid, 0);
                const todayPending = patientTodayBills.reduce((sum, b) => sum + b.pendingAmount, 0);

                return (
                  <div
                    key={patient.id}
                    className="group relative p-4 rounded-lg border bg-gradient-to-r from-blue-50 to-cyan-50 hover:shadow-md transition-all"
                  >
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setLocation(`/patient/${patient.id}`)}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white font-medium">
                          {patient.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-lg group-hover:text-blue-700 transition-colors">{patient.name}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <Phone className="w-3 h-3" />
                            {patient.phone}
                          </div>
                          {patientTodayVisits.length > 0 && (
                            <div className="text-xs text-blue-600 mt-1">
                              Visit: {patientTodayVisits[0].diagnosis}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="space-y-1">
                            {patientTodayVisits.length > 0 && (
                              <div className="text-sm">
                                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                  Visit({patientTodayVisits.length})
                                </Badge>
                              </div>
                            )}
                            {patientTodayBills.length > 0 ? (
                              <div className="text-sm">
                                <span className="text-muted-foreground">Bills:</span>{" "}
                                <span className="font-semibold">{patientTodayBills.length}</span>
                              </div>
                            ) : null}
                            {user?.role === 'admin' && patientTodayBills.length > 0 && (
                              <div className="text-sm">
                                <span className="text-green-600 font-semibold">₹{todayPaid.toLocaleString()}</span>
                                {todayPending > 0 && (
                                  <span className="text-red-600 font-semibold ml-2">
                                    Pending: ₹{todayPending.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 z-10">
                          {user?.role === 'admin' && (
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-white h-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                sessionStorage.setItem("preselectedPatientId", patient.id);
                                setLocation("/billing");
                              }}
                            >
                              Create Bill
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 bg-blue-100 text-blue-700 hover:bg-blue-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPatientForAppointment(patient);
                            }}
                          >
                            Assign Upcoming Visit
                          </Button>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle className="text-lg font-medium">All Patients</CardTitle>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by name or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-patient-search"
                />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setPatientFilter("all")}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${patientFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
                  }`}
              >
                All ({filteredPatients.length})
              </button>
              <button
                onClick={() => setPatientFilter("new")}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${patientFilter === "new"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  }`}
              >
                New This Month ({newPatientsThisMonth.length})
              </button>
              <button
                onClick={() => setPatientFilter("repeat")}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${patientFilter === "repeat"
                  ? "bg-purple-600 text-white"
                  : "bg-purple-100 text-purple-700 hover:bg-purple-200"
                  }`}
              >
                Repeat Visits ({repeatPatientsThisMonth.length})
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {patientsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : displayedPatients.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-1">No patients found</h3>
              <p className="text-muted-foreground text-sm">
                {searchQuery
                  ? "Try adjusting your search"
                  : "Register your first patient to get started"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayedPatients.map((patient) => {
                const patientBills = bills.filter((b) => b.patientId === patient.id);
                const hasPending = patientBills.some((b) => b.pendingAmount > 0);

                // Get last visit date for this patient
                const patientVisits = visits.filter((v) => v.patientId === patient.id);
                const lastVisit = patientVisits.length > 0
                  ? patientVisits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                  : null;

                return (
                  <Link
                    key={patient.id}
                    href={`/patient/${patient.id}`}
                    className="block"
                  >
                    <div
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover-elevate cursor-pointer transition-all"
                      data-testid={`card-patient-${patient.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-medium">
                          {patient.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium" data-testid={`text-patient-name-${patient.id}`}>
                              {patient.name}
                            </span>
                            {hasPending && (
                              <Badge variant="destructive" className="text-xs">
                                Pending
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                            <Phone className="w-3 h-3" />
                            <span data-testid={`text-patient-phone-${patient.id}`}>
                              {patient.phone}
                            </span>
                            <span className="text-border">|</span>
                            <span>
                              Registered: {format(new Date(patient.registrationDate), "dd MMM yyyy")}
                            </span>
                            {lastVisit && (
                              <>
                                <span className="text-border">|</span>
                                <span>
                                  Last Visit: {format(new Date(lastVisit.date), "dd MMM yyyy")}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedPatientForAppointment} onOpenChange={(open) => !open && setSelectedPatientForAppointment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Upcoming Visit</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => createAppointmentMutation.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="patientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Patient</FormLabel>
                    <FormControl>
                      <Input value={selectedPatientForAppointment?.name || ""} disabled readOnly />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for Visit</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Follow-up" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setSelectedPatientForAppointment(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createAppointmentMutation.isPending}>
                  {createAppointmentMutation.isPending ? "Assigning..." : "Assign Visit"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Bill Details Dialog */}
      <Dialog open={!!selectedBillForDetails} onOpenChange={(open) => !open && setSelectedBillForDetails(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Bill Details
            </DialogTitle>
          </DialogHeader>
          {selectedBillForDetails && (
            <div className="space-y-4">
              {/* Patient Info */}
              <div className="bg-muted/50 p-4 rounded-lg">
                <h4 className="font-semibold text-lg">{selectedBillForDetails.patientName}</h4>
                <p className="text-sm text-muted-foreground">
                  Bill Date: {format(new Date(selectedBillForDetails.date), "dd MMM yyyy")}
                </p>
              </div>

              {/* Treatments */}
              {selectedBillForDetails.treatments.length > 0 && (
                <div>
                  <h5 className="font-medium text-sm mb-2">Treatments</h5>
                  <div className="space-y-1">
                    {selectedBillForDetails.treatments.map((t, i) => (
                      <div key={i} className="flex justify-between text-sm py-1 border-b last:border-b-0">
                        <span>{t.treatmentName}</span>
                        <span className="font-medium">₹{t.price.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Medicines */}
              {selectedBillForDetails.medicines.length > 0 && (
                <div>
                  <h5 className="font-medium text-sm mb-2">Medicines</h5>
                  <div className="space-y-1">
                    {selectedBillForDetails.medicines.map((m, i) => (
                      <div key={i} className="flex justify-between text-sm py-1 border-b last:border-b-0">
                        <span>{m.medicineName} × {m.quantity}</span>
                        <span className="font-medium">₹{m.total.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Summary */}
              <div className="bg-muted/30 p-4 rounded-lg space-y-2 border">
                <div className="flex justify-between text-sm">
                  <span>Final Amount:</span>
                  <span className="font-semibold">₹{selectedBillForDetails.finalAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-green-600">
                  <span>Amount Paid:</span>
                  <span className="font-semibold">₹{selectedBillForDetails.amountPaid.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-destructive border-t pt-2">
                  <span className="font-semibold">Pending Amount:</span>
                  <span className="font-bold">₹{selectedBillForDetails.pendingAmount.toLocaleString()}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setSelectedBillForDetails(null);
                    setLocation("/billing");
                  }}
                >
                  Go to Bills Page
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    setSelectedBillForDetails(null);
                    setLocation(`/patient/${selectedBillForDetails.patientId}`);
                  }}
                >
                  View Patient Profile
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
