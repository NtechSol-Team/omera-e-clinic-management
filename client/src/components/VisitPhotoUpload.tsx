import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Trash2, Maximize2, Loader2, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface VisitPhotoUploadProps {
    visitId: string;
    initialPhotoFileId?: string | null;
    initialPhotoUrl?: string | null;
    onUploadSuccess: (fileId: string) => void;
    compact?: boolean;
}

export const VisitPhotoUpload: React.FC<VisitPhotoUploadProps> = ({
    visitId,
    initialPhotoFileId,
    initialPhotoUrl,
    onUploadSuccess,
    compact = false,
}) => {
    const [isUploading, setIsUploading] = useState(false);
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [isLoadingUrl, setIsLoadingUrl] = useState(false);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const { toast } = useToast();

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const allowedTypes = ["image/jpeg", "image/png", "image/heif", "image/heic"];
        if (!allowedTypes.includes(file.type)) {
            toast({
                title: "Invalid file type",
                description: "Upload JPEG, PNG, or HEIF.",
                variant: "destructive",
            });
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            toast({
                title: "File too large",
                description: "Max size is 5MB.",
                variant: "destructive",
            });
            return;
        }

        const formData = new FormData();
        formData.append("photo", file);

        setIsUploading(true);
        try {
            const response = await fetch(`/api/visits/${visitId}/photo`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) throw new Error("Upload failed");

            const data = await response.json();
            onUploadSuccess(data.fileId);
            if (data.url) setPhotoUrl(data.url);

            toast({ title: "Photo attached", description: "Image uploaded successfully." });
        } catch (error) {
            toast({
                title: "Upload failed",
                description: "Error uploading the photo.",
                variant: "destructive",
            });
        } finally {
            setIsUploading(false);
        }
    };

    const fetchPhotoUrl = async () => {
        setIsLoadingUrl(true);
        try {
            const response = await fetch(`/api/visits/${visitId}/photo-url`);
            if (response.ok) {
                const data = await response.json();
                setPhotoUrl(data.url);
            }
        } catch (error) {
            setPhotoUrl(null);
        } finally {
            setIsLoadingUrl(false);
        }
    };

    const handleDeletePhoto = async () => {
        if (!confirm("Remove this photo?")) return;

        try {
            const response = await fetch(`/api/visits/${visitId}/photo`, { method: "DELETE" });
            if (!response.ok) throw new Error("Delete failed");

            setPhotoUrl(null);
            onUploadSuccess("");
            toast({ title: "Removed", description: "Photo has been deleted." });
        } catch (error) {
            toast({ title: "Error", description: "Could not delete photo.", variant: "destructive" });
        }
    };

    useEffect(() => {
        if (initialPhotoUrl) {
            setPhotoUrl(initialPhotoUrl);
            setIsLoadingUrl(false);
        } else if (initialPhotoFileId) {
            fetchPhotoUrl();
        } else {
            setPhotoUrl(null);
        }
    }, [initialPhotoFileId, initialPhotoUrl, visitId]);

    return (
        <div className={cn(
            "flex flex-col gap-3 rounded-xl border bg-white/50 backdrop-blur-sm p-3 transition-all duration-300",
            photoUrl ? "border-primary/20 shadow-sm" : "border-dashed"
        )}>
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                        <Camera className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Visit Clinical Photo</span>
                </div>

                {photoUrl && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={handleDeletePhoto}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>

            <div className="flex items-start gap-4">
                <AnimatePresence mode="wait">
                    {isLoadingUrl ? (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="h-24 w-24 rounded-lg bg-slate-100 flex items-center justify-center animate-pulse"
                        >
                            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        </motion.div>
                    ) : photoUrl ? (
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className="group relative h-24 w-24 rounded-lg overflow-hidden border shadow-sm bg-slate-200 cursor-pointer"
                            onClick={() => setIsLightboxOpen(true)}
                        >
                            <img
                                src={photoUrl}
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                                alt="Preview"
                                crossOrigin="anonymous"
                            />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Maximize2 className="h-5 w-5 text-white" />
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="h-24 w-24 rounded-lg border-2 border-dashed bg-slate-50 flex flex-col items-center justify-center gap-1"
                        >
                            <ImageIcon className="h-5 w-5 text-slate-300" />
                            <span className="text-[10px] text-slate-400 font-medium">No Photo</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex-1 flex flex-col justify-center gap-2 pt-1">
                    <p className="text-[11px] text-slate-500 leading-tight">
                        {photoUrl
                            ? "Documented clinical findings with clear imagery. Tap to enlarge."
                            : "Capture or upload a photo to document the patient's condition for this visit."}
                    </p>
                    <div className="flex gap-2 mt-1">
                        <div className="relative group">
                            <input
                                type="file" accept="image/*" capture="environment"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                onChange={handleFileChange} disabled={isUploading}
                            />
                            <Button variant="outline" size="sm" className="h-8 text-[11px] font-medium border-primary/20 hover:bg-primary/5">
                                {isUploading ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Camera className="h-3 w-3 mr-2 text-primary" />}
                                Camera
                            </Button>
                        </div>
                        <div className="relative group">
                            <input
                                type="file" accept="image/*"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                onChange={handleFileChange} disabled={isUploading}
                            />
                            <Button variant="outline" size="sm" className="h-8 text-[11px] font-medium border-slate-200">
                                <Upload className="h-3 w-3 mr-2" />
                                Gallery
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
                <DialogContent className="max-w-[95vw] sm:max-w-3xl p-0 overflow-hidden bg-black border-none rounded-2xl shadow-2xl">
                    <DialogHeader className="absolute top-4 left-4 z-50 bg-black/40 backdrop-blur-md rounded-full px-4 py-1.5 pointer-events-none border border-white/10">
                        <DialogTitle className="text-sm font-medium text-white/90">Clinical Observation</DialogTitle>
                    </DialogHeader>
                    <div className="relative aspect-auto max-h-[85vh] flex items-center justify-center bg-black">
                        {photoUrl && (
                            <img
                                src={photoUrl}
                                className="max-w-full max-h-[85vh] object-contain"
                                alt="Full scale visit documentation"
                                crossOrigin="anonymous"
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
