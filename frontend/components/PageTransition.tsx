"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useContext, useRef } from "react";

// This is a known workaround for AnimatePresence with Next.js App Router
// to ensure the exit animation plays correctly by freezing the router context
function FrozenRouter(props: { children: React.ReactNode }) {
    const context = useContext(LayoutRouterContext);
    const frozen = useRef(context).current;

    return (
        <LayoutRouterContext.Provider value={frozen}>
            {props.children}
        </LayoutRouterContext.Provider>
    );
}

export default function PageTransition({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    // Metrics pages keep their own internal tab navigation; skip global page fade to avoid double animations.
    if (pathname?.startsWith("/metrics")) {
        return <div style={{ width: "100%", height: "100%" }}>{children}</div>;
    }

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                style={{ width: "100%", height: "100%" }}
            >
                <FrozenRouter>{children}</FrozenRouter>
            </motion.div>
        </AnimatePresence>
    );
}
