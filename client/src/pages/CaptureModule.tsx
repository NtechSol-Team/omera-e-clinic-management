import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Search,
    User,
    Calendar,
    Camera,
    Upload,
    ChevronRight,
    ChevronLeft,
    CheckCircle2,
    Loader2,
    X,
    Image as ImageIcon,
    Phone,
    ArrowRight,
    RefreshCcw,
    Zap
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { extractPaginatedData, cn } from "@/lib/utils";
import type { Patient, Visit } from "@shared/schema";

type Step = "PATIENT_LIST" | "VISIT_LIST" | "CAPTURE_OPTIONS" | "PREVIEW" | "SUCCESS";

export default function CaptureModule() {
    const [step, setStep] = useState<Step>("PATIENT_LIST");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isCompressing, setIsCompressing] = useState(false);
    const [photosUploaded, setPhotosUploaded] = useState(0); // count per visit session

    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Fetch Patients — polls every 15s so new patients appear automatically
    const { data: patientsResponse, isLoading: patientsLoading } = useQuery({
        queryKey: ["/api/patients"],
        refetchInterval: 15_000,       // re-fetch every 15 seconds
        refetchOnWindowFocus: true,    // also re-fetch when tab becomes visible
    });
    const patients = useMemo(() => extractPaginatedData<Patient>(patientsResponse), [patientsResponse]);

    // Fetch Visits for selected patient — also polls so new visits appear
    const { data: visitsResponse, isLoading: visitsLoading } = useQuery({
        queryKey: ["/api/visits", selectedPatient?.id],
        enabled: !!selectedPatient,
        refetchInterval: 15_000,
        refetchOnWindowFocus: true,
    });
    const visits = useMemo(() => (Array.isArray(visitsResponse) ? visitsResponse : []), [visitsResponse]);

    // Upload Mutation
    const uploadMutation = useMutation({
        mutationFn: async ({ visitId, file }: { visitId: string; file: File }) => {
            const formData = new FormData();
            formData.append("photo", file);
            const response = await fetch(`/api/visits/${visitId}/photo`, {
                method: "POST",
                body: formData,
            });
            if (!response.ok) throw new Error("Upload failed");
            return response.json();
        },
        onSuccess: () => {
            setPhotosUploaded(prev => prev + 1);
            setStep("SUCCESS");
            queryClient.invalidateQueries({ queryKey: ["/api/visits", selectedPatient?.id] });
        },
        onError: (error: Error) => {
            toast({
                title: "Upload Failed",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const filteredPatients = useMemo(() => {
        if (!searchQuery) return patients;
        return patients.filter(p =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.phone.includes(searchQuery) ||
            p.id.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [patients, searchQuery]);

    const handlePatientSelect = (patient: Patient) => {
        setSelectedPatient(patient);
        setStep("VISIT_LIST");
    };

    const handleVisitSelect = (visit: Visit) => {
        setSelectedVisit(visit);
        setStep("CAPTURE_OPTIONS");
    };

    const compressImage = async (file: File): Promise<File> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    const MAX_WIDTH = 1280;
                    const MAX_HEIGHT = 1280;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext("2d");
                    ctx?.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(new File([blob], file.name, { type: "image/jpeg" }));
                        } else {
                            resolve(file);
                        }
                    }, "image/jpeg", 0.7);
                };
            };
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsCompressing(true);
        try {
            const compressed = await compressImage(file);
            setSelectedFile(compressed);
            setPreviewUrl(URL.createObjectURL(compressed));
            setStep("PREVIEW");
        } catch (err) {
            toast({ title: "Error", description: "Failed to process image.", variant: "destructive" });
        } finally {
            setIsCompressing(false);
        }
    };

    const handleUploadConfirm = () => {
        if (!selectedVisit || !selectedFile) return;
        uploadMutation.mutate({ visitId: selectedVisit.id, file: selectedFile });
    };

    const resetFlow = () => {
        setStep("PATIENT_LIST");
        setSelectedPatient(null);
        setSelectedVisit(null);
        setPreviewUrl(null);
        setSelectedFile(null);
        setSearchQuery("");
        setPhotosUploaded(0);
    };

    // Add another photo to the same visit — keeps patient & visit selected
    const addAnotherPhoto = () => {
        setPreviewUrl(null);
        setSelectedFile(null);
        setStep("CAPTURE_OPTIONS");
    };

    const goBack = () => {
        if (step === "VISIT_LIST") setStep("PATIENT_LIST");
        else if (step === "CAPTURE_OPTIONS") setStep("VISIT_LIST");
        else if (step === "PREVIEW") setStep("CAPTURE_OPTIONS");
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col max-w-md mx-auto shadow-2xl relative overflow-hidden">
            {/* Header */}
            <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-50">
                <div className="flex items-center gap-3">
                    {step !== "PATIENT_LIST" && step !== "SUCCESS" && (
                        <Button variant="ghost" size="icon" onClick={goBack} className="h-8 w-8 -ml-2">
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                    )}
                    <div>
                        <h1 className="text-sm font-bold uppercase tracking-widest text-slate-800">Visit Capture</h1>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">Omera Clinic Management</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-slate-400">ONLINE</span>
                </div>
            </header>

            {/* Stepper Indicator */}
            <div className="bg-white px-6 py-2 border-b flex items-center justify-between gap-1 overflow-x-auto">
                {["Patient", "Visit", "Record", "Confirm"].map((s, i) => {
                    const steps: Step[] = ["PATIENT_LIST", "VISIT_LIST", "CAPTURE_OPTIONS", "PREVIEW", "SUCCESS"];
                    const currentIdx = steps.indexOf(step);
                    const isActive = currentIdx >= i;
                    return (
                        <div key={s} className="flex items-center gap-1 min-w-fit">
                            <div className={cn(
                                "flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold transition-all",
                                isActive ? "bg-primary text-white scale-110 shadow-sm" : "bg-slate-100 text-slate-400"
                            )}>
                                {currentIdx > i ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
                            </div>
                            <span className={cn(
                                "text-[10px] font-bold uppercase tracking-widest",
                                isActive ? "text-slate-800" : "text-slate-300"
                            )}>{s}</span>
                            {i < 3 && <div className={cn("h-[1px] w-4 bg-slate-100 mx-1", isActive && "bg-primary/30")} />}
                        </div>
                    );
                })}
            </div>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto p-4 flex flex-col">
                <AnimatePresence mode="wait">
                    {step === "PATIENT_LIST" && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4 flex-1 flex flex-col"
                        >
                            <div className="relative group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                                <Input
                                    placeholder="Search Name, Phone or ID..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 h-14 bg-white border-slate-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-primary/20 text-base"
                                />
                            </div>

                            <div className="flex-1 space-y-3">
                                {patientsLoading ? (
                                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                        <p className="text-sm font-medium text-slate-400 italic">Accessing Patient Database...</p>
                                    </div>
                                ) : filteredPatients.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
                                        <div className="p-4 rounded-full bg-slate-50 mb-4">
                                            <Search className="h-8 w-8 text-slate-200" />
                                        </div>
                                        <p className="text-slate-400 font-medium">No patients found</p>
                                        <p className="text-[10px] text-slate-300 uppercase tracking-widest mt-1">Try another search term</p>
                                    </div>
                                ) : (
                                    filteredPatients.map((patient) => (
                                        <motion.div
                                            key={patient.id}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => handlePatientSelect(patient)}
                                            className="bg-white p-4 rounded-2xl border shadow-sm flex items-center justify-between group hover:border-primary/50 transition-all"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                                                    <span className="text-primary font-bold text-lg">{patient.name.charAt(0).toUpperCase()}</span>
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                    <p className="text-sm font-bold text-slate-800">{patient.name}</p>
                                                    <div className="flex items-center gap-3 text-[11px] font-medium text-slate-400">
                                                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {patient.phone}</span>
                                                        <span className="h-1 w-1 rounded-full bg-slate-200" />
                                                        <span>ID: {patient.id.slice(0, 8)}</span>
                                                    </div>
                                                    <p className="text-[10px] text-slate-300 font-bold uppercase tracking-tight">
                                                        Last Visit: {patient.registrationDate ? format(new Date(patient.registrationDate), "dd MMM yyyy") : "New Patient"}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                                                <ChevronRight className="h-4 w-4" />
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    )}

                    {step === "VISIT_LIST" && selectedPatient && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4"
                        >
                            <div className="bg-primary/5 border border-primary/10 p-4 rounded-3xl flex items-center gap-4 mb-2">
                                <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-white">
                                    <User className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Active Patient</p>
                                    <h2 className="text-lg font-bold text-slate-800">{selectedPatient.name}</h2>
                                </div>
                            </div>

                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] px-1">Select Visit Record</h3>

                            <div className="space-y-3">
                                {visitsLoading ? (
                                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                        <p className="text-sm font-medium text-slate-400 italic">Syncing Visits...</p>
                                    </div>
                                ) : visits.length === 0 ? (
                                    <div className="text-center py-20 bg-white rounded-3xl border border-dashed text-slate-400">
                                        No visits found for this patient.
                                    </div>
                                ) : (
                                    visits.sort((a, b) => b.visitNumber - a.visitNumber).map((visit) => (
                                        <motion.div
                                            key={visit.id}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => handleVisitSelect(visit)}
                                            className="bg-white p-4 rounded-2xl border shadow-sm flex items-center justify-between group hover:border-emerald-400/50 transition-all"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="h-12 w-12 rounded-2xl bg-slate-50 flex flex-col items-center justify-center border group-hover:bg-emerald-50 group-hover:border-emerald-100">
                                                    <span className="text-[10px] font-bold text-slate-400 group-hover:text-emerald-500 uppercase">Num</span>
                                                    <span className="text-lg font-black text-slate-800 group-hover:text-emerald-600">{visit.visitNumber}</span>
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-slate-800">{format(new Date(visit.date), "dd MMM yyyy")}</span>
                                                    </div>
                                                    <div className="flex flex-col gap-0.5 mt-0.5">
                                                        <p className="text-[10px] font-medium text-slate-400">ID: {visit.id.slice(0, 8)}</p>
                                                        <p className="text-[10px] font-medium text-slate-400">Doctor: Omera Clinic Staff</p>
                                                        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">Status: {visit.diagnosis?.slice(0, 15) || "Completed"}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={cn(
                                                    "text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter",
                                                    visit.photoFileId ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
                                                )}>
                                                    {visit.photoFileId ? "HAS PHOTO" : "PENDING"}
                                                </span>
                                                <ChevronRight className="h-4 w-4 text-slate-300" />
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    )}

                    {step === "CAPTURE_OPTIONS" && selectedVisit && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="flex-1 flex flex-col justify-center gap-6"
                        >
                            <div className="text-center space-y-2 mb-4">
                                <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-4 border-2 border-emerald-50 shadow-sm">
                                    <Zap className="h-8 w-8 fill-emerald-600" />
                                </div>
                                <h2 className="text-xl font-black text-slate-800">Attach Clinical Photo</h2>
                                <p className="text-sm font-medium text-slate-400">Clinical documentation for Visit #{selectedVisit.visitNumber}</p>
                            </div>

                            <div className="grid gap-4">
                                <div className="relative overflow-hidden group">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        onChange={handleFileChange}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-50"
                                    />
                                    <div className="bg-primary p-8 rounded-[2rem] flex flex-col items-center justify-center gap-4 text-white shadow-xl shadow-primary/20 group-active:scale-95 transition-all">
                                        <div className="h-16 w-16 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md">
                                            <Camera className="h-8 w-8" />
                                        </div>
                                        <div className="text-center">
                                            <span className="text-lg font-black block uppercase tracking-wide">Capture Photo</span>
                                            <span className="text-[10px] font-bold opacity-60 uppercase tracking-[0.2em]">Open System Camera</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="relative overflow-hidden group">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-50"
                                    />
                                    <div className="bg-white p-8 rounded-[2rem] border-2 border-slate-100 flex flex-col items-center justify-center gap-4 text-slate-700 shadow-sm group-active:scale-95 transition-all">
                                        <div className="h-16 w-16 rounded-2xl bg-slate-50 flex items-center justify-center border">
                                            <Upload className="h-8 w-8 text-slate-400" />
                                        </div>
                                        <div className="text-center">
                                            <span className="text-lg font-black block uppercase tracking-wide">Gallery Upload</span>
                                            <span className="text-[10px] font-bold opacity-40 uppercase tracking-[0.2em]">Select from Photos</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[10px] text-center text-slate-300 font-bold uppercase tracking-[0.3em] mt-4">Safe & Secure Clinical Storage</p>
                        </motion.div>
                    )}

                    {step === "PREVIEW" && previewUrl && (
                        <motion.div
                            key="step4"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="flex-1 flex flex-col"
                        >
                            <div className="flex-1 bg-black rounded-[2.5rem] overflow-hidden relative shadow-2xl border-4 border-white">
                                {isCompressing ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-white gap-4">
                                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                                        <p className="text-sm font-black uppercase tracking-widest">Optimizing Image...</p>
                                    </div>
                                ) : (
                                    <img src={previewUrl} className="h-full w-full object-cover" alt="Preview" />
                                )}
                                <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
                                    <div className="bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/20 flex items-center gap-2">
                                        <ImageIcon className="h-3 w-3 text-white" />
                                        <span className="text-[10px] font-bold text-white uppercase tracking-widest">Preview Mode</span>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => setStep("CAPTURE_OPTIONS")} className="bg-black/40 backdrop-blur-md text-white rounded-full h-10 w-10 border border-white/20">
                                        <X className="h-5 w-5" />
                                    </Button>
                                </div>
                                <div className="absolute bottom-6 left-6 right-6">
                                    <div className="bg-black/60 backdrop-blur-xl p-4 rounded-3xl border border-white/10 text-white">
                                        <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Target Document</p>
                                        <p className="font-bold text-sm">Visit #{selectedVisit?.visitNumber} — {selectedPatient?.name}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 grid gap-3">
                                <Button
                                    className="h-16 rounded-3xl text-lg font-black shadow-xl shadow-primary/20 gap-3"
                                    onClick={handleUploadConfirm}
                                    disabled={uploadMutation.isPending || isCompressing}
                                >
                                    {uploadMutation.isPending ? (
                                        <>
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            UPLOADING...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="h-6 w-6" />
                                            CONFIRM & SAVE
                                        </>
                                    )}
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="h-12 text-slate-400 font-bold uppercase tracking-widest"
                                    onClick={() => setStep("CAPTURE_OPTIONS")}
                                    disabled={uploadMutation.isPending}
                                >
                                    Retake Photo
                                </Button>
                            </div>
                        </motion.div>
                    )}

                    {step === "SUCCESS" && (
                        <motion.div
                            key="step5"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex-1 flex flex-col items-center justify-center p-6 text-center"
                        >
                            <div className="relative mb-6">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: "spring", damping: 12, stiffness: 200 }}
                                    className="h-24 w-24 bg-emerald-500 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-emerald-200 border-4 border-white"
                                >
                                    <CheckCircle2 className="h-12 w-12 text-white" />
                                </motion.div>
                                <motion.div
                                    animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
                                    transition={{ duration: 4, repeat: Infinity }}
                                    className="absolute -top-2 -right-2 h-8 w-8 bg-emerald-100 rounded-xl flex items-center justify-center border border-white shadow-sm"
                                >
                                    <Zap className="h-4 w-4 text-emerald-600 fill-emerald-600" />
                                </motion.div>
                            </div>

                            {/* Badge showing count for this visit */}
                            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-4 py-1.5 mb-4">
                                <ImageIcon className="h-3.5 w-3.5" />
                                <span className="text-xs font-bold uppercase tracking-widest">
                                    {photosUploaded} Photo{photosUploaded !== 1 ? 's' : ''} Added — Visit #{selectedVisit?.visitNumber}
                                </span>
                            </div>

                            <h2 className="text-2xl font-black text-slate-800 mb-2 leading-tight">Photo Saved!</h2>
                            <p className="text-sm font-medium text-slate-400 mb-6 max-w-[240px]">
                                Synced to <span className="font-semibold text-slate-600">{selectedPatient?.name}</span>'s visit record.
                            </p>

                            <div className="w-full space-y-3">
                                {/* Primary: add another to same visit */}
                                <Button
                                    className="w-full h-14 rounded-2xl font-black gap-3 bg-primary"
                                    onClick={addAnotherPhoto}
                                >
                                    <Camera className="h-5 w-5" />
                                    ADD ANOTHER PHOTO
                                </Button>

                                {/* Secondary: new patient/visit */}
                                <Button
                                    variant="outline"
                                    className="w-full h-12 rounded-2xl font-black text-slate-600 border-slate-200"
                                    onClick={resetFlow}
                                >
                                    <RefreshCcw className="h-4 w-4 mr-2" />
                                    NEW CAPTURE
                                </Button>

                                <Button
                                    variant="ghost"
                                    className="w-full h-10 rounded-2xl font-bold text-slate-400"
                                    onClick={() => window.location.href = "/"}
                                >
                                    BACK TO DASHBOARD
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Bottom Safe Area Padding for mobile */}
            <div className="h-8 shrink-0 pb-safe" />
        </div>
    );
}
