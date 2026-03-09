import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Trash2, Maximize2, Loader2, Image as ImageIcon, Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface VisitPhotoUploadProps {
    visitId: string;
    initialPhotoFileIds?: string[];     // NEW: array of photo IDs
    initialPhotoUrls?: string[];        // NEW: pre-resolved URLs
    initialPhotoFileId?: string | null; // legacy compat
    initialPhotoUrl?: string | null;    // legacy compat
    onUploadSuccess: (fileId: string) => void;
    compact?: boolean;
}

interface PhotoEntry {
    fileId: string;
    url: string | null;
    loading: boolean;
}

export const VisitPhotoUpload: React.FC<VisitPhotoUploadProps> = ({
    visitId,
    initialPhotoFileIds,
    initialPhotoUrls,
    initialPhotoFileId,
    initialPhotoUrl,
    onUploadSuccess,
    compact = false,
}) => {
    const [isUploading, setIsUploading] = useState(false);
    const [photos, setPhotos] = useState<PhotoEntry[]>([]);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const { toast } = useToast();

    // Build initial photos list from props
    useEffect(() => {
        // Prefer the new array props; fall back to legacy single props
        const fileIds: string[] = initialPhotoFileIds?.length
            ? initialPhotoFileIds
            : initialPhotoFileId
                ? [initialPhotoFileId]
                : [];

        const urls: (string | null)[] = initialPhotoUrls?.length
            ? initialPhotoUrls
            : initialPhotoUrl
                ? [initialPhotoUrl]
                : [];

        if (fileIds.length === 0) {
            setPhotos([]);
            return;
        }

        const entries: PhotoEntry[] = fileIds.map((id, i) => ({
            fileId: id,
            url: urls[i] ?? null,
            loading: !urls[i],
        }));

        setPhotos(entries);

        // Fetch URLs for entries that don't have one yet
        entries.forEach((entry, i) => {
            if (!entry.url) {
                fetchSignedUrl(entry.fileId, i);
            }
        });
    }, [
        // stringify arrays for stable comparison
        JSON.stringify(initialPhotoFileIds),
        JSON.stringify(initialPhotoUrls),
        initialPhotoFileId,
        initialPhotoUrl,
        visitId,
    ]);

    const fetchSignedUrl = async (fileId: string, index: number) => {
        try {
            const response = await fetch(`/api/visits/${visitId}/photo-url?fileId=${fileId}`);
            if (response.ok) {
                const data = await response.json();
                setPhotos(prev =>
                    prev.map((p, i) => i === index ? { ...p, url: data.url, loading: false } : p)
                );
            } else {
                setPhotos(prev =>
                    prev.map((p, i) => i === index ? { ...p, loading: false } : p)
                );
            }
        } catch {
            setPhotos(prev =>
                prev.map((p, i) => i === index ? { ...p, loading: false } : p)
            );
        }
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const allowedTypes = ["image/jpeg", "image/png", "image/heif", "image/heic", "image/webp"];
        if (!allowedTypes.includes(file.type)) {
            toast({ title: "Invalid file type", description: "Upload JPEG, PNG, or HEIF.", variant: "destructive" });
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            toast({ title: "File too large", description: "Max size is 5MB.", variant: "destructive" });
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
            // Append the new photo to our local list
            setPhotos(prev => [...prev, { fileId: data.fileId, url: data.url ?? null, loading: false }]);
            onUploadSuccess(data.fileId);
            toast({ title: "Photo attached", description: "Image uploaded successfully." });
        } catch {
            toast({ title: "Upload failed", description: "Error uploading the photo.", variant: "destructive" });
        } finally {
            setIsUploading(false);
            // Reset input so same file can be reselected
            event.target.value = "";
        }
    };

    const handleDeletePhoto = async (fileId: string) => {
        if (!confirm("Remove this photo?")) return;

        try {
            const response = await fetch(`/api/visits/${visitId}/photo?fileId=${encodeURIComponent(fileId)}`, {
                method: "DELETE",
            });
            if (!response.ok) throw new Error("Delete failed");
            setPhotos(prev => prev.filter(p => p.fileId !== fileId));
            onUploadSuccess(""); // notify parent
            toast({ title: "Removed", description: "Photo deleted." });
        } catch {
            toast({ title: "Error", description: "Could not delete photo.", variant: "destructive" });
        }
    };

    return (
        <div className={cn(
            "flex flex-col gap-3 rounded-xl border bg-white/50 backdrop-blur-sm p-3 transition-all duration-300",
            photos.length > 0 ? "border-primary/20 shadow-sm" : "border-dashed"
        )}>
            {/* Header */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                        <Camera className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Visit Clinical Photos
                        {photos.length > 0 && (
                            <span className="ml-2 bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-bold">
                                {photos.length}
                            </span>
                        )}
                    </span>
                </div>
            </div>

            {/* Photo Strip or Empty State */}
            {photos.length === 0 ? (
                <div className="flex items-center gap-4">
                    <div className="h-24 w-24 rounded-lg border-2 border-dashed bg-slate-50 flex flex-col items-center justify-center gap-1 shrink-0">
                        <ImageIcon className="h-5 w-5 text-slate-300" />
                        <span className="text-[10px] text-slate-400 font-medium">No Photo</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight">
                        Capture or upload a photo to document the patient's condition for this visit.
                    </p>
                </div>
            ) : (
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    <AnimatePresence>
                        {photos.map((photo, idx) => (
                            <motion.div
                                key={photo.fileId}
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                className="group relative h-24 w-24 rounded-lg overflow-hidden border shadow-sm bg-slate-200 cursor-pointer shrink-0"
                                onClick={() => photo.url && setLightboxUrl(photo.url)}
                            >
                                {photo.loading ? (
                                    <div className="h-full w-full flex items-center justify-center bg-slate-100">
                                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                    </div>
                                ) : photo.url ? (
                                    <img
                                        src={photo.url}
                                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        alt={`Photo ${idx + 1}`}
                                        crossOrigin="anonymous"
                                    />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center bg-slate-100">
                                        <ImageIcon className="h-5 w-5 text-slate-300" />
                                    </div>
                                )}

                                {/* Hover overlay */}
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                    <Maximize2 className="h-4 w-4 text-white" />
                                </div>

                                {/* Delete button */}
                                <button
                                    className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 z-10"
                                    onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo.fileId); }}
                                >
                                    <X className="h-3 w-3" />
                                </button>

                                {/* Photo index badge */}
                                <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                    #{idx + 1}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {/* Upload buttons */}
            <div className="flex gap-2 flex-wrap">
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
                {photos.length > 0 && (
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 ml-1">
                        <Plus className="h-3 w-3" /> Add more photos
                    </span>
                )}
            </div>

            {/* Lightbox */}
            <Dialog open={!!lightboxUrl} onOpenChange={(open) => !open && setLightboxUrl(null)}>
                <DialogContent className="max-w-[95vw] sm:max-w-3xl p-0 overflow-hidden bg-black border-none rounded-2xl shadow-2xl">
                    <DialogHeader className="absolute top-4 left-4 z-50 bg-black/40 backdrop-blur-md rounded-full px-4 py-1.5 pointer-events-none border border-white/10">
                        <DialogTitle className="text-sm font-medium text-white/90">Clinical Observation</DialogTitle>
                    </DialogHeader>
                    <div className="relative aspect-auto max-h-[85vh] flex items-center justify-center bg-black">
                        {lightboxUrl && (
                            <img
                                src={lightboxUrl}
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
