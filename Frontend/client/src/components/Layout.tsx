import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { 
  Binary, 
  TerminalSquare, 
  Zap,
  Wallet,
  Globe,
  Box,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "../../context/WalletProvider";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
  
interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { 
    isConnected, 
    walletAddress, 
    connectWallet, 
    disconnectWallet, 
    isLoading, 
    hasAnyWallet,
    network,
    switchNetwork,
    rpcUrl,
    setRpcUrl
  } = useWallet();

  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isDragging, setIsDragging] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const MIN_WIDTH = 200;
  const MAX_WIDTH = 400;
  const COLLAPSE_THRESHOLD = 180;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const newWidth = e.clientX;

      if (newWidth < COLLAPSE_THRESHOLD) {
        setIsCollapsed(true);
        setSidebarWidth(0);
      } else {
        setIsCollapsed(false);
        const constrainedWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH));
        setSidebarWidth(constrainedWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
    };
  }, [isDragging]);

  const toggleSidebar = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setSidebarWidth(MIN_WIDTH);
    } else {
      setIsCollapsed(true);
      setSidebarWidth(0);
    }
  };

  const navItems = [
    { href: "/", label: "Anchor Auto-Magician", icon: Zap },
    { href: "/builder", label: "Instruction Builder", icon: Binary },
    { href: "/simulator", label: "Transaction Simulator", icon: TerminalSquare },
  ];

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      <aside 
        className={cn(
          "border-r border-border bg-card/50 backdrop-blur-xl flex flex-col shrink-0 relative",
          !isDragging && "transition-all duration-300 ease-in-out"
        )}
        style={{ 
          width: isCollapsed ? 0 : sidebarWidth,
          opacity: isCollapsed ? 0 : 1,
          visibility: isCollapsed ? 'hidden' : 'visible'
        }}
      >
        <div className="h-16 p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Box className="h-6 w-6" />
            <h1 className="font-bold text-lg tracking-tight">ChainCall</h1>
          </div>
          <button
            onClick={toggleSidebar}
            className="p-1.5 hover:bg-accent rounded-md transition-colors"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
                    isActive 
                      ? "bg-primary/10 text-primary shadow-sm" 
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </a>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Network
            </p>
            
            <div className="relative group">
              <select
                value={network}
                onChange={(e) => switchNetwork(e.target.value as WalletAdapterNetwork)}
                className="w-full appearance-none bg-accent/20 hover:bg-accent/40 border border-border text-foreground text-sm rounded-lg pl-9 pr-8 py-2.5 transition-colors cursor-pointer outline-none focus:border-primary/50"
              >
                <option value={WalletAdapterNetwork.Devnet}>Devnet</option>
                <option value={WalletAdapterNetwork.Mainnet}>Mainnet</option>
              </select>
              
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <div className={cn(
                  "w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]",
                  network === WalletAdapterNetwork.Mainnet ? "bg-purple-500 shadow-purple-500/50" : "bg-green-500 shadow-green-500/50"
                )} />
              </div>

              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                <div className="border-t-4 border-t-muted-foreground border-x-4 border-x-transparent w-0 h-0" />
              </div>
            </div>

          </div>
        </div>
      </aside>

      <div 
        onMouseDown={() => setIsDragging(true)}
        className={cn(
          "w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary transition-colors relative shrink-0",
          isDragging && "bg-primary",
          isCollapsed && "w-0"
        )}
      >
        {isCollapsed && (
          <button 
            onClick={toggleSidebar}
            className="absolute left-2 top-4 p-2 bg-primary text-primary-foreground rounded-lg shadow-lg hover:scale-110 transition-transform z-50"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <main className="flex-1 flex flex-col min-w-0">
        <header className={cn(
          "h-16 border-b border-border flex items-center justify-between px-6 bg-background/80 backdrop-blur-sm shrink-0",
          isCollapsed && "pl-40"
        )}>
          <div className="flex items-center gap-4 flex-1 max-w-3xl">
            <div className="flex items-center gap-2 bg-accent/20 px-3 py-2 rounded-lg border border-border w-full">
              <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">RPC:</span>
              <input 
                type="text" 
                value={rpcUrl}
                onChange={(e) => setRpcUrl(e.target.value)} 
                className="bg-transparent border-none outline-none text-sm font-mono text-foreground w-full placeholder:text-muted-foreground/50 focus:border-primary/50"
                placeholder="Enter custom RPC URL"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isConnected ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-green-500/10 text-green-600 border border-green-500/20 px-4 py-2 rounded-lg text-sm font-medium">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="font-mono">{walletAddress}</span>
                </div>
                <button 
                  onClick={disconnectWallet}
                  className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                  title="Disconnect"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative group">
                <button 
                  onClick={connectWallet}
                  disabled={isLoading}
                  className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:shadow-md hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wallet className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">{isLoading ? "Connecting..." : "Connect Wallet"}</span>
                </button>
                
                {!hasAnyWallet && (
                  <div className="absolute right-0 top-full mt-2 w-72 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg text-xs text-orange-600 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    <p className="font-semibold mb-1">No wallet detected</p>
                    <p className="mb-2">Install a Solana wallet extension to continue:</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li>Phantom</li>
                      <li>Solflare</li>
                      <li>Backpack</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 bg-linear-to-br from-primary/5 via-background to-background">
          {children}
        </div>
      </main>
    </div>
  );
}