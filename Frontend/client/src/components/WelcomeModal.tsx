import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight } from "lucide-react";

export default function WelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const hasSeen = localStorage.getItem("chaincall_welcome_seen");
    if (!hasSeen) {
      const timer = setTimeout(() => setIsOpen(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem("chaincall_welcome_seen", "true");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-[#1a1b26] border border-purple-500/20 rounded-lg shadow-2xl overflow-hidden"
          >
            {/* Image Section */}
            <div className="h-40 bg-purple-900/20 relative overflow-hidden">
                <div className="absolute inset-0 bg-linear-to-b from-transparent to-[#1a1b26]" />
                <img 
                  src="/welcome-hero.avif"
                  alt="ChainCall Hero" 
                  className="w-full h-full object-cover opacity-90"
                />
                <button 
                  onClick={handleClose}
                  className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 rounded-lg text-white/70 hover:text-white transition-colors backdrop-blur-md"
                >
                  <X className="h-4 w-4" />
                </button>
            </div>

            {/* Text Content */}
            <div className="p-8 pt-2 space-y-4 text-center">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  Welcome to ChainCall
                </h2>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Your all-in-one Solana development suite. Inspect Anchor programs, build raw instructions, and simulate transactions in real-time.
                </p>
              </div>

              <div className="pt-4">
                <button 
                  onClick={handleClose}
                  className="w-full group bg-purple-600 hover:bg-purple-500 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20"
                >
                  Start Building
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}