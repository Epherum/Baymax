"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, BarChart2, Target, Settings, Archive, PenLine, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

const MotionLink = motion.create(Link);

const navItems = [
    { href: "/capture", label: "Capture", icon: PenLine },
    { href: "/dump", label: "Life Dump", icon: Archive },
    { href: "/reflections", label: "Reflections", icon: BarChart2 },
    { href: "/goals", label: "Goals", icon: Target },
    { href: "/metrics", label: "Metrics", icon: BarChart2 },
    { href: "/pillars", label: "Pillars", icon: Shield },
    { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();
    const [isHovered, setIsHovered] = useState(false);

    return (
        <>
            <AnimatePresence>
                {isHovered && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.5 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: "black",
                            zIndex: 40,
                            pointerEvents: "none",
                        }}
                    />
                )}
            </AnimatePresence>
            <motion.aside
                className="sidebar"
                initial={{ width: "70px" }}
                animate={{ width: isHovered ? "240px" : "70px" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                onHoverStart={() => setIsHovered(true)}
                onHoverEnd={() => setIsHovered(false)}
                style={{
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    padding: "1rem 0.75rem", // Reduced padding to fit 70px better
                    borderRight: "1px solid var(--border)",
                    background: "var(--sidebar-background)",
                    height: "100vh",
                    display: "flex",
                    flexDirection: "column",
                    position: "fixed",
                    left: 0,
                    top: 0,
                    zIndex: 50,
                }}
            >
                <div style={{ marginBottom: "2rem", display: "flex", alignItems: "center", height: "40px", paddingLeft: "0.5rem" }}>
                    <div style={{ minWidth: "30px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{
                            width: "32px",
                            height: "32px",
                            background: "var(--foreground)",
                            color: "var(--background)",
                            borderRadius: "8px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: "bold",
                            fontSize: "1.2rem"
                        }}>
                            B
                        </div>
                    </div>
                    <motion.div
                        animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -10 }}
                        transition={{ duration: 0.2 }}
                        style={{ marginLeft: "1rem" }}
                    >
                        <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>Baymax</span>
                    </motion.div>
                </div>

                <nav style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || (item.href === "/capture" && pathname === "/");
                        const Icon = item.icon;

                        return (
                            <MotionLink
                                key={item.href}
                                href={item.href}
                                className={`btn ${isActive ? "btn-primary" : "btn-ghost"}`}
                                whileHover={{ scale: 1.02, x: 4 }}
                                whileTap={{ scale: 0.98 }}
                                style={{
                                    justifyContent: "flex-start",
                                    width: "100%",
                                    padding: "0.75rem",
                                    overflow: "hidden",
                                    height: "44px"
                                }}
                            >
                                <div style={{ minWidth: "24px", display: "flex", justifyContent: "center", alignItems: "center" }}>
                                    <Icon size={20} />
                                </div>
                                <motion.span
                                    animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -10 }}
                                    transition={{ duration: 0.2 }}
                                    style={{ marginLeft: "1rem" }}
                                >
                                    {item.label}
                                </motion.span>
                            </MotionLink>
                        );
                    })}
                </nav>
            </motion.aside>
        </>
    );
}
