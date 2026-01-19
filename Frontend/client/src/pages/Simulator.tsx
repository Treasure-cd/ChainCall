import React, { useState } from "react";
import { Terminal, Activity, Loader2, AlertCircle, CheckCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "../../context/WalletProvider";

interface SimulationResult {
  logs: string[];
  unitsConsumed: number;
  success: boolean;
  error?: string;
}

export default function Simulator() {
  const [txHash, setTxHash] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const { rpcUrl } = useWallet();

  const handleSimulate = async () => {
    if (!txHash) return;
    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch("https://chaincall.onrender.com/solana/tx/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rpc_url: rpcUrl || "https://api.devnet.solana.com",
          transaction_base64: txHash,
          encoding: "base64"
        })
      });

      const data = await res.json();

      setResult({
        logs: data.logs || [],
        unitsConsumed: data.units_consumed || 0,
        success: data.success,
        error: data.error
      });

    } catch (err) {
      console.error(err);
      setResult({
        logs: ["Simulation failed to connect to backend."],
        unitsConsumed: 0,
        success: false,
        error: "Network Error"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
        
        {/* Header + Input Section */}
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Transaction Simulator</h2>
            <p className="text-muted-foreground mt-1">Dry-run transactions against the current network state.</p>
          </div>

          {/* Info Banner - Wallet is optional */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-blue-600">No Wallet Required</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Paste any base64-encoded transaction to simulate it. If you build transactions using the 
                <a href="/" className="text-primary hover:underline mx-1">Auto-Magician</a> 
                or 
                <a href="/builder" className="text-primary hover:underline mx-1">Instruction Builder</a>, 
                they can automatically send signed transactions here (wallet required for signing only).
              </p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Base64 Transaction Payload</label>
              <span className="text-xs text-muted-foreground">
                Network: <span className="font-mono">{rpcUrl || "https://api.devnet.solana.com"}</span>
              </span>
            </div>
            <div className="flex gap-3">
              <input 
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder="Paste base64 transaction string here..."
                className="flex-1 bg-background border border-border rounded-md px-4 py-2 font-mono text-sm outline-none focus:ring-1 focus:ring-primary transition-all"
              />
              <button 
                onClick={handleSimulate}
                disabled={isLoading || !txHash}
                className="bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Simulate"}
              </button>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Program Logs */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Terminal className="h-5 w-5 text-primary" />
              <h3>Program Logs</h3>
            </div>
            
            {isLoading ? (
              // Loading skeleton
              <div className="bg-black border border-border rounded-lg p-4 h-[400px] space-y-2 animate-pulse">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-6 h-4 bg-muted/20 rounded" />
                    <div className="flex-1 h-4 bg-muted/20 rounded" style={{ width: `${60 + Math.random() * 30}%` }} />
                  </div>
                ))}
              </div>
            ) : result ? (
              // Real data
              <div className="bg-black border border-border rounded-lg p-4 font-mono text-xs h-[400px] overflow-y-auto">
                {result.error && (
                  <div className="text-red-400 font-bold border-b border-red-900/30 pb-2 mb-2 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" /> Error: {result.error}
                  </div>
                )}
                <div className="space-y-1.5">
                  {result.logs.length > 0 ? result.logs.map((log, i) => (
                    <div key={i} className={cn(
                      "flex gap-3",
                      log.toLowerCase().includes("success") ? "text-green-400" : 
                      log.toLowerCase().includes("consumed") ? "text-blue-400" : 
                      log.toLowerCase().includes("error") ? "text-red-400" :
                      "text-gray-300"
                    )}>
                      <span className="text-gray-700 select-none w-6 text-right">{i + 1}</span>
                      <span className="break-all">{log}</span>
                    </div>
                  )) : (
                    <div className="text-muted-foreground italic">No logs returned.</div>
                  )}
                </div>
              </div>
            ) : (
              // Empty skeleton
              <div className="bg-black border border-border/30 rounded-lg p-4 h-100 space-y-2 opacity-30">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-6 h-4 bg-muted/30 rounded" />
                    <div className="flex-1 h-4 bg-muted/30 rounded" style={{ width: `${60 + Math.random() * 30}%` }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Metrics Sidebar */}
          <div className="space-y-6">
            
            {/* Compute Units Card */}
            {isLoading ? (
              <div className="bg-card border border-border rounded-lg p-5 space-y-4 animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-muted rounded" />
                  <div className="h-4 w-32 bg-muted rounded" />
                </div>
                <div className="h-10 w-40 bg-muted rounded" />
                <div className="h-2 bg-muted rounded-full" />
                <div className="h-3 w-full bg-muted rounded" />
              </div>
            ) : result ? (
              <div className="bg-card border border-border rounded-lg p-5 space-y-4 shadow-sm">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Activity className="h-4 w-4 text-blue-500" />
                  <h4>Compute Units</h4>
                </div>
                <div className="text-3xl font-mono font-bold tracking-tighter">
                  {result.unitsConsumed.toLocaleString()}
                  <span className="text-sm font-sans text-muted-foreground font-normal ml-2">CU</span>
                </div>
                
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-500" 
                    style={{ width: `${Math.min((result.unitsConsumed / 200000) * 100, 100)}%` }} 
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {result.unitsConsumed > 0 
                    ? `${((result.unitsConsumed / 200000) * 100).toFixed(1)}% of standard budget`
                    : "No consumption data"}
                </p>
              </div>
            ) : (
              <div className="bg-card/30 border border-border/30 rounded-lg p-5 space-y-4 opacity-30">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <div className="h-4 w-32 bg-muted/50 rounded" />
                </div>
                <div className="h-10 w-40 bg-muted/50 rounded" />
                <div className="h-2 bg-muted/50 rounded-full" />
                <div className="h-3 w-full bg-muted/50 rounded" />
              </div>
            )}

            {/* Status Card */}
            {isLoading ? (
              <div className="bg-card border border-border rounded-lg p-5 space-y-3 animate-pulse border-l-4 border-l-muted">
                <div className="h-5 w-40 bg-muted rounded" />
                <div className="h-4 w-full bg-muted rounded" />
                <div className="h-4 w-3/4 bg-muted rounded" />
              </div>
            ) : result ? (
              <div className={cn(
                "bg-card border rounded-lg p-5 space-y-2 border-l-4 shadow-sm",
                result.success ? "border-l-green-500 bg-green-500/5" : "border-l-red-500 bg-red-500/5"
              )}>
                <div className="flex items-center gap-2 font-semibold">
                  {result.success ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-green-500">Transaction Succeeded</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-red-500" />
                      <span className="text-red-500">Transaction Failed</span>
                    </>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {result.success 
                    ? "This transaction would execute successfully on the current network state." 
                    : "This transaction would revert or fail on the current network state."}
                </p>
              </div>
            ) : (
              <div className="bg-card/30 border border-border/30 rounded-lg p-5 space-y-3 opacity-30 border-l-4 border-l-muted/50">
                <div className="h-5 w-40 bg-muted/50 rounded" />
                <div className="h-4 w-full bg-muted/50 rounded" />
                <div className="h-4 w-3/4 bg-muted/50 rounded" />
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}