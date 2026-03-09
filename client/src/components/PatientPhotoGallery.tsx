import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    ImageIcon,
    Calendar,
    Maximize2,
    Columns,
    LayoutGrid,
    Loader2,
    Zap
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Visit } from "@shared/schema";

// Extend Visit type locally to include the batched photoUrls
interface VisitWithUrl extends Visit {
    photoUrl?: string;  // legacy first photo
    photoUrls?: string[]; // all photo URLs
}

interface PatientPhotoGalleryProps {
    visits: VisitWithUrl[];
}

interface PhotoItem {
    visitId: string;
    date: string;
    photoFileId: string;
    visitNumber: number;
    photoIndex: number; // index within the visit's photos
    url?: string;
}

export const PatientPhotoGallery: React.FC<PatientPhotoGalleryProps> = ({ visits }) => {
    const [viewMode, setViewMode] = useState<"grid" | "comparison">("grid");
    const [photos, setPhotos] = useState<PhotoItem[]>([]);
    const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);

    // Flatten: each photo from each visit becomes one PhotoItem
    useEffect(() => {
        const allPhotos: PhotoItem[] = [];

        visits.forEach(v => {
            const urls = v.photoUrls ?? (v.photoUrl ? [v.photoUrl] : []);
            const fileIds = v.photoFileIds ?? (v.photoFileId ? [v.photoFileId] : []);

            fileIds.forEach((fileId, idx) => {
                allPhotos.push({
                    visitId: v.id,
                    date: v.date,
                    photoFileId: fileId,
                    visitNumber: v.visitNumber,
                    photoIndex: idx,
                    url: urls[idx],
                });
            });
        });

        allPhotos.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        setPhotos(allPhotos);

        // Pre-load first and last for fast comparison view
        if (allPhotos.length > 0) {
            const first = allPhotos[0];
            const last = allPhotos[allPhotos.length - 1];
            if (first.url) new Image().src = first.url;
            if (last.url) new Image().src = last.url;
        }
    }, [visits]);

    if (photos.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                <div className="p-4 rounded-full bg-white shadow-sm mb-4">
                    <ImageIcon className="h-10 w-10 text-slate-300" />
                </div>
                <h3 className="text-lg font-semibold text-slate-600">No Photos Yet</h3>
                <p className="text-sm text-slate-400 max-w-xs text-center mt-1">
                    Upload clinical photos during patient visits to see them here in the gallery.
                </p>
            </div>
        );
    }

    const beforePhoto = photos[0];
    const afterPhoto = photos[photos.length - 1];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between bg-white p-2 rounded-xl border shadow-sm">
                <div className="flex bg-slate-100 p-1 rounded-lg">
                    <Button
                        variant={viewMode === "grid" ? "secondary" : "ghost"}
                        size="sm"
                        className={cn("h-8 px-4 rounded-md text-xs font-medium", viewMode === "grid" && "bg-white shadow-sm hover:bg-white")}
                        onClick={() => setViewMode("grid")}
                    >
                        <LayoutGrid className="h-3.5 w-3.5 mr-2" />
                        Grid View
                    </Button>
                    <Button
                        variant={viewMode === "comparison" ? "secondary" : "ghost"}
                        size="sm"
                        className={cn("h-8 px-4 rounded-md text-xs font-medium", viewMode === "comparison" && "bg-white shadow-sm hover:bg-white")}
                        onClick={() => setViewMode("comparison")}
                    >
                        <Columns className="h-3.5 w-3.5 mr-2" />
                        Comparison View
                    </Button>
                </div>
                <div className="flex items-center gap-2 px-3 text-[11px] font-bold text-emerald-500 uppercase tracking-tight">
                    <Zap className="h-3 w-3 fill-emerald-500" />
                    Ultra-Fast Loading Active
                </div>
            </div>

            <AnimatePresence mode="wait">
                {viewMode === "grid" ? (
                    <motion.div
                        key="grid"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
                    >
                        {photos.map((photo, idx) => (
                            <motion.div
                                key={photo.visitId}
                                whileHover={{ y: -4 }}
                                className="group relative aspect-[3/4] rounded-2xl overflow-hidden border bg-slate-100 cursor-pointer shadow-sm hover:shadow-md transition-all duration-300"
                                onClick={() => setSelectedPhoto(photo)}
                            >
                                {photo.url ? (
                                    <img
                                        src={photo.url}
                                        className="h-full w-full object-cover"
                                        alt={`Visit ${photo.visitNumber}`}
                                        crossOrigin="anonymous"
                                        loading={idx < 4 ? "eager" : "lazy"}
                                        decoding="async"
                                    />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center">
                                        <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                    <div className="flex items-center gap-1.5 text-white mb-1">
                                        <Calendar className="h-3 w-3" />
                                        <span className="text-[10px] font-medium">{format(new Date(photo.date), "dd MMM yyyy")}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-white uppercase tracking-wider">Visit #{photo.visitNumber}</span>
                                        <Maximize2 className="h-4 w-4 text-white" />
                                    </div>
                                </div>
                                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-white/80 backdrop-blur-sm border border-slate-100 text-[10px] font-bold text-slate-600">
                                    {idx === 0 ? "Initial" : idx === photos.length - 1 ? "Latest" : `V${photo.visitNumber}${photo.photoIndex > 0 ? ` #${photo.photoIndex + 1}` : ''}`}
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                ) : (
                    <motion.div
                        key="comparison"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="grid grid-cols-1 md:grid-cols-2 gap-6"
                    >
                        <div className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Before (Initial)</span>
                                <span className="text-xs font-medium text-slate-500">{format(new Date(beforePhoto.date), "dd MMM yyyy")}</span>
                            </div>
                            <div className="relative aspect-[3/4] rounded-3xl overflow-hidden border-4 border-white shadow-xl bg-slate-200">
                                {beforePhoto.url ? (
                                    <img
                                        src={beforePhoto.url}
                                        className="h-full w-full object-cover"
                                        alt="Before"
                                        crossOrigin="anonymous"
                                        loading="eager"
                                    />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center">
                                        <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
                                    </div>
                                )}
                                <div className="absolute bottom-4 left-4 right-4 p-3 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 text-white">
                                    <p className="text-[10px] font-medium opacity-80">First Documentation</p>
                                    <p className="text-sm font-bold">Initial Visit Condition</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                                <span className="text-xs font-bold uppercase tracking-widest text-primary/60">After (Latest)</span>
                                <span className="text-xs font-medium text-slate-500">{format(new Date(afterPhoto.date), "dd MMM yyyy")}</span>
                            </div>
                            <div className="relative aspect-[3/4] rounded-3xl overflow-hidden border-4 border-primary/20 shadow-xl bg-slate-200 ring-4 ring-primary/5">
                                {afterPhoto.url ? (
                                    <img
                                        src={afterPhoto.url}
                                        className="h-full w-full object-cover"
                                        alt="After"
                                        crossOrigin="anonymous"
                                        loading="eager"
                                    />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center">
                                        <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
                                    </div>
                                )}
                                <div className="absolute bottom-4 left-4 right-4 p-3 rounded-2xl bg-primary/40 backdrop-blur-md border border-white/10 text-white">
                                    <p className="text-[10px] font-medium opacity-80">Latest Progress Check</p>
                                    <p className="text-sm font-bold">Current Condition</p>
                                </div>
                            </div>
                        </div>

                        {photos.length > 2 && (
                            <div className="md:col-span-2 mt-4 p-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center gap-6">
                                <div className="text-center">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Duration</p>
                                    <p className="text-lg font-bold text-primary">
                                        {Math.floor((new Date(afterPhoto.date).getTime() - new Date(beforePhoto.date).getTime()) / (1000 * 60 * 60 * 24))} Days
                                    </p>
                                </div>
                                <div className="h-8 w-[1px] bg-slate-200" />
                                <div className="text-center">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Interval</p>
                                    <p className="text-lg font-bold text-primary">{photos.length} Visits</p>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Lightbox for individual view */}
            <Dialog open={!!selectedPhoto} onOpenChange={(open) => !open && setSelectedPhoto(null)}>
                <DialogContent className="max-w-[95vw] sm:max-w-4xl p-0 overflow-hidden bg-black border-none rounded-2xl shadow-2xl">
                    <DialogHeader className="absolute top-4 left-4 z-50 bg-black/40 backdrop-blur-md rounded-full px-5 py-2 border border-white/10 flex flex-row items-center gap-3">
                        <ImageIcon className="h-4 w-4 text-white" />
                        <div>
                            <DialogTitle className="text-xs font-bold text-white uppercase tracking-widest">
                                Clinical Record V{selectedPhoto?.visitNumber}
                            </DialogTitle>
                            <p className="text-[10px] text-white/60">
                                {selectedPhoto && format(new Date(selectedPhoto.date), "dd MMMM yyyy")}
                            </p>
                        </div>
                    </DialogHeader>
                    <div className="relative aspect-auto max-h-[90vh] flex items-center justify-center bg-black">
                        {selectedPhoto && selectedPhoto.url && (
                            <img
                                src={selectedPhoto.url}
                                className="max-w-full max-h-[90vh] object-contain"
                                alt="Observation"
                                crossOrigin="anonymous"
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
