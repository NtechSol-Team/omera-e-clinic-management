import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { UserPlus, Calendar, Phone, User, FileText, Stethoscope } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { insertPatientSchema, insertVisitSchema, type InsertPatient } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { z } from "zod";

const registrationSchema = insertPatientSchema.extend({
  complaints: z.string().min(1, "Complaints are required"),
  diagnosis: z.string().min(1, "Diagnosis is required"),
});

type RegistrationForm = z.infer<typeof registrationSchema>;

export default function Registration() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      name: "",
      phone: "",
      registrationDate: format(new Date(), "yyyy-MM-dd"),
      complaints: "",
      diagnosis: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: RegistrationForm) => {
      const patientData: InsertPatient = {
        name: data.name,
        phone: data.phone,
        registrationDate: data.registrationDate,
      };

      const patientResponse = await apiRequest("POST", "/api/patients", patientData);
      const patient = await patientResponse.json();

      await apiRequest("POST", "/api/visits", {
        patientId: patient.id,
        date: data.registrationDate,
        complaints: data.complaints,
        diagnosis: data.diagnosis,
      });

      return patient;
    },
    onSuccess: (patient) => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visits"] });
      toast({
        title: "Patient Registered",
        description: `${patient.name} has been successfully registered.`,
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Registration Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: RegistrationForm) => {
    mutation.mutate(data);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
          New Patient Registration
        </h1>
        <p className="text-muted-foreground">
          Register a new patient with their initial visit details
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="w-5 h-5 text-primary" />
            Patient Information
          </CardTitle>
          <CardDescription>
            Enter the patient's personal and medical details for registration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Patient Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter full name"
                          {...field}
                          data-testid="input-patient-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        Phone Number
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter phone number"
                          type="tel"
                          {...field}
                          data-testid="input-patient-phone"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="registrationDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Registration Date
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          data-testid="input-registration-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="border-t pt-6">
                <h3 className="font-medium mb-4 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-primary" />
                  Initial Visit Details
                </h3>

                <div className="space-y-6">
                  <FormField
                    control={form.control}
                    name="complaints"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Complaints
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter patient's complaints..."
                            className="min-h-[100px] resize-none"
                            {...field}
                            data-testid="input-complaints"
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
                        <FormLabel className="flex items-center gap-2">
                          <Stethoscope className="w-4 h-4" />
                          Diagnosis
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter diagnosis..."
                            className="min-h-[100px] resize-none"
                            {...field}
                            data-testid="input-diagnosis"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/")}
                  data-testid="button-cancel"
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={mutation.isPending}
                  data-testid="button-register"
                  className="w-full sm:w-auto"
                >
                  {mutation.isPending ? "Registering..." : "Register Patient"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
