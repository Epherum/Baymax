"use client";

import { ReactNode, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

type ModalProps = {
    open: boolean;
    onClose: () => void;
    title?: string;
    width?: number | string;
    children: ReactNode;
};

export function Modal({ open, onClose, title, width = "min(1100px, 95vw)", children }: ModalProps) {
    useEffect(() => {
        if (!open) return;
        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15, 23, 42, 0.55)",
                        backdropFilter: "blur(6px)",
                        zIndex: 40,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "1rem",
                    }}
                    onClick={onClose}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <motion.div
                        style={{
                            width,
                            maxHeight: "90vh",
                            overflow: "hidden",
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: "1rem",
                            boxShadow: "0 20px 40px rgba(15, 23, 42, 0.25)",
                            display: "flex",
                            flexDirection: "column",
                        }}
                        onClick={(e) => e.stopPropagation()}
                        initial={{ y: 28, opacity: 0.8, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 12, opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.18 }}
                    >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                            <div>
                                {title && <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{title}</h2>}
                                <div className="text-small text-muted">Press Esc to close</div>
                            </div>
                            <button className="btn btn-ghost btn-icon" aria-label="Close modal" onClick={onClose}>
                                <X size={16} />
                            </button>
                        </div>
                        <div style={{ padding: "1.25rem", overflowY: "auto" }}>{children}</div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
